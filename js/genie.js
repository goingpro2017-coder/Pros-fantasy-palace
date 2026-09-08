/* Ask the Genie — a request box + quick buttons that COMPUTE answers from
   the app's own model (no external AI, no key, works offline). Understands
   plain requests like "strongest 5 leg parlay", "safest pick", "best
   value", "biggest edges", "best giants bet" via local keyword matching,
   and can drop results straight into the Lightning Lab or paper-trade them. */

const Genie = {
  lastResult: null,

  /* Build the model's view of every upcoming game once. */
  picks() {
    const events = Card.upcomingEvents();
    const ats = [], ml = [];
    for (const ev of events) {
      const a = Card.analyze(ev);
      if (a.ats) {
        const cover = a.ats.coverProb; // model chance this side covers
        ats.push({
          ev, team: a.ats.pickTeam, point: a.ats.point, price: a.ats.price,
          book: a.ats.book, edge: a.ats.edge, cover,
          fairProb: Api.fairProb(ev, a.ats.book, 'spreads', a.ats.pickTeam) || cover,
          label: `${App.short(a.ats.pickTeam)} ${(a.ats.point > 0 ? '+' : '') + a.ats.point}`,
        });
      }
      if (a.ml && a.ml.value !== null) {
        ml.push({
          ev, team: a.ml.pickTeam, price: a.ml.price, book: a.ml.book,
          value: a.ml.value, modelProb: a.ml.modelProbOfPick, fairProb: a.ml.fairProb,
          label: `${App.short(a.ml.pickTeam)} to win`,
        });
      }
    }
    return { ats, ml };
  },

  legFrom(p) {
    return {
      id: Store.newId(), eventId: p.ev.id, kickoff: p.ev.commence_time,
      home: p.ev.home_team, away: p.ev.away_team,
      market: 'spreads', name: p.team, point: p.point, price: p.price,
      fairProb: p.fairProb,
      label: `${App.short(p.team)} ${(p.point > 0 ? '+' : '') + p.point}`,
      custom: false,
    };
  },

  /* "Strongest" = the N spread picks the model is most confident cover. */
  strongestParlay(n) {
    const ats = this.picks().ats.slice().sort((a, b) => b.cover - a.cover);
    const chosen = ats.slice(0, Math.max(2, Math.min(n, ats.length)));
    if (chosen.length < 2) return { error: 'Not enough games loaded to build a parlay. Hit Refresh odds first.' };
    const legs = chosen.map(p => this.legFrom(p));
    const combined = MMath.parlay(legs);
    return {
      kind: 'parlay', n: chosen.length, chosen, legs, combined,
      title: `Strongest ${chosen.length}-leg parlay`,
      blurb: `The ${chosen.length} spread picks the model is most confident about, stacked together.`,
    };
  },

  safestPick() {
    const ats = this.picks().ats.slice().sort((a, b) => b.cover - a.cover);
    if (!ats.length) return { error: 'No games loaded — hit Refresh odds first.' };
    return { kind: 'single', pick: ats[0], title: 'Safest single pick',
      blurb: 'The one spread bet the model likes most this week.' };
  },

  biggestEdges(n) {
    const ats = this.picks().ats.slice().sort((a, b) => b.edge - a.edge).slice(0, n || 5);
    if (!ats.length) return { error: 'No games loaded — hit Refresh odds first.' };
    return { kind: 'list', list: ats, title: `Biggest edges this week`,
      blurb: 'Where the app disagrees with Vegas the most — its strongest opinions.' };
  },

  bestValue(n) {
    const ml = this.picks().ml.filter(m => m.value > 0).sort((a, b) => b.value - a.value).slice(0, n || 5);
    if (!ml.length) return { error: 'No "value" moneylines this week — the prices are all fair or against you.' };
    return { kind: 'value', list: ml, title: 'Best value bets (who-wins)',
      blurb: 'Teams the app thinks win more often than the price implies — the good deals.' };
  },

  favBet() {
    const fav = App.fav();
    const ats = this.picks().ats;
    const p = ats.find(x => App.isFavGame(x.ev));
    if (!p) return { error: `No ${App.short(fav)} game in the current slate.` };
    return { kind: 'single', pick: p, title: `Best ${App.short(fav)} bet`,
      blurb: `The app's pick on your team's game.` };
  },

  /* Local "understanding" — map a plain request to a computation. */
  ask(text) {
    const t = (text || '').toLowerCase();
    const numMatch = t.match(/(\d+)\s*(?:leg|pick|team|game)/) || t.match(/\b([2-8])\b/);
    const n = numMatch ? parseInt(numMatch[1], 10) : null;

    let res;
    if (/parlay|combo|legs|stack/.test(t)) res = this.strongestParlay(n || 4);
    else if (/safe|surest|lock|best single|best pick|strongest pick/.test(t)) res = this.safestPick();
    else if (/value|good deal|underdog|dog|worth/.test(t)) res = this.bestValue(n || 5);
    else if (/edge|disagree|strongest|confident|best bets|top/.test(t)) res = this.biggestEdges(n || 5);
    else if (/giant|big blue|my team|fav/.test(t)) res = this.favBet();
    else if (n && /\b([2-8])\b/.test(t)) res = this.strongestParlay(n);
    else res = { help: true };

    this.lastResult = res;
    this.renderResult(res);
  },

  /* ---------- rendering ---------- */

  render() {
    const el = document.getElementById('tab-genie');
    if (!Store.data.oddsCache) {
      el.innerHTML = `<div class="card"><div class="empty">
        No games loaded yet. Add your key in <b>Settings</b> and hit <b>↻ Refresh odds</b> first.
      </div></div>`;
      return;
    }
    const quick = [
      ['Strongest 4-leg parlay', 'strongest 4 leg parlay'],
      ['Strongest 6-leg parlay', 'strongest 6 leg parlay'],
      ['Safest single pick', 'safest pick'],
      ['Biggest edges', 'biggest edges'],
      ['Best value bets', 'best value'],
      [`Best ${App.short(App.fav())} bet`, 'best giants bet'],
    ].map(([label, q]) => `<button class="btn btn-sm genie-q" data-q="${q}">${label}</button>`).join('');

    el.innerHTML = `
      <div class="hero"><img class="hero-avatar" src="icon-512.png" alt="">
        <div class="hero-kicker">Ask the Genie</div>
        <div class="hero-line">Your wish, computed</div>
        <div class="hero-sub">Ask for picks in plain words — the Genie builds the answer from the app's model. No typing required; tap a button below.</div>
      </div>
      <div class="card">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <input type="text" id="genie-input" placeholder="e.g. strongest 5 leg parlay" style="flex:1; min-width:200px;">
          <button class="btn btn-primary" id="genie-go">🧞 Ask</button>
        </div>
        <div class="leg-buttons">${quick}</div>
        <div id="genie-result" style="margin-top:16px"></div>
      </div>`;

    const go = () => this.ask(document.getElementById('genie-input').value);
    document.getElementById('genie-go').onclick = go;
    document.getElementById('genie-input').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    el.querySelectorAll('.genie-q').forEach(b => b.onclick = () => {
      document.getElementById('genie-input').value = b.dataset.q;
      this.ask(b.dataset.q);
    });
    if (this.lastResult) this.renderResult(this.lastResult);
  },

  pickLine(p) {
    return `<div class="genie-pick">
      <b>${p.label}</b> <span class="muted">${MMath.formatAmerican(p.price)} @ ${App.bookName(p.book)}</span>
      <span class="muted small"> · ${App.short(p.ev.away_team)} @ ${App.short(p.ev.home_team)}</span>
      ${p.cover !== undefined ? `<span class="pill ${p.edge >= 2 ? 'good' : ''}">${MMath.pct(p.cover, 0)} to hit</span>` : ''}
      ${p.value !== undefined ? `<span class="pill good">value +${(p.value * 100).toFixed(0)}%</span>` : ''}
    </div>`;
  },

  renderResult(res) {
    const box = document.getElementById('genie-result');
    if (!box) return;

    if (res.help) {
      box.innerHTML = `<div class="corr-note">🧞 Try: <b>"strongest 4 leg parlay"</b>, <b>"safest pick"</b>,
        <b>"best value"</b>, <b>"biggest edges"</b>, or <b>"best ${App.short(App.fav())} bet"</b> — or just tap a button above.</div>`;
      return;
    }
    if (res.error) { box.innerHTML = `<div class="corr-note bad">🧞 ${res.error}</div>`; return; }

    let body = `<h3>${res.title}</h3><p class="sub">${res.blurb}</p>`;

    if (res.kind === 'parlay') {
      body += res.chosen.map(p => this.pickLine(p)).join('');
      const c = res.combined;
      const oneIn = c.trueProb > 0 ? Math.round(1 / c.trueProb) : Infinity;
      const win = MMath.money(1 * (c.decimal - 1));
      body += `<div class="parlay-stats" style="margin-top:12px">
        <div class="tile"><div class="t-label">If all hit, $1 pays</div><div class="t-value pos">${MMath.money(c.decimal)}</div><div class="t-sub">${win} profit</div></div>
        <div class="tile"><div class="t-label">Combined odds</div><div class="t-value">${MMath.formatAmerican(c.american)}</div></div>
        <div class="tile"><div class="t-label">Real chance all hit</div><div class="t-value">~1 in ${oneIn}</div><div class="t-sub">${MMath.pct(c.trueProb, 1)} — long shot</div></div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px">
        <button class="btn btn-primary" data-genie-send>➡ Open in Lightning Lab</button>
        <button class="btn" data-genie-paper>📋 Paper-trade it ($1)</button>
      </div>
      <p class="sub" style="margin-top:8px">Reminder: even the "strongest" parlay is a long shot — that's the nature of stacking bets. Keep it a $1 fun ticket.</p>`;
    } else if (res.kind === 'single') {
      body += this.pickLine(res.pick);
      body += `<p class="sub" style="margin-top:8px">This is a single bet — put it on the Weekly Card, or build a parlay around it.</p>`;
    } else if (res.kind === 'list') {
      body += res.list.map(p => this.pickLine(p)).join('');
    } else if (res.kind === 'value') {
      body += res.list.map(p => this.pickLine(p)).join('');
      body += `<p class="sub" style="margin-top:8px">"Value" = the app thinks these win more often than their price implies.</p>`;
    }

    box.innerHTML = body;

    const send = box.querySelector('[data-genie-send]');
    if (send) send.onclick = () => {
      Parlay.mode = 'parlay';
      Parlay.legs = res.legs.map(l => Object.assign({}, l, { id: Store.newId() }));
      App.showTab('lab');
      App.banner('🧞 Parlay sent to Lightning Lab — review it, then log it.', 'good');
    };
    const paper = box.querySelector('[data-genie-paper]');
    if (paper) paper.onclick = () => {
      Parlay.legs = res.legs.map(l => Object.assign({}, l, { id: Store.newId() }));
      Parlay.paper = true;
      Parlay.stake = 1;
      Parlay.logTicket(res.combined);
      App.banner('🧞 Paper parlay logged — check the Ledger\'s 📋 Paper filter after the games.', 'good');
    };
  },
};
