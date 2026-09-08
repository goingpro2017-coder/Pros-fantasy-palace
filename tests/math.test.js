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

console.log('arbitrage');
ok('opposite plus-money on both sides is an arb', () => {
  const r = MMath.arbTwoWay(110, 110, 100);
  assert(r.isArb, 'should be arb');
  close(r.stakeA, 50); close(r.stakeB, 50);
  assert(r.profit > 0);
});
ok('standard -110/-110 is NOT an arb (it holds)', () => {
  const r = MMath.arbTwoWay(-110, -110, 100);
  assert(!r.isArb);
  assert(r.profit < 0);
  close(r.hold, 1.0476, 1e-3);
});
ok('arb split returns the same either way', () => {
  const r = MMath.arbTwoWay(120, -105, 100);
  const retA = r.stakeA * MMath.americanToDecimal(120);
  const retB = r.stakeB * MMath.americanToDecimal(-105);
  close(retA, retB, 1e-6);
  close(retA, r.guaranteedReturn, 1e-6);
});

console.log('teasers');
ok('6pt tease adds points to a dog', () => close(MMath.teaseSpread(2.5, 6), 8.5));
ok('6pt tease helps a favorite', () => close(MMath.teaseSpread(-7.5, 6), -1.5));
ok('total tease: Over comes down, Under goes up', () => {
  close(MMath.teaseTotal(48, 6, true), 42);
  close(MMath.teaseTotal(48, 6, false), 54);
});
ok('Wong legs: dog +2.5 and fav -7.5 qualify at 6pt', () => {
  assert(MMath.isWongLeg(2.5, 6));
  assert(MMath.isWongLeg(-7.5, 6));
  assert(!MMath.isWongLeg(3.5, 6), '+3.5 does not cross both keys the same way');
  assert(!MMath.isWongLeg(2.5, 5), 'under 6pts is not a Wong tease');
});
ok('teased cover prob beats 50%', () => assert(MMath.teasedCoverProb(6) > 0.6));

console.log('round robins');
ok('C(4,2) = 6 combos', () => assert.equal(MMath.combinations([1, 2, 3, 4], 2).length, 6));
ok('C(5,3) = 10 combos', () => assert.equal(MMath.combinations([1, 2, 3, 4, 5], 3).length, 10));
ok('combos are the right size and unique', () => {
  const c = MMath.combinations(['a', 'b', 'c'], 2);
  assert.deepEqual(c, [['a', 'b'], ['a', 'c'], ['b', 'c']]);
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
