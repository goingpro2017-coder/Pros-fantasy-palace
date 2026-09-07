/* Elo power ratings — the prediction model behind the Weekly Card.

   Seeded with 2026 preseason ratings (2025 results regressed toward the
   mean, in the style of FiveThirtyEight's NFL Elo). The seed is only a
   starting point: every time you hit "Settle scores" the ratings update
   from final scores with a margin-of-victory multiplier, so the model
   corrects itself as the season goes on. ~25 Elo points = 1 point of
   spread; home field is worth HFA Elo (~1.9 points). */

const Elo = {
  K: 20,
  HFA: 48,
  MEAN: 1505,

  SEED_2026: {
    'Arizona Cardinals': 1470,
    'Atlanta Falcons': 1470,
    'Baltimore Ravens': 1600,
    'Buffalo Bills': 1640,
    'Carolina Panthers': 1480,
    'Chicago Bears': 1550,
    'Cincinnati Bengals': 1500,
    'Cleveland Browns': 1420,
    'Dallas Cowboys': 1500,
    'Denver Broncos': 1615,
    'Detroit Lions': 1615,
    'Green Bay Packers': 1600,
    'Houston Texans': 1540,
    'Indianapolis Colts': 1560,
    'Jacksonville Jaguars': 1545,
    'Kansas City Chiefs': 1610,
    'Las Vegas Raiders': 1420,
    'Los Angeles Chargers': 1585,
    'Los Angeles Rams': 1620,
    'Miami Dolphins': 1450,
    'Minnesota Vikings': 1510,
    'New England Patriots': 1620,
    'New Orleans Saints': 1390,
    'New York Giants': 1440,
    'New York Jets': 1430,
    'Philadelphia Eagles': 1625,
    'Pittsburgh Steelers': 1520,
    'San Francisco 49ers': 1570,
    'Seattle Seahawks': 1610,
    'Tampa Bay Buccaneers': 1560,
    'Tennessee Titans': 1400,
    'Washington Commanders': 1530,
  },

  ensure() {
    if (!Store.data.elo) {
      Store.data.elo = {
        ratings: Object.assign({}, this.SEED_2026),
        processed: [],
        seededAt: Date.now(),
      };
      Store.save();
    }
    return Store.data.elo;
  },

  rating(team) {
    const elo = this.ensure();
    if (!(team in elo.ratings)) elo.ratings[team] = this.MEAN; // unknown name — neutral
    return elo.ratings[team];
  },

  /* Model view of a matchup. */
  predict(homeTeam, awayTeam) {
    const diff = this.rating(homeTeam) - this.rating(awayTeam) + this.HFA;
    return {
      homeWinProb: MMath.eloWinProb(diff),
      homeSpread: MMath.eloToSpread(diff), // negative = home favored
    };
  },

  /* Update ratings from completed games (The Odds API /scores payload).
     Each game is applied exactly once. Returns count applied. */
  applyScores(games) {
    const elo = this.ensure();
    const done = new Set(elo.processed);
    let applied = 0;

    for (const g of games) {
      if (!g.completed || done.has(g.id) || !g.scores) continue;
      const hs = g.scores.find(s => s.name === g.home_team);
      const as = g.scores.find(s => s.name === g.away_team);
      if (!hs || !as) continue;

      const homePts = Number(hs.score), awayPts = Number(as.score);
      const margin = homePts - awayPts;
      const diff = this.rating(g.home_team) - this.rating(g.away_team) + this.HFA;
      const expHome = MMath.eloWinProb(diff);
      const actHome = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
      const winnerDiff = margin >= 0 ? diff : -diff;
      const mult = margin === 0 ? 1 : MMath.movMultiplier(margin, winnerDiff);
      const delta = this.K * mult * (actHome - expHome);

      elo.ratings[g.home_team] = this.rating(g.home_team) + delta;
      elo.ratings[g.away_team] = this.rating(g.away_team) - delta;
      done.add(g.id);
      applied++;
    }

    elo.processed = [...done].slice(-500); // keep the list bounded
    Store.save();
    return applied;
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Elo;
