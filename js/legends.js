/* Giants Ring of Honor — original stylized jersey graphics (inline SVG,
   no photos, no external assets). Navy/red jerseys with the legends'
   numbers and names. A "legend of the day" rotates into the Big Blue
   Watch hero and a strip shows the whole ring. */

const Legends = {
  ROSTER: [
    { name: 'Eli Manning',      num: 10, note: '2× Super Bowl MVP' },
    { name: 'Lawrence Taylor',  num: 56, note: 'Greatest defender ever' },
    { name: 'Michael Strahan',  num: 92, note: 'Single-season sack king' },
    { name: 'Phil Simms',       num: 11, note: 'Super Bowl XXI MVP' },
    { name: 'Harry Carson',     num: 53, note: 'Hall of Fame captain' },
    { name: 'Tiki Barber',      num: 21, note: 'Franchise rushing leader' },
  ],

  ofTheDay() {
    const dayIndex = Math.floor(Date.now() / 864e5);
    return this.ROSTER[dayIndex % this.ROSTER.length];
  },

  /* Original jersey mark — navy body, red trim, white number. */
  jerseySVG(num, size) {
    const s = size || 96;
    return `<svg viewBox="0 0 120 132" width="${s}" height="${s * 1.1}" role="img" aria-label="Giants jersey number ${num}" style="overflow:visible">
      <defs>
        <linearGradient id="jsy${num}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#12347f"/><stop offset="1" stop-color="#0a1c50"/>
        </linearGradient>
      </defs>
      <path d="M22,30 L42,14 Q60,3 78,14 L98,30 L114,48 L98,64 L90,54 L90,122 Q60,132 30,122 L30,54 L22,64 L6,48 Z"
        fill="url(#jsy${num})" stroke="#c8283f" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M49,11 Q60,25 71,11 L64,7 Q60,13 56,7 Z" fill="#c8283f"/>
      <path d="M98,64 L90,54 M22,64 L30,54" stroke="#ffffff" stroke-width="3" fill="none"/>
      <text x="60" y="94" text-anchor="middle" font-family="Oswald, system-ui, sans-serif"
        font-weight="700" font-size="46" fill="#ffffff" style="letter-spacing:1px">${num}</text>
    </svg>`;
  },

  heroBadge() {
    const l = this.ofTheDay();
    return `<div style="position:absolute; right:16px; top:50%; transform:translateY(-50%); text-align:center; pointer-events:none;">
      ${this.jerseySVG(l.num, 78)}
      <div style="color:var(--giants-silver); font-size:10px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; margin-top:2px;">Legend of the day</div>
      <div style="color:#fff; font-family:var(--display); font-size:14px; font-weight:600;">${l.name}</div>
    </div>`;
  },

  strip() {
    const cards = this.ROSTER.map(l => `
      <div class="legend-card" title="${l.name} — #${l.num}">
        ${this.jerseySVG(l.num, 64)}
        <div class="legend-name">${l.name}</div>
        <div class="legend-note">#${l.num} · ${l.note}</div>
      </div>`).join('');
    return `
      <div class="card">
        <h2>Ring of Honor</h2>
        <p class="sub">Big Blue immortals. Original artwork — for the vibes, not affiliated with or endorsed by the players or the club.</p>
        <div class="legends-strip">${cards}</div>
      </div>`;
  },
};
