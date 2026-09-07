/* Sanity tests for the betting math and Elo model. Run: node tests/math.test.js */

const assert = require('assert');
const MMath = require('../js/math.js');

// elo.js expects browser globals — stub them
global.MMath = MMath;
global.Store = {
  data: { elo: null },
  save() {},
};
const Elo = require('../js/elo.js');

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ✓ ' + name);
}
function close(a, b, eps, msg) {
  assert(Math.abs(a - b) < (eps || 1e-6), `${msg || ''} expected ~${b}, got ${a}`);
}

console.log('odds conversions');
ok('american +150 -> decimal 2.5', () => close(MMath.americanToDecimal(150), 2.5));
ok('american -110 -> decimal 1.909', () => close(MMath.americanToDecimal(-110), 1.9090909, 1e-4));
ok('decimal 2.5 -> +150', () => assert.equal(MMath.decimalToAmerican(2.5), 150));
ok('decimal 1.909 -> ~-110', () => assert(Math.abs(MMath.decimalToAmerican(1.9090909) - -110) <= 1));
ok('implied of -110 = 52.38%', () => close(MMath.americanToImplied(-110), 0.5238095, 1e-4));
ok('implied of +200 = 33.3%', () => close(MMath.americanToImplied(200), 1 / 3, 1e-4));
ok('devig -110/-110 = 50%', () => close(MMath.devig(-110, -110), 0.5));
ok('devig -200/+170 sums vig away', () => {
  const p = MMath.devig(-200, 170);
  const q = MMath.devig(170, -200);
  close(p + q, 1);
  assert(p > 0.6 && p < 0.7);
});

console.log('parlay math');
ok('two fair coin flips at +100 are EV-neutral', () => {
  const r = MMath.parlay([{ price: 100, fairProb: 0.5 }, { price: 100, fairProb: 0.5 }]);
  close(r.decimal, 4);
  close(r.trueProb, 0.25);
  close(r.evPer$, 0);
  close(r.payoutShare, 1);
});
ok('vig compounds across legs', () => {
  // three -110 legs, each truly 50%: book pays 6.96x, fair is 8x
  const legs = [1, 2, 3].map(() => ({ price: -110, fairProb: 0.5 }));
  const r = MMath.parlay(legs);
  close(r.trueProb, 0.125);
  close(r.fairDecimal, 8);
  assert(r.evPer$ < -0.12 && r.evPer$ > -0.14, 'ev ' + r.evPer$);
});
ok('missing fairProb falls back to implied', () => {
  const r = MMath.parlay([{ price: 100 }]);
  close(r.trueProb, 0.5);
});

console.log('model math');
ok('even elo = 50%', () => close(MMath.eloWinProb(0), 0.5));
ok('+100 elo ≈ 64%', () => close(MMath.eloWinProb(100), 0.64, 0.01));
ok('50 elo = 2-point favorite', () => close(MMath.eloToSpread(50), -2));
ok('coverProb(0) = 50%', () => close(MMath.coverProb(0), 0.5));
ok('coverProb(2) ≈ 55.7%', () => close(MMath.coverProb(2), 0.557, 0.01));
ok('normCdf symmetric', () => close(MMath.normCdf(1.5) + MMath.normCdf(-1.5), 1, 1e-4));

console.log('elo model');
ok('seed covers all 32 teams', () => {
  assert.equal(Object.keys(Elo.SEED_2026).length, 32);
});
ok('predict favors the stronger home team', () => {
  const p = Elo.predict('Buffalo Bills', 'New York Jets');
  assert(p.homeWinProb > 0.75, 'prob ' + p.homeWinProb);
  assert(p.homeSpread < -6, 'spread ' + p.homeSpread);
});
ok('applyScores moves ratings toward the winner, once per game', () => {
  const before = Elo.rating('New York Jets');
  const beforeBills = Elo.rating('Buffalo Bills');
  const game = {
    id: 'test-game-1', completed: true,
    home_team: 'New York Jets', away_team: 'Buffalo Bills',
    scores: [
      { name: 'New York Jets', score: '27' },
      { name: 'Buffalo Bills', score: '10' },
    ],
  };
  assert.equal(Elo.applyScores([game]), 1);
  assert(Elo.rating('New York Jets') > before, 'winner should gain');
  assert(Elo.rating('Buffalo Bills') < beforeBills, 'loser should drop');
  assert.equal(Elo.applyScores([game]), 0, 'same game must not apply twice');
});
ok('elo is zero-sum on updates', () => {
  const sumBefore = Object.values(Store.data.elo.ratings).reduce((a, b) => a + b, 0);
  const game = {
    id: 'test-game-2', completed: true,
    home_team: 'Chicago Bears', away_team: 'Detroit Lions',
    scores: [
      { name: 'Chicago Bears', score: '20' },
      { name: 'Detroit Lions', score: '23' },
    ],
  };
  Elo.applyScores([game]);
  const sumAfter = Object.values(Store.data.elo.ratings).reduce((a, b) => a + b, 0);
  close(sumAfter, sumBefore, 1e-6);
});

console.log(`\nall ${passed} tests passed`);
