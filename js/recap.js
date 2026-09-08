/* Weekly Recap — the Monday-morning damage report. Card records, P&L,
   best win / worst beat, parlay near-misses, CLV, You vs Model — for one
   week or the whole season, with a copyable text summary. */

const Recap = {
  week: null, // null = latest week with bets
  mode: 'real', // 'real' | 'paper'

  scoped() {
    return Store.data.bets.filter(b => (b.mode || 'real') === this.mode);
  },

  weeksWithBets() {
    const weeks = [...new Set(this.scoped().map(b => b.week).filter(w => w))].sort((a, b) => a - b);
    return weeks;
  },

  betsFor(week) {
    return this.scoped().filter(b => week === 'season' ? true : b.week === week);
  },

  stats(week) {
    const bets = this.betsFor(week);
    const settled = bets.filter(b => b.status !== 'pending');
    const rec = list => Ledger.record(list);

    const ats = rec(bets.filter(b => b.category === 'card-ats'));
    const ml = rec(bets.filter(b => b.category === 'card-ml'));
    const exotic = bets.filter(b => b.category === 'parlay');
    const exoticRec = rec(exotic);

    let bestWin = null, worstLoss = null;
    for (const b of settled) {
      if (b.status === 'won' && (!bestWin || b.profit > bestWin.profit)) bestWin = b;
      if (b.status === 'lost' && (!worstLoss || b.stake > worstLoss.stake)) worstLoss = b;
    }

    let nearMiss = null;
    for (const p of exotic) {
      if (p.status !== 'lost' || !p.legs) continue;
      const hit = p.legs.filter(l => l.status === 'won').length;
      if (p.legs.length >= 3 && (!nearMiss || hit / p.legs.length > nearMiss.hit / nearMiss.total)) {
        nearMiss = { hit, total: p.legs.length, bet: p };
      }
    }

    const flipped = settled.filter(b => b.source === 'user' && (b.type === 'ats' || b.type === 'ml'));
    const you = rec(flipped);
    const model = { w: you.l, l: you.w, p: you.p };

    const clvPts = settled.filter(b => b.clvKind === 'pts');
    const avgClv = clvPts.length ? clvPts.reduce((s, b) => s + b.clv, 0) / clvPts.length : null;

    const favBets = settled.filter(b =>
      App.isFavGame(b) || (b.legs || []).some(l => App.isFavGame(l)));
    const favRec = rec(favBets);

    return {
      bets, settled,
      staked: bets.reduce((s, b) => s + b.stake, 0),
      net: settled.reduce((s, b) => s + (b.profit || 0), 0),
      pending: bets.length - settled.length,
      ats, ml, exotic, exoticRec,
      bestWin, worstLoss, nearMiss,
      you, model, flippedCount: flipped.length,
      avgClv, favRec, favCount: favBets.length,
    };
  },

  describeBet(b) {
    if (!b) return '—';
    if (b.type === 'parlay' || b.type === 'teaser') return b.pick;
    const pt = b.type === 'ats' ? ' ' + (b.point > 0 ? '+' : '') + b.point : '';
    return `${App.short(b.pick)}${pt} ${MMath.formatAmerican(b.price)}`;
  },

  summaryText(week, s) {
    const wk = week === 'season' ? 'Season to date' : 'Week ' + week;
    const lines = [
      `🏈 Provini’s Palace — ${wk} recap${this.mode === 'paper' ? ' (📋 paper / accuracy test)' : ''}`,
      `Net: ${MMath.money(s.net)} on ${MMath.money(s.staked)} staked${s.pending ? ` (${s.pending} pending)` : ''}`,
      `ATS card: ${Ledger.fmtRecord(s.ats)} (${MMath.money(s.ats.profit)})`,
      `Straight up: ${Ledger.fmtRecord(s.ml)} (${MMath.money(s.ml.profit)})`,
      `Parlays/teasers: ${s.exoticRec.w}/${s.exotic.length} hit (${MMath.money(s.exoticRec.profit)})`,
    ];
    if (s.nearMiss) lines.push(`Closest lightning: ${s.nearMiss.hit}/${s.nearMiss.total} legs 😤`);
    if (s.bestWin) lines.push(`Best win: ${this.describeBet(s.bestWin)} (+${MMath.money(s.bestWin.profit).slice(1)})`);
    if (s.flippedCount) lines.push(`You vs Model: ${Ledger.fmtRecord(s.you)} vs ${Ledger.fmtRecord(s.model)} on flipped picks`);
    if (s.avgClv !== null) lines.push(`Avg CLV: ${(s.avgClv > 0 ? '+' : '') + s.avgClv.toFixed(2)} pts vs close`);
    if (s.favCount) lines.push(`${App.short(App.fav())} bets: ${Ledger.fmtRecord(s.favRec)} (${MMath.money(s.favRec.profit)})`);
    return lines.join('\n');
  },

  modeBar() {
    return `<div style="display:flex; gap:6px; margin-bottom:12px;">
      <button class="btn btn-sm ${this.mode === 'real' ? 'btn-primary' : ''}" data-recap-mode="real">💵 Real</button>
      <button class="btn btn-sm ${this.mode === 'paper' ? 'btn-primary' : ''}" data-recap-mode="paper">📋 Paper (accuracy test)</button>
    </div>`;
  },

  render() {
    const el = document.getElementById('tab-recap');

    if (!Store.data.bets.length) {
      el.innerHTML = `<div class="card"><div class="empty">
        No bets logged yet — the recap writes itself once you've got a week in the books.
      </div></div>`;
      return;
    }

    const weeks = this.weeksWithBets();
    if (!weeks.length) {
      el.innerHTML = `<div class="card"><h2>Recap</h2>${this.modeBar()}
        <div class="empty">No ${this.mode} bets yet.
        ${this.mode === 'paper' ? 'Hit “Paper-trade the card” on the Weekly Card to start an accuracy test.' : ''}</div></div>`;
      el.querySelectorAll('[data-recap-mode]').forEach(b => {
        b.onclick = () => { this.mode = b.dataset.recapMode; this.render(); };
      });
      return;
    }
    // keep the selected week valid for this mode
    if (this.week !== 'season' && !weeks.includes(this.week)) this.week = null;
    if (this.week === null) this.week = weeks[weeks.length - 1];
    const s = this.stats(this.week);
    const wkLabel = this.week === 'season' ? 'Season to date' : 'Week ' + this.week;

    const opts = weeks.map(w =>
      `<option value="${w}" ${this.week === w ? 'selected' : ''}>Week ${w}</option>`).join('')
      + `<option value="season" ${this.week === 'season' ? 'selected' : ''}>Season to date</option>`;

    const tile = (label, value, sub, cls) => `
      <div class="tile"><div class="t-label">${label}</div>
        <div class="t-value ${cls || ''}">${value}</div>
        <div class="t-sub">${sub || ''}</div></div>`;

    el.innerHTML = `
      <div class="hero"><span class="hero-ball">🏈</span>
        <div class="hero-kicker">The damage report</div>
        <div class="hero-line">${wkLabel}</div>
        <div class="hero-sub">${s.bets.length} bets · ${MMath.money(s.staked)} staked${s.pending ? ` · ${s.pending} still pending` : ''}</div>
        <div class="hero-take ${s.net >= 0 ? 'pos' : 'neg'}">
          ${s.net >= 0 ? '📈 Up ' + MMath.money(s.net) : '📉 Down ' + MMath.money(Math.abs(s.net))}
          ${s.net >= 0 ? '— cash it and act like you\'ve been here.' : '— the vig never sleeps. CLV tells the real story below.'}</div>
      </div>

      <div class="card">
        <h2>Recap</h2>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
          <label>Show <select id="recap-week">${opts}</select></label>
          <button class="btn btn-sm ${this.mode === 'real' ? 'btn-primary' : ''}" data-recap-mode="real">💵 Real</button>
          <button class="btn btn-sm ${this.mode === 'paper' ? 'btn-primary' : ''}" data-recap-mode="paper">📋 Paper</button>
          <button class="btn btn-sm" id="btn-copy-recap">📋 Copy text recap</button>
        </div>
        <div class="tiles">
          ${tile('Net P&L', MMath.money(s.net), MMath.money(s.staked) + ' staked', s.net >= 0 ? 'pos' : 'neg')}
          ${tile('ATS card', Ledger.fmtRecord(s.ats), MMath.money(s.ats.profit))}
          ${tile('Straight up', Ledger.fmtRecord(s.ml), MMath.money(s.ml.profit))}
          ${tile('Lightning', `${s.exoticRec.w}/${s.exotic.length}`, s.nearMiss ? `closest: ${s.nearMiss.hit}/${s.nearMiss.total} legs` : MMath.money(s.exoticRec.profit))}
          ${tile('Best win', this.describeBet(s.bestWin), s.bestWin ? '+' + MMath.money(s.bestWin.profit).slice(1) : '')}
          ${tile('You vs Model', s.flippedCount ? Ledger.fmtRecord(s.you) + ' <span class="muted small">vs</span> ' + Ledger.fmtRecord(s.model) : '—',
            s.flippedCount ? 'on flipped picks' : 'no flips this week')}
          ${tile('Avg CLV', s.avgClv === null ? '—' : (s.avgClv > 0 ? '+' : '') + s.avgClv.toFixed(2) + ' pts',
            'beat the close = real edge', s.avgClv > 0 ? 'pos' : s.avgClv < 0 ? 'neg' : '')}
          ${tile('🏈 ' + App.short(App.fav()), s.favCount ? Ledger.fmtRecord(s.favRec) : '—',
            s.favCount ? MMath.money(s.favRec.profit) + ' with the heart' : 'no Big Blue action')}
        </div>
        <h3>Copy-ready summary</h3>
        <pre id="recap-text" style="background:var(--page); border:1px solid var(--border); border-radius:8px; padding:12px; white-space:pre-wrap; font-family:var(--font); color:var(--ink-2); font-size:13px;">${this.summaryText(this.week, s)}</pre>
      </div>`;

    document.getElementById('recap-week').onchange = e => {
      this.week = e.target.value === 'season' ? 'season' : Number(e.target.value);
      this.render();
    };
    el.querySelectorAll('[data-recap-mode]').forEach(b => {
      b.onclick = () => { this.mode = b.dataset.recapMode; this.render(); };
    });
    document.getElementById('btn-copy-recap').onclick = async () => {
      const text = document.getElementById('recap-text').textContent;
      try {
        await navigator.clipboard.writeText(text);
        App.banner('Recap copied — paste it in the group chat. 📋', 'good');
      } catch (e) {
        App.banner('Copy blocked by the browser — select the text and copy manually.', 'warn');
      }
    };
  },
};
