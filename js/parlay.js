/* Lightning Lab — long-shot builder: parlays (with player props and
   round robins) and teasers. True odds are de-vigged and independence-
   assumed; correlation notes flag where that's not quite true. */

const Parlay = {
  mode: 'parlay',          // 'parlay' | 'teaser'
  legs: [],                // parlay legs
  teaserLegs: [],          // teaser legs (spreads/totals only, original points)
  teasePts: 6,
  selectedEvent: null,
  propMarket: 'player_pass_yds',
  stake: 1,
  paper: false,            // log tickets as fake (paper) instead of real
  offeredOverride: '',     // book's actual quoted odds (SGP / teaser card)
  rrSizes: { 2: true, 3: false },
  rrStake: 1,

  /* Standard-ish teaser payout tables by teased points -> leg count.
     Books differ; paste the book's quote to override. */
  TEASER_ODDS: {
    6:   { 2: -134, 3: 140, 4: 240, 5: 400, 6: 600, 7: 900, 8: 1200 },
    6.5: { 2: -142, 3: 130, 4: 210, 5: 360, 6: 550, 7: 800, 8: 1150 },
    7:   { 2: -150, 3: 120, 4: 180, 5: 300, 6: 450, 7: 700, 8: 1000 },
  },

  events() {
    const cache = Store.data.oddsCache;
    if (!cache) return [];
    const now = Date.now();
    return cache.events
      .filter(ev => Date.parse(ev.commence_time) > now)
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
  },

  activeLegs() { return this.mode === 'teaser' ? this.teaserLegs : this.legs; },

  /* ---------- adding legs ---------- */

  addLeg(ev, market, name) {
    const o = Api.outcomeAny(ev, market, name);
    if (!o) { App.banner('That side isn\'t posted at your books right now.', 'warn'); return; }
    const fair = Api.fairProb(ev, o.book, market, name);
    const label = market === 'totals'
      ? `${name} ${o.point} — ${App.short(ev.away_team)} @ ${App.short(ev.home_team)}`
      : market === 'spreads'
        ? `${App.short(name)} ${(o.point > 0 ? '+' : '') + o.point}`
        : `${App.short(name)} ML`;
    this.legs.push({
      id: Store.newId(),
      eventId: ev.id, kickoff: ev.commence_time, home: ev.home_team, away: ev.away_team,
      market, name,
      point: o.point !== undefined ? o.point : null,
      price: o.price, fairProb: fair, label, custom: false,
    });
    this.render();
  },

  addPropLeg(ev, market, name, desc, point, price, fairProb, label) {
    this.legs.push({
      id: Store.newId(),
      eventId: ev.id, kickoff: ev.commence_time, home: ev.home_team, away: ev.away_team,
      market, name, desc, point, price, fairProb, label, custom: false, prop: true,
    });
    this.render();
  },

  addCustomLeg(label, price) {
    this.legs.push({
      id: Store.newId(),
      eventId: null, market: 'custom', name: label,
      point: null, price, fairProb: null, label, custom: true,
    });
    this.render();
  },

  addTeaserLeg(ev, market, name) {
    if (this.teaserLegs.length >= 8) { App.banner('Teasers max out at 8 legs.', 'warn'); return; }
    let o, origPoint;
    if (market === 'spreads') {
      o = Api.bestSpread(ev, name);
    } else {
      o = Api.outcomeAny(ev, 'totals', name);
    }
    if (!o) { App.banner('That side isn\'t posted right now.', 'warn'); return; }
    origPoint = o.point;
    if (this.teaserLegs.some(l => l.eventId === ev.id && l.market === market)) {
      App.banner('One spread or total per game in a teaser.', 'warn'); return;
    }
    this.teaserLegs.push({
      id: Store.newId(),
      eventId: ev.id, kickoff: ev.commence_time, home: ev.home_team, away: ev.away_team,
      market, name, origPoint, book: o.book, price: o.price,
    });
    this.render();
  },

  removeLeg(id) {
    this.legs = this.legs.filter(l => l.id !== id);
    this.teaserLegs = this.teaserLegs.filter(l => l.id !== id);
    this.render();
  },

  teasedPoint(leg) {
    return leg.market === 'spreads'
      ? MMath.teaseSpread(leg.origPoint, this.teasePts)
      : MMath.teaseTotal(leg.origPoint, this.teasePts, leg.name === 'Over');
  },

  teaserLabel(leg, teased) {
    const pt = (teased > 0 && leg.market === 'spreads' ? '+' : '') + teased;
    return leg.market === 'spreads'
      ? `${App.short(leg.name)} ${pt}`
      : `${leg.name} ${pt} — ${App.short(leg.away)} @ ${App.short(leg.home)}`;
  },

  /* ---------- correlation / conflicts (parlay mode) ---------- */

  analyzeCorrelation() {
    const notes = [];
    let blocked = false;
    const legs = this.legs;
    for (let i = 0; i < legs.length; i++) {
      for (let j = i + 1; j < legs.length; j++) {
        const a = legs[i], b = legs[j];
        if (!a.eventId || a.eventId !== b.eventId) continue;
        const game = `${App.short(a.away)} @ ${App.short(a.home)}`;
        if (a.market === b.market && !a.prop && a.name !== b.name) {
          notes.push({ level: 'bad', text: `⛔ ${game}: "${a.label}" and "${b.label}" are opposite sides of the same market — they can't both hit.` });
          blocked = true;
        } else if (a.prop && b.prop && a.market === b.market && a.desc === b.desc && a.point === b.point && a.name !== b.name) {
          notes.push({ level: 'bad', text: `⛔ ${game}: both sides of ${a.desc}'s ${a.point} — they can't both hit.` });
          blocked = true;
        } else if ((a.market === 'h2h' && b.market === 'spreads') || (a.market === 'spreads' && b.market === 'h2h')) {
          const mlLeg = a.market === 'h2h' ? a : b;
          const spLeg = a.market === 'h2h' ? b : a;
          if (mlLeg.name === spLeg.name) {
            notes.push({ level: 'good', text: `✓ ${game}: ${App.short(mlLeg.name)} ML + spread are strongly correlated — your real hit chance is higher than the independence math shows. (Same-game parlays get repriced for this; paste the book's quoted odds below.)` });
          } else {
            notes.push({ level: 'warn', text: `⚠ ${game}: ${App.short(mlLeg.name)} ML vs ${App.short(spLeg.name)} spread pull against each other — only a narrow final margin cashes both.` });
          }
        } else if (a.prop || b.prop) {
          notes.push({ level: '', text: `↔ ${game}: prop + same-game leg — correlated (a QB stacking yards usually means points on the board). Math assumes independence.` });
        } else {
          notes.push({ level: '', text: `↔ ${game}: same-game legs — the math below assumes independence, which isn't quite true here.` });
        }
      }
    }
    return { notes, blocked };
  },

  comboAtBook(bookKey) {
    let dec = 1;
    for (const leg of this.legs) {
      if (leg.custom || leg.prop) return null;
      const ev = (Store.data.oddsCache.events || []).find(e => e.id === leg.eventId);
      if (!ev) return null;
      const m = Api.market(ev, bookKey, leg.market);
      const o = m && (m.outcomes || []).find(x => x.name === leg.name &&
        (leg.point === null || x.point === leg.point));
      if (!o) return null;
      dec *= MMath.americanToDecimal(o.price);
    }
    return dec;
  },

  /* ---------- logging tickets ---------- */

  baseBet() {
    return {
      createdAt: Date.now(),
      week: App.weekOf(Date.now()),
      eventId: null,
      book: Store.data.settings.primaryBook,
      source: 'user',
      status: 'pending',
      mode: this.paper ? 'paper' : 'real',
    };
  },

  legSnapshot(l) {
    return {
      eventId: l.eventId, kickoff: l.kickoff, home: l.home, away: l.away,
      market: l.market, name: l.name, desc: l.desc || null, point: l.point,
      price: l.price, label: l.label, custom: !!l.custom, prop: !!l.prop,
      status: 'pending',
    };
  },

  logTicket(result) {
    const kicks = this.legs.filter(l => l.kickoff).map(l => l.kickoff).sort();
    Store.data.bets.push(Object.assign(this.baseBet(), {
      id: Store.newId(),
      type: 'parlay', category: 'parlay',
      kickoff: kicks[0] || null,
      pick: this.legs.length + '-leg parlay',
      point: null,
      price: this.offeredAmerican(result.american),
      stake: this.stake,
      legs: this.legs.map(l => this.legSnapshot(l)),
      trueProb: result.trueProb,
    }));
    Store.save();
    App.banner(`${this.paper ? '📋 Paper ' : ''}Ticket logged: ${this.legs.length} legs, ${MMath.money(this.stake)}. Good luck. ⚡`, 'good');
    this.legs = [];
    this.offeredOverride = '';
    this.render();
    App.renderSpend();
  },

  logRoundRobin() {
    const sizes = Object.keys(this.rrSizes).filter(k => this.rrSizes[k]).map(Number);
    const combos = sizes.flatMap(k => MMath.combinations(this.legs, k));
    if (!combos.length) return;
    const groupId = Store.newId();
    let i = 0;
    for (const combo of combos) {
      i++;
      const r = MMath.parlay(combo);
      const kicks = combo.filter(l => l.kickoff).map(l => l.kickoff).sort();
      Store.data.bets.push(Object.assign(this.baseBet(), {
        id: Store.newId(),
        type: 'parlay', category: 'parlay', groupId,
        kickoff: kicks[0] || null,
        pick: `RR ${combo.length}-leg (${i}/${combos.length})`,
        point: null,
        price: r.american,
        stake: this.rrStake,
        legs: combo.map(l => this.legSnapshot(l)),
        trueProb: r.trueProb,
      }));
    }
    Store.save();
    App.banner(`${this.paper ? '📋 Paper ' : ''}Round robin logged: ${combos.length} tickets, ${MMath.money(combos.length * this.rrStake)} total.`, 'good');
    this.legs = [];
    this.render();
    App.renderSpend();
  },

  logTeaser() {
    const n = this.teaserLegs.length;
    const table = this.TEASER_ODDS[this.teasePts];
    const defOdds = table[n];
    const price = this.offeredAmerican(defOdds);
    const kicks = this.teaserLegs.map(l => l.kickoff).sort();
    Store.data.bets.push(Object.assign(this.baseBet(), {
      id: Store.newId(),
      type: 'teaser', category: 'parlay',
      kickoff: kicks[0] || null,
      pick: `${n}-team ${this.teasePts}pt teaser`,
      point: null,
      price,
      stake: this.stake,
      teasePts: this.teasePts,
      teaserTable: table,
      legs: this.teaserLegs.map(l => {
        const teased = this.teasedPoint(l);
        return {
          eventId: l.eventId, kickoff: l.kickoff, home: l.home, away: l.away,
          market: l.market, name: l.name, point: teased, origPoint: l.origPoint,
          price: -110, label: this.teaserLabel(l, teased) + ` (was ${(l.origPoint > 0 && l.market === 'spreads' ? '+' : '') + l.origPoint})`,
          custom: false, status: 'pending',
        };
      }),
    }));
    Store.save();
    App.banner(`${this.paper ? '📋 Paper ' : ''}Teaser logged: ${n} teams, ${this.teasePts} points, ${MMath.money(this.stake)}.`, 'good');
    this.teaserLegs = [];
    this.offeredOverride = '';
    this.render();
    App.renderSpend();
  },

  offeredAmerican(fallback) {
    const o = parseInt(this.offeredOverride, 10);
    return (this.offeredOverride !== '' && !isNaN(o) && o !== 0) ? o : fallback;
  },

  /* ---------- rendering ---------- */

  render() {
    const el = document.getElementById('tab-lab');
    const events = this.events();

    if (!Store.data.oddsCache) {
      el.innerHTML = `<div class="card"><div class="empty">
        No odds loaded yet. Add your API key in <b>Settings</b>, then hit <b>↻ Refresh odds</b>.
      </div></div>`;
      return;
    }

    if (this.selectedEvent && !events.find(e => e.id === this.selectedEvent)) this.selectedEvent = null;
    if (!this.selectedEvent && events.length) this.selectedEvent = events[0].id;
    const sel = events.find(e => e.id === this.selectedEvent);

    const options = events.map(ev => {
      const when = new Date(ev.commence_time).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' });
      const fav = App.isFavGame(ev) ? '🏈 ' : '';
      return `<option value="${ev.id}" ${ev.id === this.selectedEvent ? 'selected' : ''}>
        ${fav}${App.short(ev.away_team)} @ ${App.short(ev.home_team)} (${when})</option>`;
    }).join('');

    const modeBtns = `
      <div style="display:flex; gap:6px; margin-bottom:12px; align-items:center; flex-wrap:wrap;">
        <button class="btn btn-sm ${this.mode === 'parlay' ? 'btn-primary' : ''}" data-mode="parlay">Parlay</button>
        <button class="btn btn-sm ${this.mode === 'teaser' ? 'btn-primary' : ''}" data-mode="teaser">Teaser</button>
        <label style="margin-left:auto" title="Log tickets with fake money to test accuracy, separate from real bets">
          <input type="checkbox" id="lab-paper" ${this.paper ? 'checked' : ''}> 📋 paper mode</label>
      </div>`;

    const body = this.mode === 'teaser'
      ? this.renderTeaser(sel, options)
      : this.renderParlay(sel, options);

    el.innerHTML = `
      <div class="card">
        <h2>Lightning Lab ⚡</h2>
        <p class="sub">Build the long shot, see its true odds, and check who pays more.
          House math: every leg compounds the vig — keep stakes tiny.</p>
        ${modeBtns}
        ${body}
      </div>`;

    this.wire(sel);
  },

  renderParlay(sel, options) {
    let legButtons = '';
    if (sel) {
      const btn = (market, name) => {
        const o = Api.outcomeAny(sel, market, name);
        if (!o) return '';
        const lbl = market === 'totals' ? `${name} ${o.point}`
          : market === 'spreads' ? `${App.short(name)} ${(o.point > 0 ? '+' : '') + o.point}`
          : `${App.short(name)} ML`;
        return `<button class="btn btn-sm" data-add="${market}|${name}">${lbl} <span class="muted">${MMath.formatAmerican(o.price)}</span></button>`;
      };
      legButtons = [
        btn('h2h', sel.away_team), btn('h2h', sel.home_team),
        btn('spreads', sel.away_team), btn('spreads', sel.home_team),
        btn('totals', 'Over'), btn('totals', 'Under'),
      ].join('');
    }

    const legsHtml = this.legs.map(l => `
      <div class="leg-item">
        <span>${l.label} <span class="muted">${MMath.formatAmerican(l.price)}${l.fairProb !== null && l.fairProb !== undefined ? ' · fair ' + MMath.pct(l.fairProb, 0) : ''}</span></span>
        <button class="btn btn-sm btn-danger" data-remove="${l.id}">✕</button>
      </div>`).join('') || '<div class="muted small">No legs yet — pick a game above and start stacking.</div>';

    const corr = this.analyzeCorrelation();
    const corrHtml = corr.notes.map(n => `<div class="corr-note ${n.level}">${n.text}</div>`).join('');

    let resultsHtml = '';
    if (this.legs.length >= 2) {
      const result = MMath.parlay(this.legs);
      const offered = this.offeredAmerican(result.american);
      const offeredDec = MMath.americanToDecimal(offered);
      const win = this.stake * (offeredDec - 1);
      const oneIn = result.trueProb > 0 ? Math.round(1 / result.trueProb) : Infinity;
      const share = result.fairDecimal ? offeredDec / result.fairDecimal : 0;
      const ev$ = result.trueProb * offeredDec - 1;

      const bookCompare = Store.data.settings.books.map(bk => {
        const dec = this.comboAtBook(bk);
        return `<div class="tile"><div class="t-label">${App.bookName(bk)} pays</div>
          <div class="t-value">${dec ? MMath.formatAmerican(MMath.decimalToAmerican(dec)) : '—'}</div>
          <div class="t-sub">${dec ? MMath.money(this.stake * (dec - 1)) + ' on ' + MMath.money(this.stake) : 'n/a (props/custom legs)'}</div></div>`;
      }).join('');

      resultsHtml = `
        <h3>The verdict</h3>
        <div class="parlay-stats">
          <div class="tile"><div class="t-label">Combined odds</div>
            <div class="t-value">${MMath.formatAmerican(offered)}</div>
            <div class="t-sub">${MMath.money(this.stake)} pays ${MMath.money(win + this.stake)}</div></div>
          <div class="tile"><div class="t-label">True odds*</div>
            <div class="t-value">1 in ${oneIn === Infinity ? '∞' : oneIn.toLocaleString()}</div>
            <div class="t-sub">${MMath.pct(result.trueProb, 2)} — fair payout ${MMath.formatAmerican(result.fairAmerican)}</div></div>
          <div class="tile"><div class="t-label">Payout fairness</div>
            <div class="t-value">${MMath.pct(share, 0)}</div>
            <div class="t-sub">of a fair payout (higher = less ripoff)</div></div>
          <div class="tile"><div class="t-label">Expected value</div>
            <div class="t-value ${ev$ >= 0 ? 'pos' : 'neg'}">${MMath.money(ev$ * this.stake)}</div>
            <div class="t-sub">per ticket, long-run</div></div>
          ${bookCompare}
        </div>
        <p class="sub" style="margin-top:8px">*assumes legs are independent — see notes above if legs share a game.</p>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:8px;">
          <label>Stake $ <input type="number" id="parlay-stake" value="${this.stake}" min="0.5" step="0.5" style="width:80px"></label>
          <label>Book's quoted odds <input type="text" id="parlay-offered" placeholder="e.g. +1200" value="${this.offeredOverride}" style="width:110px"></label>
          <button class="btn btn-primary" id="btn-log-ticket" ${corr.blocked ? 'disabled' : ''}>⚡ Log this ticket</button>
          ${corr.blocked ? '<span class="small neg">fix the conflicting legs first</span>' : ''}
        </div>
        ${this.renderRoundRobin(corr.blocked)}`;
    } else if (this.legs.length === 1) {
      resultsHtml = '<p class="sub" style="margin-top:10px">Add at least one more leg for the parlay math.</p>';
    }

    return `
      <label>Game <select id="lab-game" style="margin-left:6px; max-width:100%;">${options}</select></label>
      <div class="leg-buttons">${legButtons}</div>
      ${this.renderProps(sel)}
      <h3>Your legs (${this.legs.length})</h3>
      <div class="legs-list">${legsHtml}</div>
      ${corrHtml}
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px;">
        <input type="text" id="custom-leg-label" placeholder="Custom leg (e.g. first TD scorer)" style="flex:1; min-width:220px;">
        <input type="text" id="custom-leg-odds" placeholder="+450" style="width:90px;">
        <button class="btn btn-sm" id="btn-custom-leg">+ add</button>
      </div>
      <p class="sub" style="margin-top:4px">Custom legs count at their implied odds (no de-vig).</p>
      ${resultsHtml}`;
  },

  renderProps(sel) {
    if (!sel) return '';
    const cached = Store.data.propsCache[sel.id];
    if (!cached) {
      return `<div style="margin-top:10px">
        <button class="btn btn-sm" id="btn-load-props">🎯 Load player props for this game (${Api.PROP_MARKETS.length} API credits)</button>
      </div>`;
    }

    const marketOpts = Api.PROP_MARKETS.map(m =>
      `<option value="${m.key}" ${m.key === this.propMarket ? 'selected' : ''}>${m.label}</option>`).join('');

    // collect outcomes for the chosen market at the primary book (fallback other)
    const books = [Store.data.settings.primaryBook,
      ...Store.data.settings.books.filter(b => b !== Store.data.settings.primaryBook)];
    let market = null, bookUsed = null;
    for (const bk of books) {
      const b = (cached.event.bookmakers || []).find(x => x.key === bk);
      const m = b && (b.markets || []).find(x => x.key === this.propMarket);
      if (m && m.outcomes && m.outcomes.length) { market = m; bookUsed = bk; break; }
    }

    let rows = '<div class="muted small" style="margin-top:6px">No lines posted for this market yet.</div>';
    if (market) {
      // group by player (description) + point
      const groups = {};
      for (const o of market.outcomes) {
        const key = (o.description || o.name) + '|' + (o.point !== undefined ? o.point : '');
        (groups[key] = groups[key] || []).push(o);
      }
      const mLabel = Api.PROP_MARKETS.find(m => m.key === this.propMarket).label;
      rows = '<div class="leg-buttons">' + Object.keys(groups).slice(0, 40).map(key => {
        const g = groups[key];
        const player = g[0].description || g[0].name;
        const point = g[0].point;
        return g.map(o => {
          const side = o.description ? o.name : 'Yes';
          const other = g.find(x => x !== o);
          const fair = other ? MMath.devig(o.price, other.price) : null;
          const lbl = point !== undefined
            ? `${App.short(player)} ${side.charAt(0)}${point} ${mLabel}`
            : `${App.short(player)} ${mLabel}`;
          const full = point !== undefined
            ? `${player} ${side} ${point} ${mLabel.toLowerCase()}`
            : `${player} ${mLabel.toLowerCase()}`;
          return `<button class="btn btn-sm" data-prop='${JSON.stringify({
            market: this.propMarket, name: o.name, desc: player,
            point: point !== undefined ? point : null, price: o.price, fair, label: full,
          }).replace(/'/g, '&#39;')}'>${lbl} <span class="muted">${MMath.formatAmerican(o.price)}</span></button>`;
        }).join('');
      }).join('') + '</div>';
    }

    const age = Math.round((Date.now() - cached.fetchedAt) / 60000);
    return `
      <h3>Player props <span class="muted small">(${bookUsed ? App.bookName(bookUsed) : ''} · ${age}m old)</span></h3>
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <select id="prop-market">${marketOpts}</select>
        <button class="btn btn-sm" id="btn-load-props">↻ refresh (${Api.PROP_MARKETS.length} credits)</button>
      </div>
      ${rows}
      <p class="sub" style="margin-top:4px">Prop legs settle manually in the Ledger (✓/✗) — box scores aren't in the free API.</p>`;
  },

  renderRoundRobin(blocked) {
    if (this.legs.length < 3) return '';
    const sizes = [2, 3].filter(k => k < this.legs.length);
    const combos = sizes.filter(k => this.rrSizes[k]).flatMap(k => MMath.combinations(this.legs, k));
    const totalCost = combos.length * this.rrStake;

    let summary = '';
    if (combos.length) {
      const allHit = combos.reduce((s, c) => s + this.rrStake * MMath.parlay(c).decimal, 0);
      // worst case if exactly one leg loses
      let worstOneMiss = Infinity;
      for (const missLeg of this.legs) {
        const ret = combos.filter(c => !c.includes(missLeg))
          .reduce((s, c) => s + this.rrStake * MMath.parlay(c).decimal, 0);
        worstOneMiss = Math.min(worstOneMiss, ret);
      }
      const ev = combos.reduce((s, c) => { const r = MMath.parlay(c); return s + this.rrStake * (r.trueProb * r.decimal - 1); }, 0);
      summary = `<div class="parlay-stats">
        <div class="tile"><div class="t-label">Tickets</div><div class="t-value">${combos.length}</div>
          <div class="t-sub">${MMath.money(this.rrStake)} each · ${MMath.money(totalCost)} total</div></div>
        <div class="tile"><div class="t-label">All legs hit</div><div class="t-value">${MMath.money(allHit)}</div>
          <div class="t-sub">collected (${MMath.money(allHit - totalCost)} profit)</div></div>
        <div class="tile"><div class="t-label">One leg misses</div><div class="t-value">${MMath.money(worstOneMiss)}</div>
          <div class="t-sub">still collected (worst case) — the RR safety net</div></div>
        <div class="tile"><div class="t-label">Expected value</div>
          <div class="t-value ${ev >= 0 ? 'pos' : 'neg'}">${MMath.money(ev)}</div>
          <div class="t-sub">whole round robin, long-run</div></div>
      </div>`;
    }

    return `
      <h3>Round robin <span class="muted small">(every combo as its own ticket — misses one leg, still cashes some)</span></h3>
      <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
        <label><input type="checkbox" id="rr-2" ${this.rrSizes[2] ? 'checked' : ''}> 2-leg combos (${MMath.combinations(this.legs, 2).length})</label>
        <label><input type="checkbox" id="rr-3" ${this.rrSizes[3] ? 'checked' : ''} ${this.legs.length < 4 ? 'disabled' : ''}> 3-leg combos (${MMath.combinations(this.legs, 3).length})</label>
        <label>$ per ticket <input type="number" id="rr-stake" value="${this.rrStake}" min="0.5" step="0.5" style="width:70px"></label>
        <button class="btn" id="btn-log-rr" ${blocked || !combos.length ? 'disabled' : ''}>Log round robin (${combos.length} tickets, ${MMath.money(totalCost)})</button>
      </div>
      ${summary}`;
  },

  renderTeaser(sel, options) {
    let legButtons = '';
    if (sel) {
      const sp = name => {
        const o = Api.bestSpread(sel, name);
        if (!o) return '';
        const teased = MMath.teaseSpread(o.point, this.teasePts);
        const wong = MMath.isWongLeg(o.point, this.teasePts) ? ' ⭐' : '';
        return `<button class="btn btn-sm" data-tease="spreads|${name}">${App.short(name)}
          ${(o.point > 0 ? '+' : '') + o.point} → <b>${(teased > 0 ? '+' : '') + teased}</b>${wong}</button>`;
      };
      const tot = name => {
        const o = Api.outcomeAny(sel, 'totals', name);
        if (!o) return '';
        const teased = MMath.teaseTotal(o.point, this.teasePts, name === 'Over');
        return `<button class="btn btn-sm" data-tease="totals|${name}">${name} ${o.point} → <b>${teased}</b></button>`;
      };
      legButtons = [sp(sel.away_team), sp(sel.home_team), tot('Over'), tot('Under')].join('');
    }

    const legsHtml = this.teaserLegs.map(l => {
      const teased = this.teasedPoint(l);
      const wong = l.market === 'spreads' && MMath.isWongLeg(l.origPoint, this.teasePts)
        ? ' <span class="pill good">⭐ Wong</span>' : '';
      return `<div class="leg-item">
        <span>${this.teaserLabel(l, teased)} <span class="muted">(was ${(l.origPoint > 0 && l.market === 'spreads' ? '+' : '') + l.origPoint})</span>${wong}</span>
        <button class="btn btn-sm btn-danger" data-remove="${l.id}">✕</button>
      </div>`;
    }).join('') || '<div class="muted small">Add spreads or totals — every leg gets the tease.</div>';

    let resultsHtml = '';
    const n = this.teaserLegs.length;
    if (n >= 2) {
      const table = this.TEASER_ODDS[this.teasePts];
      const defOdds = table[n];
      const offered = this.offeredAmerican(defOdds);
      const offeredDec = MMath.americanToDecimal(offered);
      const legProb = MMath.teasedCoverProb(this.teasePts);
      const trueProb = Math.pow(legProb, n);
      const ev$ = trueProb * offeredDec - 1;
      const wongCount = this.teaserLegs.filter(l => l.market === 'spreads' && MMath.isWongLeg(l.origPoint, this.teasePts)).length;

      resultsHtml = `
        <h3>The verdict</h3>
        <div class="parlay-stats">
          <div class="tile"><div class="t-label">${n}-team ${this.teasePts}pt pays</div>
            <div class="t-value">${MMath.formatAmerican(offered)}</div>
            <div class="t-sub">${MMath.money(this.stake)} pays ${MMath.money(this.stake * offeredDec)}</div></div>
          <div class="tile"><div class="t-label">Per-leg hit rate*</div>
            <div class="t-value">${MMath.pct(legProb, 0)}</div>
            <div class="t-sub">need ${MMath.pct(Math.pow(MMath.americanToImplied(offered), 1 / n), 0)}/leg to break even</div></div>
          <div class="tile"><div class="t-label">All ${n} hit</div>
            <div class="t-value">${MMath.pct(trueProb, 0)}</div>
            <div class="t-sub">independence assumed</div></div>
          <div class="tile"><div class="t-label">Expected value</div>
            <div class="t-value ${ev$ >= 0 ? 'pos' : 'neg'}">${MMath.money(ev$ * this.stake)}</div>
            <div class="t-sub">per ticket, long-run</div></div>
        </div>
        <p class="sub" style="margin-top:8px">*flat normal-margin model — ⭐ Wong legs (teasing through both 3 and 7) hit
          meaningfully more often than this credits them for${wongCount ? `; you have ${wongCount}` : ''}.
          Ties push and drop the teaser to the next payout tier.</p>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:8px;">
          <label>Stake $ <input type="number" id="parlay-stake" value="${this.stake}" min="0.5" step="0.5" style="width:80px"></label>
          <label>Book's quoted odds <input type="text" id="parlay-offered" placeholder="${MMath.formatAmerican(defOdds)}" value="${this.offeredOverride}" style="width:110px"></label>
          <button class="btn btn-primary" id="btn-log-teaser">🧀 Log this teaser</button>
        </div>`;
    } else if (n === 1) {
      resultsHtml = '<p class="sub" style="margin-top:10px">Teasers need at least 2 legs.</p>';
    }

    return `
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
        <label>Tease
          <select id="tease-pts" style="margin-left:4px">
            ${[6, 6.5, 7].map(p => `<option value="${p}" ${p === this.teasePts ? 'selected' : ''}>${p} points</option>`).join('')}
          </select>
        </label>
        <span class="muted small">⭐ = Wong leg: the tease crosses both key numbers 3 and 7 — the good ones.</span>
      </div>
      <label>Game <select id="lab-game" style="margin-left:6px; max-width:100%;">${options}</select></label>
      <div class="leg-buttons">${legButtons}</div>
      <h3>Teaser legs (${n})</h3>
      <div class="legs-list">${legsHtml}</div>
      ${resultsHtml}`;
  },

  /* ---------- event wiring ---------- */

  wire(sel) {
    const el = document.getElementById('tab-lab');
    el.querySelectorAll('[data-mode]').forEach(b => {
      b.onclick = () => { this.mode = b.dataset.mode; this.render(); };
    });
    const paperEl = document.getElementById('lab-paper');
    if (paperEl) paperEl.onchange = () => { this.paper = paperEl.checked; };
    const gameSel = document.getElementById('lab-game');
    if (gameSel) gameSel.onchange = () => { this.selectedEvent = gameSel.value; this.render(); };

    el.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => { const [m, name] = b.dataset.add.split('|'); this.addLeg(sel, m, name); };
    });
    el.querySelectorAll('[data-tease]').forEach(b => {
      b.onclick = () => { const [m, name] = b.dataset.tease.split('|'); this.addTeaserLeg(sel, m, name); };
    });
    el.querySelectorAll('[data-prop]').forEach(b => {
      b.onclick = () => {
        const p = JSON.parse(b.dataset.prop);
        this.addPropLeg(sel, p.market, p.name, p.desc, p.point, p.price, p.fair, p.label);
      };
    });
    el.querySelectorAll('[data-remove]').forEach(b => {
      b.onclick = () => this.removeLeg(b.dataset.remove);
    });

    const teaseSel = document.getElementById('tease-pts');
    if (teaseSel) teaseSel.onchange = () => { this.teasePts = parseFloat(teaseSel.value); this.render(); };

    const loadProps = document.getElementById('btn-load-props');
    if (loadProps) loadProps.onclick = async () => {
      loadProps.disabled = true;
      try {
        await Api.fetchEventProps(sel.id);
        App.banner(`Props loaded for ${App.short(sel.away_team)} @ ${App.short(sel.home_team)}. (${Api.PROP_MARKETS.length} credits)`, 'good');
      } catch (e) { App.banner(e.message, 'error'); }
      App.renderQuota();
      this.render();
    };
    const propSel = document.getElementById('prop-market');
    if (propSel) propSel.onchange = () => { this.propMarket = propSel.value; this.render(); };

    const stakeEl = document.getElementById('parlay-stake');
    if (stakeEl) stakeEl.onchange = () => { this.stake = Math.max(0.5, parseFloat(stakeEl.value) || 1); this.render(); };
    const offeredEl = document.getElementById('parlay-offered');
    if (offeredEl) offeredEl.onchange = () => { this.offeredOverride = offeredEl.value.trim().replace('+', ''); this.render(); };

    const logBtn = document.getElementById('btn-log-ticket');
    if (logBtn) logBtn.onclick = () => this.logTicket(MMath.parlay(this.legs));
    const teaserBtn = document.getElementById('btn-log-teaser');
    if (teaserBtn) teaserBtn.onclick = () => this.logTeaser();

    const rr2 = document.getElementById('rr-2'), rr3 = document.getElementById('rr-3');
    if (rr2) rr2.onchange = () => { this.rrSizes[2] = rr2.checked; this.render(); };
    if (rr3) rr3.onchange = () => { this.rrSizes[3] = rr3.checked; this.render(); };
    const rrStake = document.getElementById('rr-stake');
    if (rrStake) rrStake.onchange = () => { this.rrStake = Math.max(0.5, parseFloat(rrStake.value) || 1); this.render(); };
    const rrBtn = document.getElementById('btn-log-rr');
    if (rrBtn) rrBtn.onclick = () => this.logRoundRobin();

    const customBtn = document.getElementById('btn-custom-leg');
    if (customBtn) customBtn.onclick = () => {
      const label = document.getElementById('custom-leg-label').value.trim();
      const odds = parseInt(document.getElementById('custom-leg-odds').value.trim().replace('+', ''), 10);
      if (!label || isNaN(odds) || odds === 0) { App.banner('Custom leg needs a name and american odds (e.g. +450).', 'warn'); return; }
      this.addCustomLeg(label, odds);
    };
  },
};
