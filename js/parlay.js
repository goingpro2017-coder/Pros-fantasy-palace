/* Lightning Lab — the long-shot parlay builder.
   Computes true odds (de-vigged, independence-assumed), fair payout vs
   offered payout, EV, and correlation notes. Lottery tickets, but
   smarter lottery tickets. */

const Parlay = {
  legs: [],
  selectedEvent: null,
  stake: 1,
  offeredOverride: '', // american odds the book actually quotes (SGP reprice)

  events() {
    const cache = Store.data.oddsCache;
    if (!cache) return [];
    const now = Date.now();
    return cache.events
      .filter(ev => Date.parse(ev.commence_time) > now)
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
  },

  addLeg(ev, market, name) {
    const primary = Store.data.settings.primaryBook;
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
      eventId: ev.id,
      kickoff: ev.commence_time,
      home: ev.home_team,
      away: ev.away_team,
      market, name,
      point: o.point !== undefined ? o.point : null,
      price: o.price,
      fairProb: fair,
      label,
      custom: false,
    });
    this.render();
  },

  addCustomLeg(label, price) {
    this.legs.push({
      id: Store.newId(),
      eventId: null, market: 'custom', name: label,
      point: null, price,
      fairProb: null, // falls back to implied prob (i.e. assumes fair pricing)
      label, custom: true,
    });
    this.render();
  },

  removeLeg(id) {
    this.legs = this.legs.filter(l => l.id !== id);
    this.render();
  },

  /* ---- correlation / conflict analysis ---- */

  analyzeCorrelation() {
    const notes = [];
    let blocked = false;
    const legs = this.legs;

    for (let i = 0; i < legs.length; i++) {
      for (let j = i + 1; j < legs.length; j++) {
        const a = legs[i], b = legs[j];
        if (!a.eventId || a.eventId !== b.eventId) continue;

        const game = `${App.short(a.away)} @ ${App.short(a.home)}`;
        if (a.market === b.market && a.name !== b.name) {
          notes.push({ level: 'bad', text: `⛔ ${game}: "${a.label}" and "${b.label}" are opposite sides of the same market — they can't both hit.` });
          blocked = true;
        } else if ((a.market === 'h2h' && b.market === 'spreads') || (a.market === 'spreads' && b.market === 'h2h')) {
          const mlLeg = a.market === 'h2h' ? a : b;
          const spLeg = a.market === 'h2h' ? b : a;
          if (mlLeg.name === spLeg.name) {
            notes.push({ level: 'good', text: `✓ ${game}: ${App.short(mlLeg.name)} ML + spread are strongly correlated — your real hit chance is higher than the independence math shows. (Same-game parlays get repriced for this; paste the book's quoted odds below.)` });
          } else {
            notes.push({ level: 'warn', text: `⚠ ${game}: ${App.short(mlLeg.name)} ML vs ${App.short(spLeg.name)} spread pull against each other — only a narrow final margin cashes both.` });
          }
        } else {
          notes.push({ level: '', text: `↔ ${game}: same-game legs — the math below assumes independence, which isn't quite true here.` });
        }
      }
    }
    return { notes, blocked };
  },

  /* Combined decimal odds priced entirely at one book; null if any leg unavailable there. */
  comboAtBook(bookKey) {
    let dec = 1;
    for (const leg of this.legs) {
      if (leg.custom) return null;
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

  logTicket(result) {
    const kicks = this.legs.filter(l => l.kickoff).map(l => l.kickoff).sort();
    Store.data.bets.push({
      id: Store.newId(),
      createdAt: Date.now(),
      week: App.weekOf(Date.now()),
      type: 'parlay',
      category: 'parlay',
      eventId: null,
      kickoff: kicks[0] || null,
      pick: this.legs.length + '-leg parlay',
      point: null,
      price: this.offeredAmerican(result),
      book: Store.data.settings.primaryBook,
      stake: this.stake,
      source: 'user',
      status: 'pending',
      legs: this.legs.map(l => ({
        eventId: l.eventId, kickoff: l.kickoff, home: l.home, away: l.away,
        market: l.market, name: l.name, point: l.point, price: l.price,
        label: l.label, custom: l.custom, status: 'pending',
      })),
      trueProb: result.trueProb,
    });
    Store.save();
    App.banner(`Ticket logged: ${this.legs.length} legs, ${MMath.money(this.stake)} to win ${MMath.money(this.stake * (MMath.americanToDecimal(this.offeredAmerican(result)) - 1))}. Good luck. ⚡`, 'good');
    this.legs = [];
    this.offeredOverride = '';
    this.render();
    App.renderSpend();
  },

  offeredAmerican(result) {
    const o = parseInt(this.offeredOverride, 10);
    return (this.offeredOverride !== '' && !isNaN(o) && o !== 0) ? o : result.american;
  },

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
      return `<option value="${ev.id}" ${ev.id === this.selectedEvent ? 'selected' : ''}>
        ${App.short(ev.away_team)} @ ${App.short(ev.home_team)} (${when})</option>`;
    }).join('');

    let legButtons = '';
    if (sel) {
      const btn = (market, name, extra) => {
        const o = Api.outcomeAny(sel, market, name);
        if (!o) return '';
        const lbl = market === 'totals'
          ? `${name} ${o.point}`
          : market === 'spreads'
            ? `${App.short(name)} ${(o.point > 0 ? '+' : '') + o.point}`
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
        <span>${l.label} <span class="muted">${MMath.formatAmerican(l.price)}${l.fairProb !== null ? ' · fair ' + MMath.pct(l.fairProb, 0) : ''}</span></span>
        <button class="btn btn-sm btn-danger" data-remove="${l.id}">✕</button>
      </div>`).join('') || '<div class="muted small">No legs yet — pick a game above and start stacking.</div>';

    let resultsHtml = '';
    const corr = this.analyzeCorrelation();
    if (this.legs.length >= 2) {
      const result = MMath.parlay(this.legs);
      const offered = this.offeredAmerican(result);
      const offeredDec = MMath.americanToDecimal(offered);
      const win = this.stake * (offeredDec - 1);
      const oneIn = result.trueProb > 0 ? Math.round(1 / result.trueProb) : Infinity;
      const share = result.fairDecimal ? offeredDec / result.fairDecimal : 0;
      const ev$ = result.trueProb * offeredDec - 1;

      const books = Store.data.settings.books;
      const bookCompare = books.map(bk => {
        const dec = this.comboAtBook(bk);
        return `<div class="tile"><div class="t-label">${App.bookName(bk)} pays</div>
          <div class="t-value">${dec ? MMath.formatAmerican(MMath.decimalToAmerican(dec)) : '—'}</div>
          <div class="t-sub">${dec ? MMath.money(this.stake * (dec - 1)) + ' on ' + MMath.money(this.stake) : 'legs not all posted'}</div></div>`;
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
            <div class="t-value class-share">${MMath.pct(share, 0)}</div>
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
        </div>`;
    } else if (this.legs.length === 1) {
      resultsHtml = '<p class="sub" style="margin-top:10px">Add at least one more leg for the parlay math.</p>';
    }

    const corrHtml = corr.notes.map(n =>
      `<div class="corr-note ${n.level}">${n.text}</div>`).join('');

    el.innerHTML = `
      <div class="card">
        <h2>Lightning Lab ⚡</h2>
        <p class="sub">Build the long shot, see its true odds, and check who pays more.
          House math: every leg compounds the vig — this is a lottery ticket, keep stakes tiny.</p>

        <label>Game
          <select id="lab-game" style="margin-left:6px; max-width: 100%;">${options}</select>
        </label>
        <div class="leg-buttons">${legButtons}</div>

        <h3>Your legs (${this.legs.length})</h3>
        <div class="legs-list">${legsHtml}</div>
        ${corrHtml}

        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:10px;">
          <input type="text" id="custom-leg-label" placeholder="Custom leg (e.g. Mahomes 3+ TD passes)" style="flex:1; min-width:220px;">
          <input type="text" id="custom-leg-odds" placeholder="+450" style="width:90px;">
          <button class="btn btn-sm" id="btn-custom-leg">+ add</button>
        </div>
        <p class="sub" style="margin-top:4px">Custom legs (props etc.) count at their implied odds — the free API tier doesn't carry props, so no de-vig on those.</p>

        ${resultsHtml}
      </div>`;

    // wire events
    const gameSel = document.getElementById('lab-game');
    if (gameSel) gameSel.onchange = () => { this.selectedEvent = gameSel.value; this.render(); };
    el.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => {
        const [market, name] = b.dataset.add.split('|');
        this.addLeg(sel, market, name);
      };
    });
    el.querySelectorAll('[data-remove]').forEach(b => {
      b.onclick = () => this.removeLeg(b.dataset.remove);
    });
    const stakeEl = document.getElementById('parlay-stake');
    if (stakeEl) stakeEl.onchange = () => { this.stake = Math.max(0.5, parseFloat(stakeEl.value) || 1); this.render(); };
    const offeredEl = document.getElementById('parlay-offered');
    if (offeredEl) offeredEl.onchange = () => { this.offeredOverride = offeredEl.value.trim().replace('+', ''); this.render(); };
    const logBtn = document.getElementById('btn-log-ticket');
    if (logBtn) logBtn.onclick = () => this.logTicket(MMath.parlay(this.legs));
    const customBtn = document.getElementById('btn-custom-leg');
    if (customBtn) customBtn.onclick = () => {
      const label = document.getElementById('custom-leg-label').value.trim();
      const odds = parseInt(document.getElementById('custom-leg-odds').value.trim().replace('+', ''), 10);
      if (!label || isNaN(odds) || odds === 0) { App.banner('Custom leg needs a name and american odds (e.g. +450).', 'warn'); return; }
      this.addCustomLeg(label, odds);
    };
  },
};
