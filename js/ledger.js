/* The Ledger — every bet tracked, graded, and judged.
   Auto-settles from final scores, computes closing line value (CLV),
   and keeps the season honest: You vs Model, category P&L, near-misses. */

const Ledger = {

  /* ---------- grading ---------- */

  gradeLeg(leg, game) {
    // game: completed /scores entry. Returns 'won' | 'lost' | 'push' | null.
    if (!game || !game.completed || !game.scores) return null;
    const hs = game.scores.find(s => s.name === game.home_team);
    const as = game.scores.find(s => s.name === game.away_team);
    if (!hs || !as) return null;
    const homePts = Number(hs.score), awayPts = Number(as.score);

    if (leg.market === 'h2h' || leg.type === 'ml') {
      const pick = leg.name || leg.pick;
      const pickPts = pick === game.home_team ? homePts : awayPts;
      const otherPts = pick === game.home_team ? awayPts : homePts;
      return pickPts > otherPts ? 'won' : pickPts < otherPts ? 'lost' : 'push';
    }
    if (leg.market === 'spreads' || leg.type === 'ats') {
      const pick = leg.name || leg.pick;
      const pickPts = pick === game.home_team ? homePts : awayPts;
      const otherPts = pick === game.home_team ? awayPts : homePts;
      const adj = pickPts + leg.point - otherPts;
      return adj > 0 ? 'won' : adj < 0 ? 'lost' : 'push';
    }
    if (leg.market === 'totals' || leg.type === 'total') {
      const total = homePts + awayPts;
      const over = (leg.name || leg.pick) === 'Over';
      if (total === leg.point) return 'push';
      return (total > leg.point) === over ? 'won' : 'lost';
    }
    return null; // custom — manual only
  },

  profitFor(bet, status) {
    if (status === 'won') return bet.stake * (MMath.americanToDecimal(bet.price) - 1);
    if (status === 'push') return 0;
    return -bet.stake;
  },

  /* Settle everything possible from a /scores payload. Returns count settled. */
  settleFromScores(games) {
    const byId = {};
    for (const g of games) byId[g.id] = g;
    let settled = 0;

    for (const bet of Store.data.bets) {
      if (bet.status !== 'pending') continue;

      if (bet.type === 'parlay') {
        let changed = false;
        for (const leg of bet.legs) {
          if (leg.status !== 'pending' || leg.custom || !leg.eventId) continue;
          const r = this.gradeLeg(leg, byId[leg.eventId]);
          if (r) { leg.status = r; changed = true; }
        }
        if (changed || bet.legs.some(l => l.status !== 'pending')) {
          this.resolveParlay(bet);
          if (bet.status !== 'pending') settled++;
        }
        continue;
      }

      const game = byId[bet.eventId];
      const r = this.gradeLeg(bet, game);
      if (r) {
        bet.status = r;
        bet.settledAt = Date.now();
        bet.profit = this.profitFor(bet, r);
        this.computeClv(bet);
        settled++;
      }
    }
    Store.save();
    return settled;
  },

  /* A parlay resolves as lost on any lost leg; as won when every leg is
     won or push (pushed legs drop out of the payout). */
  resolveParlay(bet) {
    if (bet.legs.some(l => l.status === 'lost')) {
      bet.status = 'lost';
      bet.settledAt = Date.now();
      bet.profit = -bet.stake;
      return;
    }
    if (bet.legs.every(l => l.status === 'won' || l.status === 'push')) {
      // remove pushed legs from the combined price
      let dec = MMath.americanToDecimal(bet.price);
      for (const l of bet.legs) {
        if (l.status === 'push') dec /= MMath.americanToDecimal(l.price);
      }
      if (bet.legs.every(l => l.status === 'push')) { bet.status = 'push'; bet.profit = 0; }
      else { bet.status = 'won'; bet.profit = bet.stake * (dec - 1); }
      bet.settledAt = Date.now();
    }
  },

  manualSettle(betId, status) {
    const bet = Store.data.bets.find(b => b.id === betId);
    if (!bet) return;
    bet.status = status;
    bet.settledAt = Date.now();
    bet.profit = bet.type === 'parlay' && status === 'won'
      ? bet.stake * (MMath.americanToDecimal(bet.price) - 1)
      : this.profitFor(bet, status);
    if (bet.type !== 'parlay') this.computeClv(bet);
    Store.save();
    this.render();
    App.renderSpend();
  },

  manualSettleLeg(betId, legIdx, status) {
    const bet = Store.data.bets.find(b => b.id === betId);
    if (!bet || !bet.legs || !bet.legs[legIdx]) return;
    bet.legs[legIdx].status = status;
    this.resolveParlay(bet);
    Store.save();
    this.render();
  },

  deleteBet(betId) {
    Store.data.bets = Store.data.bets.filter(b => b.id !== betId);
    Store.save();
    this.render();
    App.renderSpend();
  },

  /* ---------- closing line value ---------- */

  computeClv(bet) {
    const snap = Store.data.closing[bet.eventId];
    if (!snap) return;
    const ev = snap.event;
    const market = bet.type === 'ats' ? 'spreads' : bet.type === 'ml' ? 'h2h' : bet.type === 'total' ? 'totals' : null;
    if (!market) return;
    const m = Api.market(ev, bet.book, market) || Api.market(ev, Store.data.settings.primaryBook, market);
    const o = m && (m.outcomes || []).find(x => x.name === bet.pick);
    if (!o) return;
    if (market === 'spreads' || market === 'totals') {
      // points of line value vs close (positive = you beat the close)
      const sign = (market === 'totals' && bet.pick === 'Over') ? -1 : 1;
      bet.clv = sign * (bet.point - o.point);
      bet.clvKind = 'pts';
    } else {
      // moneyline: implied-probability edge vs close
      bet.clv = MMath.americanToImplied(o.price) - MMath.americanToImplied(bet.price);
      bet.clvKind = 'prob';
    }
  },

  /* ---------- stats ---------- */

  record(bets) {
    const r = { w: 0, l: 0, p: 0, profit: 0 };
    for (const b of bets) {
      if (b.status === 'won') r.w++;
      else if (b.status === 'lost') r.l++;
      else if (b.status === 'push') r.p++;
      if (b.status !== 'pending') r.profit += b.profit || 0;
    }
    return r;
  },

  fmtRecord(r) { return `${r.w}–${r.l}${r.p ? '–' + r.p : ''}`; },

  stats() {
    const bets = Store.data.bets;
    const settled = bets.filter(b => b.status !== 'pending');
    const ats = bets.filter(b => b.category === 'card-ats');
    const ml = bets.filter(b => b.category === 'card-ml');
    const parlays = bets.filter(b => b.category === 'parlay');

    // You vs Model on flipped picks: your result vs the mirror result
    const flipped = settled.filter(b => b.source === 'user' && (b.type === 'ats' || b.type === 'ml'));
    const you = this.record(flipped);
    const model = { w: you.l, l: you.w, p: you.p };

    // best near-miss parlay
    let nearMiss = null;
    for (const p of parlays) {
      if (p.status !== 'lost') continue;
      const hit = p.legs.filter(l => l.status === 'won').length;
      if (!nearMiss || hit / p.legs.length > nearMiss.hit / nearMiss.total) {
        nearMiss = { hit, total: p.legs.length };
      }
    }

    // bets involving the user's team (singles on their game, parlays with a leg in it)
    const fav = App.fav();
    const favBets = bets.filter(b =>
      App.isFavGame(b) || (b.legs || []).some(l => App.isFavGame(l)));
    const favRec = this.record(favBets);

    // average CLV over singles that have it
    const clvPts = settled.filter(b => b.clvKind === 'pts');
    const avgClv = clvPts.length
      ? clvPts.reduce((s, b) => s + b.clv, 0) / clvPts.length : null;

    return {
      net: settled.reduce((s, b) => s + (b.profit || 0), 0),
      staked: bets.reduce((s, b) => s + b.stake, 0),
      pending: bets.filter(b => b.status === 'pending').length,
      ats: this.record(ats),
      ml: this.record(ml),
      parlays: this.record(parlays),
      parlayCount: parlays.length,
      nearMiss, you, model, flippedCount: flipped.length, avgClv,
      fav, favRec, favCount: favBets.length,
    };
  },

  /* ---------- chart ---------- */

  SERIES: [
    { key: 'card-ats', label: 'ATS card', color: 'var(--series-1)', hex: '#5b8ee8' },
    { key: 'card-ml', label: 'ML card', color: 'var(--series-2)', hex: '#d9535f' },
    { key: 'parlay', label: 'Parlays', color: 'var(--series-3)', hex: '#2aa79c' },
  ],

  chartData() {
    const out = [];
    for (const s of this.SERIES) {
      const bets = Store.data.bets
        .filter(b => b.category === s.key && b.status !== 'pending')
        .sort((a, b) => (a.settledAt || a.createdAt) - (b.settledAt || b.createdAt));
      let cum = 0;
      const pts = bets.map(b => {
        cum += b.profit || 0;
        return { t: b.settledAt || b.createdAt, v: cum, bet: b };
      });
      if (pts.length) out.push({ series: s, pts });
    }
    return out;
  },

  renderChart(data) {
    const W = 720, H = 220, padL = 44, padR = 90, padT = 12, padB = 24;
    const allPts = data.flatMap(d => d.pts);
    const t0 = Math.min(...allPts.map(p => p.t));
    const t1 = Math.max(...allPts.map(p => p.t));
    const v0 = Math.min(0, ...allPts.map(p => p.v));
    const v1 = Math.max(0, ...allPts.map(p => p.v));
    const span = Math.max(v1 - v0, 1);
    const x = t => t1 === t0 ? padL + (W - padL - padR) / 2
      : padL + (t - t0) / (t1 - t0) * (W - padL - padR);
    const y = v => padT + (1 - (v - v0) / span) * (H - padT - padB);

    // gridlines: zero + min/max
    const yTicks = [...new Set([0, v0, v1])];
    const grid = yTicks.map(v => `
      <line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"
        stroke="${v === 0 ? 'var(--baseline)' : 'var(--grid)'}" stroke-width="1"/>
      <text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10"
        fill="var(--muted)">${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(0)}</text>`).join('');

    const lines = data.map(d => {
      const path = d.pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
      const last = d.pts[d.pts.length - 1];
      // keep the end label inside the plot: flip it to the left of the dot
      // when the line ends close to the right edge
      const flip = x(last.t) > W - padR - 20;
      return `
        <path d="${path}" fill="none" stroke="${d.series.color}" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(last.t)}" cy="${y(last.v)}" r="3" fill="${d.series.color}"/>
        <text x="${x(last.t) + (flip ? -7 : 7)}" y="${y(last.v) + 4}" font-size="11" font-weight="600"
          text-anchor="${flip ? 'end' : 'start'}" fill="var(--ink-2)">${d.series.label} ${MMath.money(last.v)}</text>`;
    }).join('');

    const legend = data.map(d => `
      <span><span class="swatch" style="background:${d.series.color}"></span>${d.series.label}</span>`).join('');

    return `
      <div class="chart-box" id="pl-chart" data-t0="${t0}" data-t1="${t1}">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative profit and loss by bet category">
          ${grid}${lines}
          <rect id="pl-hover" x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}"
            fill="transparent"/>
        </svg>
        <div class="chart-legend">${legend}</div>
      </div>`;
  },

  wireChart(data) {
    const box = document.getElementById('pl-chart');
    if (!box) return;
    const svg = box.querySelector('svg');
    const tip = document.getElementById('tooltip');
    const allPts = data.flatMap(d => d.pts.map(p => Object.assign({ series: d.series }, p)));

    svg.addEventListener('mousemove', e => {
      const rect = svg.getBoundingClientRect();
      const W = 720, padL = 44, padR = 90;
      const t0 = +box.dataset.t0, t1 = +box.dataset.t1;
      const mx = (e.clientX - rect.left) / rect.width * W;
      const t = t1 === t0 ? t0 : t0 + (mx - padL) / (W - padL - padR) * (t1 - t0);
      let best = null;
      for (const p of allPts) {
        if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      }
      if (!best) return;
      const b = best.bet;
      tip.innerHTML = `
        <div class="tt-title">${new Date(best.t).toLocaleDateString()} · ${best.series.label}</div>
        <div>${b.pick}${b.point !== null && b.point !== undefined && b.type === 'ats' ? ' ' + (b.point > 0 ? '+' : '') + b.point : ''}
          — ${b.status} ${MMath.money(b.profit || 0)}</div>
        <div>running total: <b>${MMath.money(best.v)}</b></div>`;
      tip.hidden = false;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 280) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    });
    svg.addEventListener('mouseleave', () => { tip.hidden = true; });
  },

  /* ---------- render ---------- */

  render() {
    const el = document.getElementById('tab-ledger');
    const s = this.stats();
    const bets = [...Store.data.bets].sort((a, b) => b.createdAt - a.createdAt);

    const tiles = `
      <div class="tiles">
        <div class="tile"><div class="t-label">Net P&amp;L</div>
          <div class="t-value ${s.net >= 0 ? 'pos' : 'neg'}">${MMath.money(s.net)}</div>
          <div class="t-sub">${MMath.money(s.staked)} staked · ${s.pending} pending</div></div>
        <div class="tile"><div class="t-label">ATS card</div>
          <div class="t-value">${this.fmtRecord(s.ats)}</div>
          <div class="t-sub">${MMath.money(s.ats.profit)} · need 52.4% to profit</div></div>
        <div class="tile"><div class="t-label">Straight up card</div>
          <div class="t-value">${this.fmtRecord(s.ml)}</div>
          <div class="t-sub">${MMath.money(s.ml.profit)}</div></div>
        <div class="tile"><div class="t-label">Parlays</div>
          <div class="t-value">${s.parlays.w}/${s.parlayCount}</div>
          <div class="t-sub">${s.nearMiss ? 'closest call: ' + s.nearMiss.hit + '/' + s.nearMiss.total + ' legs' : MMath.money(s.parlays.profit)}</div></div>
        <div class="tile"><div class="t-label">You vs Model</div>
          <div class="t-value">${s.flippedCount ? this.fmtRecord(s.you) + ' <span class="muted small">vs</span> ' + this.fmtRecord(s.model) : '—'}</div>
          <div class="t-sub">${s.flippedCount ? 'on your ' + s.flippedCount + ' flipped picks' : 'flip a pick on the card to start the duel'}</div></div>
        <div class="tile fav-tile"><div class="t-label">🏈 ${App.short(s.fav)} bets</div>
          <div class="t-value">${s.favCount ? this.fmtRecord(s.favRec) : '—'}</div>
          <div class="t-sub">${s.favCount ? MMath.money(s.favRec.profit) + ' betting with your heart' : 'no ' + App.short(s.fav) + ' action yet'}</div></div>
        <div class="tile"><div class="t-label">Avg CLV (spread)</div>
          <div class="t-value ${s.avgClv > 0 ? 'pos' : s.avgClv < 0 ? 'neg' : ''}">${s.avgClv === null ? '—' : (s.avgClv > 0 ? '+' : '') + s.avgClv.toFixed(2) + ' pts'}</div>
          <div class="t-sub">beat the close = real edge</div></div>
      </div>`;

    const data = this.chartData();
    const chart = data.length && data.some(d => d.pts.length >= 2)
      ? `<div class="card"><h2>Season P&amp;L</h2>
           <p class="sub">Cumulative profit by category. Hover for the bet behind each step.</p>
           ${this.renderChart(data)}</div>`
      : '';

    const rows = bets.map(b => this.renderBetRow(b)).join('');
    const table = bets.length ? `
      <div class="card">
        <h2>All bets (${bets.length})</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr>
              <th>Placed</th><th>Wk</th><th>Bet</th><th>Book</th>
              <th class="num">Odds</th><th class="num">Stake</th>
              <th>Status</th><th class="num">P&amp;L</th><th class="num">CLV</th><th></th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>` : `
      <div class="card"><div class="empty">No bets logged yet.
        Lock a Weekly Card or log a Lightning Lab ticket to get started.</div></div>`;

    el.innerHTML = tiles + chart + table;

    if (chart) this.wireChart(data);
    el.querySelectorAll('[data-settle]').forEach(b => {
      b.onclick = () => this.manualSettle(b.dataset.bet, b.dataset.settle);
    });
    el.querySelectorAll('[data-legsettle]').forEach(b => {
      b.onclick = () => this.manualSettleLeg(b.dataset.bet, +b.dataset.leg, b.dataset.legsettle);
    });
    el.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => { if (confirm('Delete this bet?')) this.deleteBet(b.dataset.del); };
    });
  },

  renderBetRow(b) {
    const date = new Date(b.createdAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
    const statusPill = {
      pending: '<span class="pill">pending</span>',
      won: '<span class="pill good">won</span>',
      lost: '<span class="pill bad">lost</span>',
      push: '<span class="pill push">push</span>',
    }[b.status] || b.status;

    let desc;
    if (b.type === 'parlay') {
      const legs = b.legs.map((l, i) => {
        const mark = l.status === 'won' ? '✓' : l.status === 'lost' ? '✗' : l.status === 'push' ? '≈' : '·';
        const cls = l.status === 'won' ? 'pos' : l.status === 'lost' ? 'neg' : 'muted';
        const manual = (l.custom && l.status === 'pending' && b.status === 'pending')
          ? ` <button class="btn btn-sm" data-legsettle="won" data-bet="${b.id}" data-leg="${i}">✓</button>
              <button class="btn btn-sm" data-legsettle="lost" data-bet="${b.id}" data-leg="${i}">✗</button>`
          : '';
        return `<span class="${cls}">${mark}</span> ${l.label}${manual}`;
      }).join('<br>');
      desc = `<b>${b.pick}</b><div class="small" style="margin-top:3px">${legs}</div>`;
    } else {
      const pt = b.type === 'ats' ? ' ' + (b.point > 0 ? '+' : '') + b.point
        : b.type === 'total' ? ' ' + b.point : '';
      const kind = { ats: 'ATS', ml: 'ML', total: 'TOT' }[b.type] || b.type;
      const src = b.source === 'user' ? '<span class="tag-user small">you</span>' : '<span class="tag-model small">model</span>';
      const matchup = b.away ? `<span class="muted small">${App.short(b.away)} @ ${App.short(b.home)}</span>` : '';
      desc = `<span class="muted small">${kind}</span> <b>${App.short(b.pick)}${pt}</b> ${src}<br>${matchup}`;
    }

    const clv = b.clv === undefined ? '—'
      : b.clvKind === 'pts' ? (b.clv > 0 ? '+' : '') + b.clv.toFixed(1)
      : (b.clv > 0 ? '+' : '') + (b.clv * 100).toFixed(1) + '%';

    const manual = b.status === 'pending' ? `
      <button class="btn btn-sm" title="mark won" data-settle="won" data-bet="${b.id}">✓</button>
      <button class="btn btn-sm" title="mark lost" data-settle="lost" data-bet="${b.id}">✗</button>` : '';

    return `<tr>
      <td class="muted">${date}</td>
      <td class="muted">${b.week || '—'}</td>
      <td>${desc}</td>
      <td class="muted">${App.bookName(b.book)}</td>
      <td class="num">${MMath.formatAmerican(b.price)}</td>
      <td class="num">${MMath.money(b.stake)}</td>
      <td>${statusPill}</td>
      <td class="num ${b.profit > 0 ? 'pos' : b.profit < 0 ? 'neg' : ''}">${b.status === 'pending' ? '—' : MMath.money(b.profit || 0)}</td>
      <td class="num muted">${clv}</td>
      <td style="white-space:nowrap">${manual}
        <button class="btn btn-sm btn-danger" title="delete" data-del="${b.id}">🗑</button></td>
    </tr>`;
  },
};
