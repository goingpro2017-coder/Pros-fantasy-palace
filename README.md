# MarginAce ♠

A personal NFL betting edge-finder and tracker. No install, no server, no account —
one HTML page, your data stays in your browser.

**What it will not do:** guarantee profit. NFL markets are sharp; the standard −110
vig means you need 52.4% ATS just to break even. What MarginAce does is squeeze out
the edges that actually exist — better prices via line shopping, honest parlay math,
closing-line-value tracking so you know if you have an edge — and keep your season
honest in one ledger.

## The tabs

| Tab | What it does |
|---|---|
| **Weekly Card** | $1 against the spread + $1 straight up on every game. An Elo model makes the picks; flip any pick you disagree with and the Ledger scores *You vs Model* all season. Each pick is shopped to whichever book has the better number. |
| **Lightning Lab ⚡** | The long-shot parlay builder. Shows combined odds, *true* odds (de-vigged), what a fair payout would be, expected value per ticket, FanDuel-vs-DraftKings payout comparison, and correlation notes (blocks impossible leg combos, flags correlated ones). |
| **Line Shop** | Every game's moneyline, spread, and total at FanDuel and DraftKings side by side, best price highlighted. Same bet, better number — the closest thing to free money. |
| **Ledger** | Every bet auto-graded from final scores. Season P&L chart by category, ATS/straight-up records, parlay near-misses ("11 of 12 legs…"), average closing line value, and the You-vs-Model duel. |
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

*MarginAce is a tracking and analysis tool, not betting advice. Bet only what you
can afford to lose. 21+. Gambling problem? Call 1-800-GAMBLER.*
