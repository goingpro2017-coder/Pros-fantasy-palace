/* Pure betting math. No DOM, no state — also runs under Node for tests. */

const MMath = {

  /* ---- odds conversions ---- */

  americanToDecimal(o) {
    return o > 0 ? 1 + o / 100 : 1 + 100 / -o;
  },

  decimalToAmerican(d) {
    if (d <= 1) return 0;
    return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
  },

  americanToImplied(o) {
    return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
  },

  impliedToAmerican(p) {
    if (p <= 0 || p >= 1) return 0;
    return this.decimalToAmerican(1 / p);
  },

  formatAmerican(o) {
    if (o === null || o === undefined || isNaN(o)) return '—';
    return o > 0 ? '+' + o : String(o);
  },

  /* Remove the vig from a two-way market: fair prob of side 1. */
  devig(odds1, odds2) {
    const p1 = this.americanToImplied(odds1);
    const p2 = this.americanToImplied(odds2);
    return p1 / (p1 + p2);
  },

  /* ---- parlay math ---- */

  /* legs: [{price, fairProb}] — price in american odds, fairProb de-vigged.
     Returns combined numbers assuming independent legs. */
  parlay(legs) {
    let dec = 1;
    let trueProb = 1;
    for (const leg of legs) {
      dec *= this.americanToDecimal(leg.price);
      trueProb *= (leg.fairProb !== undefined && leg.fairProb !== null)
        ? leg.fairProb
        : this.americanToImplied(leg.price);
    }
    const fairDecimal = trueProb > 0 ? 1 / trueProb : Infinity;
    return {
      decimal: dec,
      american: this.decimalToAmerican(dec),
      trueProb,
      fairDecimal,
      fairAmerican: this.decimalToAmerican(fairDecimal),
      /* expected value per $1 staked (negative = house edge) */
      evPer$: trueProb * dec - 1,
      /* share of a fair payout the book is offering */
      payoutShare: fairDecimal === Infinity ? 0 : dec / fairDecimal,
    };
  },

  /* ---- model helpers ---- */

  /* Elo difference (incl. home-field) -> home win probability */
  eloWinProb(eloDiff) {
    return 1 / (1 + Math.pow(10, -eloDiff / 400));
  },

  /* Elo difference -> point spread for the home team (negative = home favored) */
  eloToSpread(eloDiff) {
    return -eloDiff / 25;
  },

  /* Margin-of-victory Elo multiplier (FiveThirtyEight NFL formula) */
  movMultiplier(pointMargin, winnerEloDiff) {
    return Math.log(Math.abs(pointMargin) + 1) * (2.2 / (winnerEloDiff * 0.001 + 2.2));
  },

  /* Probability a side covers, from its point edge vs the market.
     NFL margins ≈ normal with sd ~13.86; each point of edge is worth
     roughly Φ(edge/sd) - 0.5 of cover probability. */
  coverProb(pointEdge) {
    return this.normCdf(pointEdge / 13.86);
  },

  normCdf(z) {
    /* Abramowitz-Stegun approximation, plenty for display */
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  },

  /* ---- arbitrage & middles ---- */

  /* Two-way arb check. hold < 1 means guaranteed profit; the stake split
     makes the return identical whichever side wins. */
  arbTwoWay(priceA, priceB, total) {
    const impA = this.americanToImplied(priceA);
    const impB = this.americanToImplied(priceB);
    const hold = impA + impB;
    const t = total || 100;
    return {
      hold,
      isArb: hold < 1,
      profitPct: 1 / hold - 1,     // negative = the books' combined vig
      stakeA: t * impA / hold,
      stakeB: t * impB / hold,
      guaranteedReturn: t / hold,
      profit: t / hold - t,
    };
  },

  /* ---- teasers ---- */

  /* Tease a spread: you always get MORE points (or lay fewer). */
  teaseSpread(point, pts) { return point + pts; },
  /* Tease a total: Over comes down, Under goes up. */
  teaseTotal(point, pts, isOver) { return isOver ? point - pts : point + pts; },

  /* Wong teaser check (6pt+): the teased spread crosses BOTH key numbers
     3 and 7 — underdogs +1.5 to +2.5, favorites -7.5 to -8.5. */
  isWongLeg(point, teasePts) {
    if (teasePts < 6) return false;
    return (point >= 1.5 && point <= 2.5) || (point <= -7.5 && point >= -8.5);
  },

  /* Cover probability of a leg teased by `pts` from the market number
     (which implies ~50%), under the normal-margin model. */
  teasedCoverProb(pts) { return this.normCdf(pts / 13.86); },

  /* ---- round robins ---- */

  combinations(arr, k) {
    if (k <= 0 || k > arr.length) return [];
    if (k === 1) return arr.map(x => [x]);
    const out = [];
    const rec = (start, combo) => {
      if (combo.length === k) { out.push(combo.slice()); return; }
      for (let i = start; i <= arr.length - (k - combo.length); i++) {
        combo.push(arr[i]);
        rec(i + 1, combo);
        combo.pop();
      }
    };
    rec(0, []);
    return out;
  },

  /* ---- money ---- */

  money(v) {
    const sign = v < 0 ? '-' : '';
    return sign + '$' + Math.abs(v).toFixed(2);
  },

  pct(p, digits) {
    return (p * 100).toFixed(digits === undefined ? 1 : digits) + '%';
  },
};

/* Node (tests) */
if (typeof module !== 'undefined' && module.exports) module.exports = MMath;
