/* Weekly Card — $1 ATS + $1 moneyline on every game of the week.
   Model makes the picks; you can flip any of them before locking.
   "You vs model" is tracked in the Ledger. */

const Card = {
  flips: {}, // eventId -> { ats: bool, ml: bool } user disagreement with the model

  upcomingEvents() {
    const cache = Store.data.oddsCache;
    if (!cache) return [];
    const now = Date.now();
    const horizon = now + 8 * 864e5;
    return cache.events
      .filter(ev => {
        const t = Date.parse(ev.commence_time);
        return t > now && t < horizon;
      })
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
  },

  /* Model + market view of one event. */
  analyze(ev) {
    const model = Elo.predict(ev.home_team, ev.away_team);
    const primary = Store.data.settings.primaryBook;

    // market spread: home team's point at the primary book (fallback other book)
    const homeSpreadO = Api.outcomeAny(ev, 'spreads', ev.home_team);
    const marketSpread = homeSpreadO ? homeSpreadO.point : null;

    let ats = null;
    if (marketSpread !== null) {
      // edge for the HOME side = market line minus model line
      const homeEdge = marketSpread - model.homeSpread;
      const pickHome = homeEdge > 0;
      const modelPickTeam = pickHome ? ev.home_team : ev.away_team;
      const flipped = this.flips[ev.id] && this.flips[ev.id].ats;
      const pickTeam = flipped
        ? (modelPickTeam === ev.home_team ? ev.away_team : ev.home_team)
        : modelPickTeam;
      const best = Api.bestSpread(ev, pickTeam);
      ats = {
        modelPickTeam,
        pickTeam,
        flipped: !!flipped,
        edge: Math.abs(homeEdge),
        coverProb: MMath.coverProb(Math.abs(homeEdge)),
        point: best ? best.point : (pickTeam === ev.home_team ? marketSpread : -marketSpread),
        price: best ? best.price : -110,
        book: best ? best.book : primary,
      };
    }

    // moneyline: model's predicted winner, plus a value check vs de-vigged market
    const modelWinner = model.homeWinProb >= 0.5 ? ev.home_team : ev.away_team;
    const modelWinProb = model.homeWinProb >= 0.5 ? model.homeWinProb : 1 - model.homeWinProb;
    const flippedMl = this.flips[ev.id] && this.flips[ev.id].ml;
    const mlPickTeam = flippedMl
      ? (modelWinner === ev.home_team ? ev.away_team : ev.home_team)
      : modelWinner;
    const mlBest = Api.bestOutcome(ev, 'h2h', mlPickTeam);
    const mlFair = Api.fairProb(ev, mlBest ? mlBest.book : primary, 'h2h', mlPickTeam);
    const pickModelProb = mlPickTeam === ev.home_team ? model.homeWinProb : 1 - model.homeWinProb;

    return {
      model,
      marketSpread,
      ats,
      ml: mlBest ? {
        modelWinner, modelWinProb,
        pickTeam: mlPickTeam,
        flipped: !!flippedMl,
        price: mlBest.price,
        book: mlBest.book,
        fairProb: mlFair,
        modelProbOfPick: pickModelProb,
        value: mlFair !== null ? pickModelProb - mlFair : null,
      } : null,
    };
  },

  toggleFlip(eventId, kind) {
    this.flips[eventId] = this.flips[eventId] || {};
    this.flips[eventId][kind] = !this.flips[eventId][kind];
    this.render();
  },

  hasCardBet(eventId, category) {
    return Store.data.bets.some(b => b.eventId === eventId && b.category === category);
  },

  lockCard() {
    const events = this.upcomingEvents();
    let created = 0;
    for (const ev of events) {
      const a = this.analyze(ev);
      const base = {
        createdAt: Date.now(),
        week: App.weekOf(Date.parse(ev.commence_time)),
        eventId: ev.id,
        kickoff: ev.commence_time,
        home: ev.home_team,
        away: ev.away_team,
        stake: 1,
        status: 'pending',
      };
      if (a.ats && !this.hasCardBet(ev.id, 'card-ats')) {
        Store.data.bets.push(Object.assign({}, base, {
          id: Store.newId(),
          type: 'ats',
          category: 'card-ats',
          pick: a.ats.pickTeam,
          point: a.ats.point,
          price: a.ats.price,
          book: a.ats.book,
          source: a.ats.flipped ? 'user' : 'model',
          modelPick: a.ats.modelPickTeam,
        }));
        created++;
      }
      if (a.ml && !this.hasCardBet(ev.id, 'card-ml')) {
        Store.data.bets.push(Object.assign({}, base, {
          id: Store.newId(),
          type: 'ml',
          category: 'card-ml',
          pick: a.ml.pickTeam,
          point: null,
          price: a.ml.price,
          book: a.ml.book,
          source: a.ml.flipped ? 'user' : 'model',
          modelPick: a.ml.modelWinner,
        }));
        created++;
      }
    }
    Store.save();
    App.banner(created
      ? `Locked ${created} card bets ($${created} total). Place them at the listed books, then track them in the Ledger.`
      : 'Nothing new to lock — this week\'s card is already in the Ledger.',
      created ? 'good' : '');
    this.render();
    App.renderSpend();
  },

  render() {
    const el = document.getElementById('tab-card');
    const events = this.upcomingEvents();
    const cache = Store.data.oddsCache;

    if (!cache) {
      el.innerHTML = `<div class="card"><div class="empty">
        No odds loaded yet. Add your API key in <b>Settings</b>, then hit <b>↻ Refresh odds</b>.
      </div></div>`;
      return;
    }
    if (!events.length) {
      el.innerHTML = `<div class="card"><div class="empty">
        No upcoming games in the next 8 days. Refresh odds closer to game week.
      </div></div>`;
      return;
    }

    const allLocked = events.every(ev =>
      this.hasCardBet(ev.id, 'card-ats') && this.hasCardBet(ev.id, 'card-ml'));

    const rows = events.map(ev => this.renderGame(ev)).join('');
    const fetched = new Date(cache.fetchedAt).toLocaleString();

    el.innerHTML = `
      <div class="card">
        <h2>Weekly Card — ${events.length} games</h2>
        <p class="sub">$1 against the spread + $1 straight up on every game.
          Model picks shown; hit <b>flip</b> where your gut disagrees (tracked as You-vs-Model).
          Lines as of ${fetched}.</p>
        ${rows}
        <div style="margin-top:14px; display:flex; gap:10px; align-items:center;">
          <button class="btn btn-primary" id="btn-lock-card" ${allLocked ? 'disabled' : ''}>
            🔒 Lock this week's card (${events.length * 2} × $1)
          </button>
          ${allLocked ? '<span class="muted small">Card already locked — see Ledger.</span>' : ''}
        </div>
      </div>`;

    const btn = document.getElementById('btn-lock-card');
    if (btn) btn.onclick = () => this.lockCard();
    el.querySelectorAll('[data-flip]').forEach(b => {
      b.onclick = () => this.toggleFlip(b.dataset.event, b.dataset.flip);
    });
  },

  renderGame(ev) {
    const a = this.analyze(ev);
    const when = new Date(ev.commence_time)
      .toLocaleString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const total = Api.outcomeAny(ev, 'totals', 'Over');
    const locked = this.hasCardBet(ev.id, 'card-ats') || this.hasCardBet(ev.id, 'card-ml');

    const fmtSpread = p => (p > 0 ? '+' : '') + p;

    let atsBox = '<div class="pickbox muted">no spread posted</div>';
    if (a.ats) {
      const strength = a.ats.edge >= 2 ? 'good' : a.ats.edge >= 1 ? 'info' : '';
      atsBox = `
        <div class="pickbox ${a.ats.flipped ? 'flipped' : ''}">
          <div class="pb-head">ATS pick ${a.ats.flipped ? '<span class="tag-user">(you)</span>' : '<span class="tag-model">(model)</span>'}</div>
          <div class="pb-pick">${App.short(a.ats.pickTeam)} ${fmtSpread(a.ats.point)} <span class="muted">(${MMath.formatAmerican(a.ats.price)} @ ${App.bookName(a.ats.book)})</span></div>
          <div class="small">edge <span class="pill ${strength}">${a.ats.edge.toFixed(1)} pts</span>
            cover ~${MMath.pct(a.ats.flipped ? 1 - a.ats.coverProb : a.ats.coverProb, 0)}</div>
          ${locked ? '' : `<button class="btn btn-sm" style="margin-top:5px" data-flip="ats" data-event="${ev.id}">⇄ flip</button>`}
        </div>`;
    }

    let mlBox = '<div class="pickbox muted">no moneyline posted</div>';
    if (a.ml) {
      const valueTag = a.ml.value === null ? ''
        : a.ml.value > 0.02 ? '<span class="pill good">value</span>'
        : a.ml.value < -0.05 ? '<span class="pill warn">priced against you</span>'
        : '<span class="pill">fair price</span>';
      mlBox = `
        <div class="pickbox ${a.ml.flipped ? 'flipped' : ''}">
          <div class="pb-head">Straight up ${a.ml.flipped ? '<span class="tag-user">(you)</span>' : '<span class="tag-model">(model)</span>'}</div>
          <div class="pb-pick">${App.short(a.ml.pickTeam)} <span class="muted">(${MMath.formatAmerican(a.ml.price)} @ ${App.bookName(a.ml.book)})</span></div>
          <div class="small">model ${MMath.pct(a.ml.modelProbOfPick, 0)} vs market ${a.ml.fairProb !== null ? MMath.pct(a.ml.fairProb, 0) : '—'} ${valueTag}</div>
          ${locked ? '' : `<button class="btn btn-sm" style="margin-top:5px" data-flip="ml" data-event="${ev.id}">⇄ flip</button>`}
        </div>`;
    }

    return `
      <div class="game-row">
        <div>
          <div class="game-when">${when}</div>
          <div class="game-teams">${App.short(ev.away_team)} @ ${App.short(ev.home_team)}</div>
          <div class="game-mkt">
            line: ${a.marketSpread !== null ? App.short(ev.home_team) + ' ' + fmtSpread(a.marketSpread) : '—'}
            ${total ? ' · O/U ' + total.point : ''}<br>
            model: ${App.short(ev.home_team)} ${fmtSpread(Number(a.model.homeSpread.toFixed(1)))}
            · ${MMath.pct(a.model.homeWinProb, 0)} home
          </div>
        </div>
        <div>${atsBox}</div>
        <div>${mlBox}</div>
      </div>`;
  },
};
