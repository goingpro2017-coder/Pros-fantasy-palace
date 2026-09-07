/* The Odds API v4 client. Free tier = 500 credits/month.
   One odds refresh (3 markets x 1 US region) costs 3 credits;
   one scores refresh costs 2. The header quota is shown in the top bar. */

const Api = {
  BASE: 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl',

  async request(path, params) {
    const key = Store.data.settings.apiKey.trim();
    if (!key) throw new Error('No API key set. Add your free key from the-odds-api.com in Settings.');
    const url = new URL(this.BASE + path);
    url.searchParams.set('apiKey', key);
    for (const k in params) url.searchParams.set(k, params[k]);

    const res = await fetch(url.toString());
    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) {
      Store.data.quota = { remaining, used, at: Date.now() };
    }
    if (!res.ok) {
      let msg = 'API error ' + res.status;
      try { msg += ': ' + ((await res.json()).message || ''); } catch (e) { /* keep base msg */ }
      throw new Error(msg);
    }
    return res.json();
  },

  async fetchOdds() {
    const events = await this.request('/odds', {
      regions: 'us',
      markets: 'h2h,spreads,totals',
      oddsFormat: 'american',
      bookmakers: Store.data.settings.books.join(','),
    });
    Store.data.oddsCache = { fetchedAt: Date.now(), events };
    this.snapshotClosing(events);
    Store.save();
    return events;
  },

  async fetchScores() {
    const games = await this.request('/scores', { daysFrom: 3 });
    Store.save(); // persist quota
    return games;
  },

  /* Keep the freshest pre-kickoff snapshot of every event, so we have a
     "closing line" to grade CLV against once the game starts. */
  snapshotClosing(events) {
    const now = Date.now();
    for (const ev of events) {
      const kick = Date.parse(ev.commence_time);
      if (now < kick) {
        Store.data.closing[ev.id] = { at: now, event: ev };
      }
    }
    // prune snapshots for games older than ~10 days
    for (const id in Store.data.closing) {
      const snap = Store.data.closing[id];
      if (now - Date.parse(snap.event.commence_time) > 10 * 864e5) delete Store.data.closing[id];
    }
  },

  /* ---- odds extraction helpers ---- */

  book(ev, bookKey) {
    return (ev.bookmakers || []).find(b => b.key === bookKey) || null;
  },

  market(ev, bookKey, marketKey) {
    const b = this.book(ev, bookKey);
    if (!b) return null;
    return (b.markets || []).find(m => m.key === marketKey) || null;
  },

  outcome(ev, bookKey, marketKey, name) {
    const m = this.market(ev, bookKey, marketKey);
    if (!m) return null;
    return (m.outcomes || []).find(o => o.name === name) || null;
  },

  /* Outcome from primary book, falling back to the other book. */
  outcomeAny(ev, marketKey, name) {
    const books = [Store.data.settings.primaryBook,
      ...Store.data.settings.books.filter(b => b !== Store.data.settings.primaryBook)];
    for (const bk of books) {
      const o = this.outcome(ev, bk, marketKey, name);
      if (o) return Object.assign({ book: bk }, o);
    }
    return null;
  },

  /* Best price for one side across configured books. */
  bestOutcome(ev, marketKey, name, point) {
    let best = null;
    for (const bk of Store.data.settings.books) {
      const m = this.market(ev, bk, marketKey);
      if (!m) continue;
      for (const o of m.outcomes || []) {
        if (o.name !== name) continue;
        if (point !== undefined && point !== null && o.point !== point) continue;
        if (!best || o.price > best.price) best = Object.assign({ book: bk }, o);
      }
    }
    return best;
  },

  /* Best spread quote for one side across books: more points on your side
     beats price (+2.5 > +1.5, and -1.5 > -2.5); price breaks ties. */
  bestSpread(ev, name) {
    let best = null;
    for (const bk of Store.data.settings.books) {
      const m = this.market(ev, bk, 'spreads');
      if (!m) continue;
      for (const o of m.outcomes || []) {
        if (o.name !== name || o.point === undefined) continue;
        if (!best || o.point > best.point ||
            (o.point === best.point && o.price > best.price)) {
          best = Object.assign({ book: bk }, o);
        }
      }
    }
    return best;
  },

  /* De-vigged fair probability for an outcome in a two-way market. */
  fairProb(ev, bookKey, marketKey, name) {
    const m = this.market(ev, bookKey, marketKey);
    if (!m || !m.outcomes || m.outcomes.length < 2) return null;
    const mine = m.outcomes.find(o => o.name === name);
    const other = m.outcomes.find(o => o.name !== name);
    if (!mine || !other) return null;
    return MMath.devig(mine.price, other.price);
  },
};
