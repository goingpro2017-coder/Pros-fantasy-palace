/* Watcher — while the app is open, periodically re-fetch odds, rescan for
   arbs and key-number middles, and fire a browser notification on anything
   NEW. No server, so this only runs with the tab open; true closed-app push
   would need a backend. Guarded against burning API credits. */

const Watcher = {
  timer: null,
  running: false,
  lastCheck: null,
  lastResult: '',

  prefs() { return Store.data.settings.watcher; },

  /* stable signature so the same opportunity isn't alerted twice */
  sig(kind, o) {
    if (kind === 'arb') return `arb|${o.label}|${o.market}|${o.sideA}|${o.sideB}`;
    return `mid|${o.label}|${o.market}|${o.sideA}|${o.sideB}|${o.winNums.join(',')}`;
  },

  supported() { return typeof Notification !== 'undefined'; },

  async ensurePermission() {
    if (!this.supported()) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { return (await Notification.requestPermission()) === 'granted'; }
    catch (e) { return false; }
  },

  notify(title, body) {
    try {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏈</text></svg>',
        tag: 'pfp-watcher-' + Date.now(),
      });
    } catch (e) { /* notifications may be blocked; in-app banner still fires */ }
  },

  async start() {
    const ok = await this.ensurePermission();
    if (!ok) {
      App.banner(this.supported()
        ? 'Notifications are blocked in your browser settings — enable them for this site to get alerts.'
        : 'This browser has no notifications, or the app is opened from a file:// path. Serve it from localhost or GitHub Pages.', 'warn');
      // still allow in-app-only watching
    }
    if (!Store.data.settings.apiKey) {
      App.banner('Add your API key in Settings before starting the Watcher.', 'error');
      return;
    }
    this.running = true;
    this.check(); // immediate first pass
    this.timer = setInterval(() => this.check(), this.prefs().intervalMin * 60000);
    App.banner(`Watcher on — rescanning every ${this.prefs().intervalMin} min while this tab stays open. 🔔`, 'good');
    if (App.activeTab === 'arb') Arb.render();
  },

  stop() {
    this.running = false;
    clearInterval(this.timer);
    this.timer = null;
    App.banner('Watcher off.', '');
    if (App.activeTab === 'arb') Arb.render();
  },

  toggle() { this.running ? this.stop() : this.start(); },

  async check() {
    const p = this.prefs();
    const q = Store.data.quota;
    if (q && Number(q.remaining) < p.minCredits) {
      App.banner(`Watcher paused: only ${q.remaining} API credits left (floor is ${p.minCredits}). Raise the floor in Settings or top up next month.`, 'warn');
      this.stop();
      return;
    }

    try {
      await Api.fetchOdds();               // 3 credits
    } catch (e) {
      App.banner('Watcher: odds refresh failed — ' + e.message, 'error');
      return;
    }
    this.lastCheck = Date.now();

    const { arbs, middles } = Arb.scan();
    const fresh = [];
    const seen = Store.data.watcherSeen;

    if (p.alertArbs) {
      for (const a of arbs) {
        const s = this.sig('arb', a);
        if (!seen[s]) { seen[s] = Date.now(); fresh.push({ type: 'ARB', text: `${a.label}: ${MMath.pct(a.r.profitPct, 1)} locked (${a.sideA} / ${a.sideB})` }); }
      }
    }
    if (p.alertMiddles) {
      for (const m of middles) {
        if (p.keyOnly && !m.key.length) continue; // only middles hitting 3 or 7
        const s = this.sig('mid', m);
        if (!seen[s]) { seen[s] = Date.now(); fresh.push({ type: 'MIDDLE', text: `${m.label}: ${m.window}${m.key.length ? ' (key ' + m.key.join('&') + ')' : ''}` }); }
      }
    }

    // prune signatures older than 3 days
    for (const k in seen) if (Date.now() - seen[k] > 3 * 864e5) delete seen[k];
    Store.save();

    if (fresh.length) {
      const title = `🏈 ${fresh.length} new ${fresh.length === 1 ? 'opportunity' : 'opportunities'}`;
      this.notify(title, fresh.map(f => `[${f.type}] ${f.text}`).join('\n'));
      App.banner(`${title} — ${fresh.map(f => f.text).join(' · ')}`, 'good');
      this.lastResult = `${new Date().toLocaleTimeString()}: found ${fresh.length}`;
    } else {
      this.lastResult = `${new Date().toLocaleTimeString()}: nothing new`;
    }

    App.renderQuota();
    if (App.activeTab === 'arb') Arb.render();
  },

  /* credit-burn estimate for the current interval */
  creditsPerHour() { return Math.round(60 / this.prefs().intervalMin) * 3; },

  renderControl() {
    const p = this.prefs();
    const permTxt = !this.supported() ? 'no notifications here (use localhost/HTTPS)'
      : Notification.permission === 'granted' ? 'notifications allowed'
      : Notification.permission === 'denied' ? 'notifications blocked in browser'
      : 'notifications not yet allowed';

    return `
      <div class="card" style="border-top:2px solid var(--giants-red)">
        <h2>🔔 Watcher</h2>
        <p class="sub">Keep this tab open and the Palace rescans on its own, pinging you the moment a
          guaranteed arb or a key-number middle shows up. Alerts arrive as browser notifications
          (works with the tab open — no closed-app push without a server).</p>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
          <button class="btn ${this.running ? 'btn-danger' : 'btn-primary'}" id="btn-watch-toggle">
            ${this.running ? '■ Stop watching' : '▶ Start watching'}</button>
          <span class="pill ${this.running ? 'good' : ''}">${this.running ? 'watching' : 'idle'}</span>
          <span class="muted small">${permTxt}</span>
        </div>
        <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
          <label>Check every
            <select id="watch-interval" ${this.running ? 'disabled' : ''}>
              ${[5, 10, 15, 30, 60].map(m => `<option value="${m}" ${m === p.intervalMin ? 'selected' : ''}>${m} min</option>`).join('')}
            </select>
          </label>
          <label><input type="checkbox" id="watch-arbs" ${p.alertArbs ? 'checked' : ''}> arbs</label>
          <label><input type="checkbox" id="watch-mids" ${p.alertMiddles ? 'checked' : ''}> middles</label>
          <label><input type="checkbox" id="watch-key" ${p.keyOnly ? 'checked' : ''}> key-number middles only</label>
        </div>
        <p class="sub" style="margin-top:8px">
          Burn rate: <b>${this.creditsPerHour()} credits/hour</b> at this interval
          (each rescan costs 3). Auto-pauses when credits drop below ${p.minCredits}.
          ${this.lastResult ? '<br>Last check — ' + this.lastResult : ''}
        </p>
      </div>`;
  },

  wire() {
    const p = this.prefs();
    const t = document.getElementById('btn-watch-toggle');
    if (t) t.onclick = () => this.toggle();
    const iv = document.getElementById('watch-interval');
    if (iv) iv.onchange = () => { p.intervalMin = Number(iv.value); Store.save(); Arb.render(); };
    const a = document.getElementById('watch-arbs');
    if (a) a.onchange = () => { p.alertArbs = a.checked; Store.save(); };
    const m = document.getElementById('watch-mids');
    if (m) m.onchange = () => { p.alertMiddles = m.checked; Store.save(); };
    const k = document.getElementById('watch-key');
    if (k) k.onchange = () => { p.keyOnly = k.checked; Store.save(); };
  },
};
