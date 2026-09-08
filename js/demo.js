/* Demo mode — a baked-in sample slate so the app can be explored with no
   API key and no network (e.g. in a shared preview link). The data is
   realistic and deliberately contains one cross-book arbitrage and one
   key-number middle so the Arb Finder has something to show. */

const Demo = {
  book(key, spread, total, mlHome, mlAway, home, away, spreadPriceH, spreadPriceA) {
    return {
      key, title: key,
      markets: [
        { key: 'h2h', outcomes: [{ name: home, price: mlHome }, { name: away, price: mlAway }] },
        { key: 'spreads', outcomes: [
          { name: home, price: spreadPriceH || -110, point: spread },
          { name: away, price: spreadPriceA || -110, point: -spread }] },
        { key: 'totals', outcomes: [
          { name: 'Over', price: -108, point: total },
          { name: 'Under', price: -112, point: total }] },
      ],
    };
  },

  slate() {
    const now = Date.now();
    const day = 864e5;
    const g = (id, offset, home, away, fd, dk) => ({
      id, sport_key: 'americanfootball_nfl',
      commence_time: new Date(now + offset).toISOString(),
      home_team: home, away_team: away, bookmakers: [fd, dk],
    });

    return [
      // Giants game — the Big Blue Watch headliner
      g('demo-nyg', 2 * day + 6e5, 'New York Giants', 'Dallas Cowboys',
        this.book('fanduel', 2.5, 45.5, 118, -140, 'New York Giants', 'Dallas Cowboys'),
        this.book('draftkings', 3, 45.5, 122, -145, 'New York Giants', 'Dallas Cowboys')),
      // cross-book ARBITRAGE on the moneyline: Bills +136 (FD) vs Chiefs +108 (DK)
      g('demo-kc', 3 * day, 'Kansas City Chiefs', 'Buffalo Bills',
        this.book('fanduel', -1.5, 48.5, -155, 136, 'Kansas City Chiefs', 'Buffalo Bills'),
        this.book('draftkings', -2.5, 49, 108, -128, 'Kansas City Chiefs', 'Buffalo Bills')),
      // spread gap crossing key number 7 -> a MIDDLE (Eagles by 6,7,8)
      g('demo-phi', 3 * day + 3e5, 'Philadelphia Eagles', 'Washington Commanders',
        this.book('fanduel', -9.5, 44.5, -420, 330, 'Philadelphia Eagles', 'Washington Commanders'),
        this.book('draftkings', -5.5, 43.5, -410, 320, 'Philadelphia Eagles', 'Washington Commanders')),
      g('demo-sf', 4 * day, 'San Francisco 49ers', 'Seattle Seahawks',
        this.book('fanduel', -3.5, 47.5, -180, 152, 'San Francisco 49ers', 'Seattle Seahawks'),
        this.book('draftkings', -3.5, 47, -175, 148, 'San Francisco 49ers', 'Seattle Seahawks')),
      g('demo-bal', 4 * day + 3e5, 'Baltimore Ravens', 'Cincinnati Bengals',
        this.book('fanduel', -6.5, 51.5, -280, 230, 'Baltimore Ravens', 'Cincinnati Bengals'),
        this.book('draftkings', -6, 51.5, -270, 220, 'Baltimore Ravens', 'Cincinnati Bengals')),
      g('demo-det', 5 * day, 'Detroit Lions', 'Green Bay Packers',
        this.book('fanduel', -2.5, 49.5, -142, 120, 'Detroit Lions', 'Green Bay Packers'),
        this.book('draftkings', -2.5, 49.5, -138, 118, 'Detroit Lions', 'Green Bay Packers')),
    ];
  },

  propEvent() {
    const slate = this.slate();
    const kc = slate.find(e => e.id === 'demo-kc');
    return {
      id: 'demo-kc', home_team: kc.home_team, away_team: kc.away_team,
      commence_time: kc.commence_time,
      bookmakers: [{
        key: 'fanduel', title: 'FanDuel',
        markets: [
          { key: 'player_pass_yds', outcomes: [
            { name: 'Over', description: 'Patrick Mahomes', point: 278.5, price: -114 },
            { name: 'Under', description: 'Patrick Mahomes', point: 278.5, price: -106 },
            { name: 'Over', description: 'Josh Allen', point: 254.5, price: -110 },
            { name: 'Under', description: 'Josh Allen', point: 254.5, price: -110 },
          ] },
          { key: 'player_anytime_td', outcomes: [
            { name: 'Yes', description: 'Travis Kelce', price: 135 },
            { name: 'Yes', description: 'James Cook', price: 120 },
          ] },
        ],
      }],
    };
  },

  load(silent) {
    const now = Date.now();
    const events = this.slate();
    Store.data.oddsCache = { fetchedAt: now, events };
    Store.data.propsCache = { 'demo-kc': { fetchedAt: now, event: this.propEvent() } };
    Store.data.closing = {};
    for (const ev of events) Store.data.closing[ev.id] = { at: now, event: ev };
    Store.data.quota = { remaining: '—', used: '0', at: now };
    Store.save();
    if (!silent) {
      App.banner('🎮 Demo slate loaded — 6 sample games with a built-in arb and a middle. Click around; nothing here spends money or needs a key.', 'good');
      App.renderAll();
    }
  },

  isActive() {
    return typeof window !== 'undefined' && window.PFP_DEMO === true;
  },
};
