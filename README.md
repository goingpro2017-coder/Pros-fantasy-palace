# Provini’s Palace 🏈 — Big Blue Edition

A personal NFL betting edge-finder and tracker, dressed in Giants navy and red.
No install, no server, no account — one HTML page, your data stays in your browser.

Personalized touches: a **Big Blue Watch** hero with the model's take on the next
Giants game, Giants games highlighted across the app, and a "Giants bets" record
in the Ledger (betting with your heart, quantified). Pick a different favorite
team in Settings if a Cowboys fan ever borrows this.

**What it will not do:** guarantee profit. NFL markets are sharp; the standard −110
vig means you need 52.4% ATS just to break even. What the Palace does is squeeze out
the edges that actually exist — better prices via line shopping, honest parlay math,
closing-line-value tracking so you know if you have an edge — and keep your season
honest in one ledger.

## The tabs

| Tab | What it does |
|---|---|
| **Weekly Card** | $1 against the spread + $1 straight up on every game. An Elo model makes the picks; flip any pick you disagree with and the Ledger scores *You vs Model* all season. Each pick is shopped to whichever book has the better number. **Two ways to log:** *🔒 real bets* (money you're actually placing) or *📋 paper-trade* (fake money, to test the model's accuracy risk-free). |
| **Lightning Lab ⚡** | The long-shot builder, two modes. **Parlay:** combined odds, *true* odds (de-vigged), fair payout, EV per ticket, FD-vs-DK payout comparison, correlation notes (blocks impossible combos, flags correlated ones), on-demand **player props** (pass/rush/rec yards, TDs, receptions), and **round robins** (every combo as its own ticket, with the "one leg misses, still cashes" safety-net math). **Teaser:** 6/6.5/7-point spread & total teasers with payout tables, per-leg hit rates, and ⭐ Wong-leg flags (teasing through both key numbers 3 and 7). |
| **Line Shop** | Every game's moneyline, spread, and total at FanDuel and DraftKings side by side, best price highlighted. Same bet, better number — the closest thing to free money. |
| **Arb Finder 💰** | Scans FD vs DK for guaranteed two-way arbitrage (with the stake split), **middles** (line gaps where a window of final scores wins both bets — key numbers 3 & 7 flagged), and the cheapest-hold markets. Honest about it: true 2-book arbs are rare; middles are the everyday find. Includes the **🔔 Watcher**: keep the tab open and it rescans on your chosen interval and fires a browser notification the moment a new arb or key-number middle appears. Shows its API-credit burn rate and auto-pauses when credits run low. (No server means no push when the app is fully closed — the tab must stay open; on a phone, add to home screen and keep it running.) |
| **Ledger** | Every bet auto-graded from final scores (props settle with one click). Season P&L chart by category, ATS/straight-up records, parlay & teaser near-misses, average closing line value, You-vs-Model, and a Giants-bets line. Filter **All / 💵 Real / 📋 Paper** so hypothetical accuracy-test bets never mix with real-money results. |

## Testing the model before you trust it (paper trading)

Not sure the model actually works? Don't bet a dollar until you've watched it.
Hit **📋 Paper-trade the card** on the Weekly Card (or check *paper mode* in the
Lightning Lab) to log the model's picks with fake money. Settle scores each week
like normal — paper bets grade themselves from real final scores — then open the
Ledger's **Paper** filter or the Recap's **Paper** toggle to see exactly what
*would* have happened. It's the honest way to measure the model's accuracy and
your own flips before any real money is on the line.
| **Recap** | The Monday damage report: per-week or season-to-date P&L, best win, worst beat, closest parlay, CLV, You-vs-Model — with a one-tap copy-ready text summary for the group chat. |
| **Settings** | API key, primary book, weekly stake cap (soft warning), JSON backup/restore, and the model's live power ratings. |

## Setup (5 minutes)

1. **Get a free API key** at [the-odds-api.com](https://the-odds-api.com) (500
   credits/month free — a weekly routine uses ~30).
2. **Open the app**: easiest is to serve the folder —
   ```
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`. (Or enable GitHub Pages on this repo and
   open it anywhere, phone included. Opening `index.html` directly also works in
   most browsers.)
3. Paste the key in **Settings → Save**, then hit **↻ Refresh odds**.

## Weekly routine

- **Tue/Wed** — Refresh odds, look over the Weekly Card, flip anything you disagree
  with, lock it, and place the bets at the listed books.
- **Anytime** — Build lottery tickets in the Lightning Lab; log the ones you place.
- **Mon night** — Hit **✓ Settle scores**: grades every bet *and* feeds the finals
  back into the Elo model so it sharpens as the season goes.

## The model

Elo power ratings (25 points ≈ 1 point of spread, home field ≈ 2 points), seeded
for 2026 from last season's results regressed to the mean, then self-updating from
final scores with a margin-of-victory multiplier — the FiveThirtyEight NFL Elo
recipe. It exists to find the games where its number disagrees with the market,
not to out-predict Vegas everywhere. Judge it (and yourself) by closing line
value, not by any hot streak.

## Notes

- All data lives in `localStorage` in the one browser you use it in. **Export a
  backup** (Settings) now and then.
- Odds refresh costs 3 API credits; settling costs 2. The header shows credits left.
- Custom parlay legs (player props) are priced at their implied odds — the free
  API tier doesn't carry prop markets to de-vig.
- Tests: `node tests/math.test.js`.

---

*Provini’s Palace is a tracking and analysis tool, not betting advice. Bet only what you
can afford to lose. 21+. Gambling problem? Call 1-800-GAMBLER.*
