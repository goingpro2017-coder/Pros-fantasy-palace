/* App shell: tabs, refresh actions, settings, shared helpers. */

const App = {
  activeTab: 'card',
  // Tuesday before the 2026 NFL kickoff — week boundaries run Tue→Mon
  WEEK1: Date.UTC(2026, 8, 8),

  /* ---------- helpers ---------- */

  short(team) {
    if (!team) return '—';
    const parts = team.split(' ');
    return parts.length > 1 ? parts[parts.length - 1] : team;
  },

  bookName(key) {
    return { fanduel: 'FanDuel', draftkings: 'DraftKings' }[key] || key || '—';
  },

  fav() { return Store.data.settings.favoriteTeam; },
  isFav(team) { return !!team && team === this.fav(); },
  isFavGame(objWithTeams) {
    return !!objWithTeams &&
      (this.isFav(objWithTeams.home_team || objWithTeams.home) ||
       this.isFav(objWithTeams.away_team || objWithTeams.away));
  },

  weekOf(t) {
    const w = Math.floor((t - this.WEEK1) / (7 * 864e5)) + 1;
    return (w >= 1 && w <= 23) ? w : null;
  },

  banner(msg, cls) {
    const el = document.getElementById('banner');
    el.textContent = msg;
    el.className = 'banner' + (cls ? ' ' + cls : '');
    el.hidden = false;
    clearTimeout(this._bannerTimer);
    if (cls === 'good' || !cls) {
      this._bannerTimer = setTimeout(() => { el.hidden = true; }, 8000);
    }
  },

  renderQuota() {
    const el = document.getElementById('quota-badge');
    const q = Store.data.quota;
    el.textContent = q ? `API: ${q.remaining} left` : '';
  },

  renderSpend() {
    const week = this.weekOf(Date.now());
    const cap = Store.data.settings.weeklyCap;
    if (!cap) return;
    const spent = Store.data.bets
      .filter(b => this.weekOf(b.createdAt) === week && (b.mode || 'real') === 'real')
      .reduce((s, b) => s + b.stake, 0);
    if (spent > cap) {
      this.banner(`Heads up: ${MMath.money(spent)} staked this week — over your ${MMath.money(cap)} cap. The lightning can wait for next week.`, 'warn');
    }
  },

  /* ---------- tabs ---------- */

  showTab(name) {
    this.activeTab = name;
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach(p =>
      p.hidden = p.id !== 'tab-' + name);
    this.renderTab(name);
  },

  renderTab(name) {
    if (name === 'help') Help.render();
    else if (name === 'card') Card.render();
    else if (name === 'genie') Genie.render();
    else if (name === 'lab') Parlay.render();
    else if (name === 'shop') LineShop.render();
    else if (name === 'arb') Arb.render();
    else if (name === 'ledger') Ledger.render();
    else if (name === 'recap') Recap.render();
    else if (name === 'settings') this.renderSettings();
  },

  renderAll() {
    this.renderTab(this.activeTab);
    this.renderQuota();
  },

  /* ---------- actions ---------- */

  async refreshOdds() {
    const btn = document.getElementById('btn-refresh-odds');
    btn.disabled = true;
    try {
      const events = await Api.fetchOdds();
      this.banner(`Odds updated — ${events.length} games in the feed. (3 API credits used)`, 'good');
    } catch (e) {
      this.banner(e.message, 'error');
    }
    btn.disabled = false;
    this.renderAll();
  },

  async refreshScores() {
    const btn = document.getElementById('btn-refresh-scores');
    btn.disabled = true;
    try {
      const games = await Api.fetchScores();
      const applied = Elo.applyScores(games);
      const settled = Ledger.settleFromScores(games);
      this.banner(`Scores in: settled ${settled} bet${settled === 1 ? '' : 's'}, model learned from ${applied} final${applied === 1 ? '' : 's'}. (2 API credits used)`, 'good');
    } catch (e) {
      this.banner(e.message, 'error');
    }
    btn.disabled = false;
    this.renderAll();
  },

  /* ---------- settings ---------- */

  renderSettings() {
    const el = document.getElementById('tab-settings');
    const s = Store.data.settings;
    const elo = Elo.ensure();
    const ratings = Object.entries(elo.ratings).sort((a, b) => b[1] - a[1]);
    const mean = ratings.reduce((sum, r) => sum + r[1], 0) / ratings.length;

    const ratingRows = ratings.map(([team, r], i) => `
      <tr><td class="muted">${i + 1}</td><td>${team}</td>
      <td class="num">${Math.round(r)}</td>
      <td class="num muted">${((r - mean) / 25 > 0 ? '+' : '') + ((r - mean) / 25).toFixed(1)}</td></tr>`).join('');

    el.innerHTML = `
      <div class="card">
        <h2>Settings</h2>
        <div class="form-row">
          <label for="set-apikey">The Odds API key</label>
          <input type="password" id="set-apikey" value="${s.apiKey}" placeholder="free key from the-odds-api.com">
          <button class="btn btn-sm" id="btn-show-key">show</button>
        </div>
        <p class="sub">Free tier = 500 credits/month. A full odds refresh costs 3, settling scores costs 2 —
          two refreshes + one settle per week uses ~32/month.</p>
        <div class="form-row">
          <label for="set-primary">Primary book (your main app)</label>
          <select id="set-primary">
            <option value="fanduel" ${s.primaryBook === 'fanduel' ? 'selected' : ''}>FanDuel</option>
            <option value="draftkings" ${s.primaryBook === 'draftkings' ? 'selected' : ''}>DraftKings</option>
          </select>
        </div>
        <div class="form-row">
          <label for="set-cap">Weekly stake cap ($, soft warning)</label>
          <input type="number" id="set-cap" value="${s.weeklyCap}" min="0" step="5" style="width:100px">
        </div>
        <div class="form-row">
          <label for="set-fav">Your team 🏈</label>
          <select id="set-fav">
            ${Object.keys(Elo.SEED_2026).map(t =>
              `<option value="${t}" ${t === s.favoriteTeam ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" id="btn-save-settings">Save settings</button>
      </div>

      <div class="card">
        <h2>Try it out</h2>
        <p class="sub">No key yet? Load a sample week of games — with a built-in arbitrage and a middle —
          to explore every tab. Demo data is clearly marked and never spends a credit.</p>
        <button class="btn" id="btn-load-demo">🎮 Load demo data</button>
      </div>

      <div class="card">
        <h2>Your data</h2>
        <p class="sub">Everything lives in this browser only. Export a backup now and then —
          clearing browser data wipes the ledger.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" id="btn-export">⬇ Export backup (.json)</button>
          <label class="btn" style="display:inline-block">⬆ Import backup
            <input type="file" id="file-import" accept=".json" hidden></label>
          <button class="btn btn-danger" id="btn-wipe">Erase everything</button>
        </div>
      </div>

      <div class="card">
        <h2>Model power ratings</h2>
        <p class="sub">Elo ratings, seeded for 2026 and self-updating from final scores every time you settle.
          "Pts vs avg" is what the rating means as a point spread against an average team at a neutral site.
          Seeded ${new Date(elo.seededAt).toLocaleDateString()} · ${elo.processed.length} games learned.</p>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>#</th><th>Team</th><th class="num">Elo</th><th class="num">Pts vs avg</th></tr></thead>
            <tbody>${ratingRows}</tbody>
          </table>
        </div>
        <button class="btn btn-danger btn-sm" id="btn-reseed" style="margin-top:10px">Reset model to preseason seed</button>
      </div>`;

    document.getElementById('btn-save-settings').onclick = () => {
      s.apiKey = document.getElementById('set-apikey').value.trim();
      s.primaryBook = document.getElementById('set-primary').value;
      s.weeklyCap = parseFloat(document.getElementById('set-cap').value) || 0;
      s.favoriteTeam = document.getElementById('set-fav').value;
      Store.save();
      this.banner('Settings saved.', 'good');
    };
    document.getElementById('btn-load-demo').onclick = () => Demo.load(false);
    document.getElementById('btn-show-key').onclick = () => {
      const inp = document.getElementById('set-apikey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    };
    document.getElementById('btn-export').onclick = () => {
      const blob = new Blob([Store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pros-fantasy-palace-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    document.getElementById('file-import').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        Store.importJson(await file.text());
        this.banner('Backup imported.', 'good');
        this.renderAll();
      } catch (err) {
        this.banner('Import failed: ' + err.message, 'error');
      }
    };
    document.getElementById('btn-wipe').onclick = () => {
      if (confirm('Erase ALL Pro\'s Fantasy Palace data (bets, settings, model)? This cannot be undone.')) {
        localStorage.removeItem(Store.KEY);
        Store.load();
        this.renderAll();
        this.banner('All data erased.', '');
      }
    };
    document.getElementById('btn-reseed').onclick = () => {
      if (confirm('Reset team ratings to the preseason seed? Season learning will be lost.')) {
        Store.data.elo = null;
        Elo.ensure();
        this.renderSettings();
        this.banner('Model reset to preseason ratings.', 'good');
      }
    };
  },

  /* ---------- init ---------- */

  init() {
    Store.load();
    Elo.ensure();

    // Demo builds (shared preview link): preload the sample slate so every
    // tab has data, with no key and no network.
    if (typeof Demo !== 'undefined' && Demo.isActive() && !Store.data.oddsCache) {
      Demo.load(true);
    }

    document.getElementById('tabs').addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (tab) this.showTab(tab.dataset.tab);
    });
    // tap any "?" jargon chip anywhere in the app to get a plain explanation
    document.body.addEventListener('click', e => {
      const t = e.target.closest('[data-term]');
      if (t) { e.preventDefault(); Help.showTerm(t.dataset.term); return; }
      if (e.target.closest('[data-open-help]')) { e.preventDefault(); this.showTab('help'); }
    });
    document.getElementById('btn-refresh-odds').onclick = () => this.refreshOdds();
    document.getElementById('btn-refresh-scores').onclick = () => this.refreshScores();

    if (Demo.isActive()) {
      this.banner('🎮 Demo mode — a sample week is loaded so you can explore every tab. Live odds and notifications need the hosted version with your API key.', '');
      this.showTab('card');
    } else if (!Store.data.settings.apiKey) {
      this.banner("Welcome to Provini’s Gambling Genie, Big Blue Edition. New here? Tap “Load demo data” in Settings to explore with sample games, or grab a free API key at the-odds-api.com for live odds. 🏈", '');
      this.showTab('settings');
    } else {
      this.showTab('card');
    }
    this.renderQuota();
    this.renderSpend();
    Help.maybeWelcome();
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
