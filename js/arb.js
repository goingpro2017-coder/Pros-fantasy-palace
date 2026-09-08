/* Arb Finder — scans FanDuel vs DraftKings for three things:
   1. True arbitrage: opposite sides priced so both bets guarantee profit.
   2. Middles: line gaps where a window of final margins wins BOTH bets,
      while missing the window loses only the vig.
   3. Low-hold markets: where betting is cheapest.
   Honesty note: with two books, true arbs are rare and short-lived;
   middles are the realistic find. */

const Arb = {
  total: 100, // stake to split across an arb

  collect(ev, market, name) {
    const out = [];
    for (const bk of Store.data.settings.books) {
      const m = Api.market(ev, bk, market);
      if (!m) continue;
      for (const o of m.outcomes || []) {
        if (o.name === name) out.push({ book: bk, price: o.price, point: o.point });
      }
    }
    return out;
  },

  scan() {
    const arbs = [], middles = [], holds = [];
    const cache = Store.data.oddsCache;
    if (!cache) return { arbs, middles, holds };
    const now = Date.now();

    for (const ev of cache.events) {
      if (Date.parse(ev.commence_time) < now) continue;
      const label = `${App.short(ev.away_team)} @ ${App.short(ev.home_team)}`;
      const kick = new Date(ev.commence_time).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

      // --- moneyline: best price each side across books ---
      const mlA = this.collect(ev, 'h2h', ev.away_team).sort((a, b) => b.price - a.price)[0];
      const mlH = this.collect(ev, 'h2h', ev.home_team).sort((a, b) => b.price - a.price)[0];
      if (mlA && mlH) {
        const r = MMath.arbTwoWay(mlA.price, mlH.price, this.total);
        const entry = {
          ev, label, kick, market: 'Moneyline',
          sideA: `${App.short(ev.away_team)} ML ${MMath.formatAmerican(mlA.price)} @ ${App.bookName(mlA.book)}`,
          sideB: `${App.short(ev.home_team)} ML ${MMath.formatAmerican(mlH.price)} @ ${App.bookName(mlH.book)}`,
          r,
        };
        if (r.isArb) arbs.push(entry); else holds.push(entry);
      }

      // --- spreads: same-point arbs + middles ---
      const spA = this.collect(ev, 'spreads', ev.away_team);
      const spH = this.collect(ev, 'spreads', ev.home_team);
      for (const a of spA) {
        for (const h of spH) {
          if (a.point === undefined || h.point === undefined) continue;
          if (a.point + h.point === 0) {
            const r = MMath.arbTwoWay(a.price, h.price, this.total);
            const entry = {
              ev, label, kick, market: 'Spread',
              sideA: `${App.short(ev.away_team)} ${(a.point > 0 ? '+' : '') + a.point} ${MMath.formatAmerican(a.price)} @ ${App.bookName(a.book)}`,
              sideB: `${App.short(ev.home_team)} ${(h.point > 0 ? '+' : '') + h.point} ${MMath.formatAmerican(h.price)} @ ${App.bookName(h.book)}`,
              r,
            };
            if (r.isArb && a.book !== h.book) arbs.push(entry); else holds.push(entry);
          } else if (a.point + h.point > 0 && a.book !== h.book) {
            const m = this.middleEntry(ev, label, kick, 'Spread', a, h,
              a.point > 0 ? a : h, a.point > 0 ? h : a);
            if (m) middles.push(m);
          }
        }
      }

      // --- totals: same-point arbs + middles ---
      const ovs = this.collect(ev, 'totals', 'Over');
      const uns = this.collect(ev, 'totals', 'Under');
      for (const o of ovs) {
        for (const u of uns) {
          if (o.point === undefined || u.point === undefined) continue;
          if (o.point === u.point) {
            const r = MMath.arbTwoWay(o.price, u.price, this.total);
            const entry = {
              ev, label, kick, market: 'Total',
              sideA: `Over ${o.point} ${MMath.formatAmerican(o.price)} @ ${App.bookName(o.book)}`,
              sideB: `Under ${u.point} ${MMath.formatAmerican(u.price)} @ ${App.bookName(u.book)}`,
              r,
            };
            if (r.isArb && o.book !== u.book) arbs.push(entry); else holds.push(entry);
          } else if (u.point > o.point && o.book !== u.book) {
            const m = this.totalMiddleEntry(ev, label, kick, o, u);
            if (m) middles.push(m);
          }
        }
      }
    }

    arbs.sort((a, b) => b.r.profitPct - a.r.profitPct);
    middles.sort((a, b) => b.score - a.score);
    holds.sort((a, b) => a.r.hold - b.r.hold);
    return { arbs, middles, holds: holds.slice(0, 10) };
  },

  /* dog = positive-point side, fav = negative-point side */
  middleEntry(ev, label, kick, market, a, h, dog, fav) {
    const lo = -fav.point, hi = dog.point; // both win when margin in (lo, hi) exclusive of halves
    const winNums = [];
    for (let m = Math.ceil(lo + 0.5); m <= Math.floor(hi - 0.5); m++) winNums.push(m);
    if (!winNums.length) return null; // 0.5-pt gap: only a push-middle, not a real one
    const key = winNums.filter(n => n === 3 || n === 7);
    const favTeam = fav === a ? ev.away_team : ev.home_team;
    const dogTeam = dog === a ? ev.away_team : ev.home_team;
    const econ = this.middleEcon(dog.price, fav.price);
    return {
      label, kick, market,
      sideA: `${App.short(dogTeam)} ${(dog.point > 0 ? '+' : '') + dog.point} ${MMath.formatAmerican(dog.price)} @ ${App.bookName(dog.book)}`,
      sideB: `${App.short(favTeam)} ${(fav.point > 0 ? '+' : '') + fav.point} ${MMath.formatAmerican(fav.price)} @ ${App.bookName(fav.book)}`,
      window: `${App.short(favTeam)} wins by ${winNums.join(', ')}`,
      winNums, key,
      score: winNums.length + key.length * 2,
      econ,
    };
  },

  totalMiddleEntry(ev, label, kick, o, u) {
    const winNums = [];
    for (let t = Math.ceil(o.point + 0.5); t <= Math.floor(u.point - 0.5); t++) winNums.push(t);
    if (!winNums.length) return null;
    const econ = this.middleEcon(o.price, u.price);
    return {
      label, kick, market: 'Total',
      sideA: `Over ${o.point} ${MMath.formatAmerican(o.price)} @ ${App.bookName(o.book)}`,
      sideB: `Under ${u.point} ${MMath.formatAmerican(u.price)} @ ${App.bookName(u.book)}`,
      window: `total lands ${winNums.length > 4 ? winNums[0] + '–' + winNums[winNums.length - 1] : winNums.join(', ')}`,
      winNums, key: [],
      score: winNums.length,
      econ,
    };
  },

  /* Stake each side to win $100: worst case loses only the vig,
     hitting the window wins both. */
  middleEcon(priceA, priceB) {
    const sA = 100 / (MMath.americanToDecimal(priceA) - 1);
    const sB = 100 / (MMath.americanToDecimal(priceB) - 1);
    return {
      stakeA: sA, stakeB: sB,
      total: sA + sB,
      missProfit: 100 - Math.max(sA, sB), // one side always wins in a middle setup
      hitProfit: 200,
    };
  },

  render() {
    const el = document.getElementById('tab-arb');
    if (!Store.data.oddsCache) {
      el.innerHTML = `<div class="card"><div class="empty">
        No odds loaded yet. Add your API key in <b>Settings</b>, then hit <b>↻ Refresh odds</b>.
      </div></div>`;
      return;
    }

    const { arbs, middles, holds } = this.scan();
    const fetched = new Date(Store.data.oddsCache.fetchedAt).toLocaleString();

    const arbRows = arbs.map(a => `
      <tr>
        <td><b>${a.label}</b><br><span class="muted small">${a.market} · ${a.kick}</span></td>
        <td>${a.sideA}<br>${a.sideB}</td>
        <td class="num"><b class="pos">+${MMath.pct(a.r.profitPct, 2)}</b></td>
        <td class="num">${MMath.money(a.r.stakeA)}<br>${MMath.money(a.r.stakeB)}</td>
        <td class="num pos">${MMath.money(a.r.profit)}</td>
      </tr>`).join('');

    const arbSection = arbs.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Game</th><th>Both sides</th><th class="num">Edge</th>
          <th class="num">Stake split ($${this.total})</th><th class="num">Locked profit</th></tr></thead>
        <tbody>${arbRows}</tbody>
      </table></div>
      <p class="sub">Move fast — arbs die when a book adjusts. Bet both sides before either line moves.</p>`
      : `<div class="empty">No true arbs right now — normal with two books. They appear when FD and DK
        disagree after news (injuries, weather). Refresh odds Sunday morning and after big announcements.</div>`;

    const midRows = middles.map(m => `
      <tr>
        <td><b>${m.label}</b><br><span class="muted small">${m.market} · ${m.kick}</span></td>
        <td>${m.sideA}<br>${m.sideB}</td>
        <td>${m.window}
          ${m.key.length ? `<br><span class="pill good">key number${m.key.length > 1 ? 's' : ''} ${m.key.join(' & ')} in window</span>` : ''}</td>
        <td class="num">${MMath.money(m.econ.total)}<br><span class="muted small">${MMath.money(m.econ.stakeA)} / ${MMath.money(m.econ.stakeB)}</span></td>
        <td class="num"><span class="pos">+${MMath.money(m.econ.hitProfit)}</span> hit<br>
          <span class="${m.econ.missProfit >= 0 ? 'pos' : 'neg'}">${MMath.money(m.econ.missProfit)}</span> miss</td>
      </tr>`).join('');

    const midSection = middles.length ? `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Game</th><th>Both sides</th><th>Middle window</th>
          <th class="num">Cost (to win $100/side)</th><th class="num">Outcome</th></tr></thead>
        <tbody>${midRows}</tbody>
      </table></div>
      <p class="sub">A middle wins BOTH bets when the game lands in the window; otherwise one side cashes and
        you're out roughly the vig. Windows containing 3 or 7 (the NFL key numbers) hit far more often.</p>`
      : '<div class="empty">No middle windows between your books right now.</div>';

    const holdRows = holds.map(h => `
      <tr>
        <td><b>${h.label}</b> <span class="muted small">${h.market}</span></td>
        <td class="small">${h.sideA}<br>${h.sideB}</td>
        <td class="num">${MMath.pct(h.r.hold - 1, 2)}</td>
      </tr>`).join('');

    el.innerHTML = `
      <div class="card">
        <h2>Arb Finder 💰</h2>
        <p class="sub">Scanning FanDuel vs DraftKings as of ${fetched}. Straight talk: 2-book NFL arbs are rare —
          middles are the everyday find, and books may limit accounts that only ever arb.</p>
        <label>Total to split across an arb $
          <input type="number" id="arb-total" value="${this.total}" min="10" step="10" style="width:90px"></label>
        <h3>Guaranteed arbs (${arbs.length})</h3>
        ${arbSection}
        <h3>Middles (${middles.length})</h3>
        ${midSection}
        <h3>Cheapest markets (lowest combined hold)</h3>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Game</th><th>Best two-way pricing</th><th class="num">Hold</th></tr></thead>
          <tbody>${holdRows || '<tr><td colspan="3" class="muted">nothing to scan</td></tr>'}</tbody>
        </table></div>
        <p class="sub">Hold = what the books keep pricing both sides at their best numbers. Bet where it's lowest.</p>
      </div>`;

    const totalEl = document.getElementById('arb-total');
    if (totalEl) totalEl.onchange = () => {
      this.total = Math.max(10, parseFloat(totalEl.value) || 100);
      this.render();
    };
  },
};
