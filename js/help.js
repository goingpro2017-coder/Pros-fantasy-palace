/* Help — plain-English explanations built into the app: a "How It Works"
   guide, a glossary, and tap-to-explain popovers for jargon. Everything
   here is written for someone who has never bet before. */

const Help = {
  GLOSSARY: {
    spread: ['Spread', 'The margin of victory. "Giants +3" means the Giants can lose by 3 or fewer (or win outright) and your bet still wins. "Giants -3" means they must win by 4+.'],
    ats: ['Against the spread (ATS)', 'Betting the spread instead of just who wins — the most common NFL bet. You\'re betting on the margin, not only the winner.'],
    moneyline: ['Who wins (moneyline)', 'The simplest bet: just pick who wins the game, any margin. Favorites pay a little; underdogs pay more.'],
    total: ['Total (O/U)', 'The two teams\' combined points. You bet whether the real total goes Over or Under that number.'],
    edge: ['Edge', 'How many points the app\'s prediction differs from the Vegas line. A bigger edge means the app disagrees more with Vegas — and likes the bet more.'],
    cover: ['Cover %', 'The app\'s estimated chance this pick beats the spread. Anything over 50% means the app leans this way.'],
    value: ['Value', 'The app thinks this team wins more often than the betting price implies — so the price is a good deal for you.'],
    push: ['Push', 'A tie against the number (e.g. you bet -3 and they win by exactly 3). Nobody wins — your stake is simply refunded.'],
    parlay: ['Parlay', 'Several bets combined on one ticket. EVERY leg must win to cash. Tiny chance, huge payout — a lottery ticket.'],
    teaser: ['Teaser', 'A parlay where you shift the spreads in your favor to make each leg safer — in exchange for a smaller payout.'],
    clv: ['CLV (closing line value)', 'Did you bet a better number than where the line ended up at kickoff? Consistently beating the closing number is the #1 sign you actually have an edge — more reliable than any hot streak.'],
    hold: ['Hold', 'The sportsbook\'s built-in cut on a game. Lower hold = better prices for you. Bet where it\'s lowest.'],
    arb: ['Arbitrage (arb)', 'A rare setup where betting BOTH sides at different sportsbooks locks in a guaranteed profit no matter who wins.'],
    middle: ['Middle', 'Betting both sides on slightly different numbers, so one specific range of final scores wins BOTH bets. Miss the range and you only lose the small juice.'],
    flip: ['Flip', 'Disagree with the app\'s pick? Tap Flip to take the other side. The app tracks your flips as "You vs Model" so you can see whose calls are better.'],
    paper: ['Paper-trade', 'Placing bets with FAKE money to test the app risk-free. They\'re graded from real scores but never cost or win you a cent — proof before you play for real.'],
    vig: ['Vig / juice', 'The small fee baked into odds (that\'s why a bet risks $110 to win $100). It\'s how books make money, and why you need to win ~53% just to break even.'],
  },

  chip(key) {
    return `<button class="term" data-term="${key}" title="tap to explain">?</button>`;
  },

  showTerm(key) {
    const g = this.GLOSSARY[key];
    if (!g) return;
    this.modal(`<h3 style="margin:0 0 6px">${g[0]}</h3><p style="margin:0; color:var(--ink-2); line-height:1.5">${g[1]}</p>`);
  },

  modal(inner) {
    let ov = document.getElementById('help-modal');
    if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'help-modal';
    ov.className = 'help-overlay';
    ov.innerHTML = `<div class="help-box">${inner}
      <button class="btn btn-primary" id="help-close" style="margin-top:14px; width:100%">Got it</button></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.onclick = e => { if (e.target === ov) close(); };
    ov.querySelector('#help-close').onclick = close;
  },

  guideHtml() {
    return `
      <h3>What this app does for you</h3>
      <ol class="guide-list">
        <li><b>Tells you who to bet.</b> Every week it rates all 32 teams and gives a pick for each game — against the spread and straight-up.</li>
        <li><b>Gets you the better price.</b> The same bet can pay more at FanDuel vs DraftKings. The app shows which book, so you win a little extra when you're right.</li>
        <li><b>Keeps your scorecard.</b> It remembers every bet and shows if you're up or down — so you actually know if this works.</li>
      </ol>

      <h3>Try it with fake money first</h3>
      <p>Before risking a dollar, run it like a video game:</p>
      <ol class="guide-list">
        <li>On <b>Weekly Card</b>, scroll down and tap <b>📋 Paper-trade the card</b> — this "bets" fake money on every pick.</li>
        <li>After the games, tap <b>✓ Settle scores</b> at the top — it checks real scores and marks each fake bet win/lose.</li>
        <li>Open <b>Ledger → 📋 Paper</b>. One number tells the story: <span class="pos">green = the picks made fake money</span>, <span class="neg">red = they didn't</span>.</li>
      </ol>
      <p class="muted">Do that a few weeks. If the fake money grows, the picks are good and you can bet real. If not, you learned it for free.</p>

      <h3>The tabs, in plain words</h3>
      <ul class="guide-list">
        <li><b>Weekly Card</b> — this week's games and the app's pick for each. Your home base.</li>
        <li><b>Lightning Lab</b> — build big long-shot parlays for a small bet, huge payout.</li>
        <li><b>Line Shop</b> — a price table: where's the best deal on each bet.</li>
        <li><b>Arb Finder</b> — advanced; hunts for rare guaranteed-profit setups. Skip it at first.</li>
        <li><b>Ledger</b> — your scorecard: every bet and whether you're winning.</li>
        <li><b>Recap</b> — a tidy weekly summary you can copy and share.</li>
      </ul>

      <h3>Words you'll see (tap any "?" in the app)</h3>
      <div class="glossary">
        ${Object.keys(this.GLOSSARY).map(k =>
          `<div class="gloss-row"><b>${this.GLOSSARY[k][0]}</b><span>${this.GLOSSARY[k][1]}</span></div>`).join('')}
      </div>

      <p class="muted" style="margin-top:16px">Reminder: no app can guarantee winning — NFL betting is hard and the house has an edge. This tool's job is to give you the best shot and keep you honest. Bet only what you can afford to lose.</p>`;
  },

  render() {
    const el = document.getElementById('tab-help');
    el.innerHTML = `
      <div class="hero"><img class="hero-avatar" src="icon-512.png" alt="">
        <div class="hero-kicker">Start here</div>
        <div class="hero-line">How it works</div>
        <div class="hero-sub">A plain-English guide — no betting knowledge needed.</div>
      </div>
      <div class="card">${this.guideHtml()}</div>`;
  },

  /* one-time welcome pointing at the guide */
  maybeWelcome() {
    try {
      if (localStorage.getItem('pfp.seenGuide')) return;
    } catch (e) { /* ignore */ }
    this.modal(`
      <h3 style="margin:0 0 8px">👋 Welcome to Provini's Gambling Genie</h3>
      <p style="margin:0 0 10px; color:var(--ink-2); line-height:1.5">New to this? The <b>How It Works</b> tab explains everything in plain English —
      what the app does, what the numbers mean, and how to test it with fake money before betting real.</p>
      <button class="btn" id="welcome-guide" style="width:100%">📖 Show me how it works</button>`);
    try { localStorage.setItem('pfp.seenGuide', '1'); } catch (e) { /* ignore */ }
    const b = document.getElementById('welcome-guide');
    if (b) b.onclick = () => { document.getElementById('help-modal')?.remove(); App.showTab('help'); };
  },
};
