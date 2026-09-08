/* localStorage-backed app state. Everything lives in one key so
   export/import is a single JSON blob. */

const Store = {
  KEY: 'marginace.v1',
  data: null,

  defaults() {
    return {
      settings: {
        apiKey: '',
        books: ['fanduel', 'draftkings'],
        primaryBook: 'fanduel',
        weeklyCap: 50,
        favoriteTeam: 'New York Giants',
        watcher: { intervalMin: 15, alertArbs: true, alertMiddles: true, keyOnly: true, minCredits: 20 },
      },
      elo: null,          // { ratings: {team: rating}, processed: [gameIds], seededAt }
      oddsCache: null,    // { fetchedAt, events: [...] }
      propsCache: {},     // eventId -> { fetchedAt, event } (per-event prop markets)
      closing: {},        // eventId -> { [market]: snapshot } last seen before kickoff
      quota: null,        // { remaining, used, at }
      watcherSeen: {},    // opportunity signature -> firstSeenAt (dedupe alerts)
      bets: [],
    };
  },

  load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { raw = null; }
    this.data = Object.assign(this.defaults(), raw || {});
    this.data.settings = Object.assign(this.defaults().settings, (raw && raw.settings) || {});
    this.data.settings.watcher = Object.assign(this.defaults().settings.watcher,
      (raw && raw.settings && raw.settings.watcher) || {});
    if (!this.data.watcherSeen) this.data.watcherSeen = {};
    return this.data;
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.data));
    } catch (e) {
      console.error('save failed', e);
      App.banner('Could not save to browser storage: ' + e.message, 'error');
    }
  },

  exportJson() {
    return JSON.stringify(this.data, null, 2);
  },

  importJson(text) {
    const parsed = JSON.parse(text); // throws on bad JSON
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.bets)) {
      throw new Error("Not a Pro's Fantasy Palace export file");
    }
    this.data = Object.assign(this.defaults(), parsed);
    this.save();
  },

  newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Store;
