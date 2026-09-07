/* Line Shop — FanDuel vs DraftKings side by side, best price highlighted.
   Same bet, better number: the closest thing to free money in betting. */

const LineShop = {

  render() {
    const el = document.getElementById('tab-shop');
    const cache = Store.data.oddsCache;

    if (!cache) {
      el.innerHTML = `<div class="card"><div class="empty">
        No odds loaded yet. Add your API key in <b>Settings</b>, then hit <b>↻ Refresh odds</b>.
      </div></div>`;
      return;
    }

    const now = Date.now();
    const events = cache.events
      .filter(ev => Date.parse(ev.commence_time) > now)
      .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));

    if (!events.length) {
      el.innerHTML = '<div class="card"><div class="empty">No upcoming games in the feed.</div></div>';
      return;
    }

    const books = Store.data.settings.books;
    const head = books.map(bk => `<th>${App.bookName(bk)}</th>`).join('');

    const rows = events.map(ev => {
      const when = new Date(ev.commence_time)
        .toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

      const cell = (market, name) => {
        // gather each book's quote for this side
        const quotes = books.map(bk => {
          const m = Api.market(ev, bk, market);
          const o = m && (m.outcomes || []).find(x => x.name === name);
          return o || null;
        });
        // best = highest price; for spreads/totals note when points differ
        let bestIdx = -1;
        quotes.forEach((q, i) => {
          if (q && (bestIdx === -1 || q.price > quotes[bestIdx].price)) bestIdx = i;
        });
        return quotes.map((q, i) => {
          if (!q) return '<td class="muted">—</td>';
          const pt = q.point !== undefined && q.point !== null
            ? ((market === 'totals' ? '' : q.point > 0 ? '+' : '') + q.point + ' ') : '';
          const cls = i === bestIdx && quotes.filter(Boolean).length > 1 ? 'best' : '';
          return `<td class="num ${cls}">${pt}${MMath.formatAmerican(q.price)}</td>`;
        }).join('');
      };

      const side = (label, market, name) => `
        <tr>
          <td><span class="muted small">${label}</span> ${App.short(name)}</td>
          ${cell(market, name)}
        </tr>`;

      const isFav = App.isFavGame(ev);
      return `
        <tr><td colspan="${books.length + 1}" style="padding-top:14px">
          <b>${App.short(ev.away_team)} @ ${App.short(ev.home_team)}</b>
          ${isFav ? ' <span class="pill bigblue">BIG BLUE</span>' : ''}
          <span class="muted small"> ${when}</span></td></tr>
        ${side('ML', 'h2h', ev.away_team)}
        ${side('ML', 'h2h', ev.home_team)}
        ${side('SPR', 'spreads', ev.away_team)}
        ${side('SPR', 'spreads', ev.home_team)}
        ${side('TOT', 'totals', 'Over')}
        ${side('TOT', 'totals', 'Under')}`;
    }).join('');

    el.innerHTML = `
      <div class="card">
        <h2>Line Shop</h2>
        <p class="sub">Best available price per side in <span class="best">green</span>.
          When the spread's points differ between books, more points on your side beats a slightly better price.</p>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Bet</th>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  },
};
