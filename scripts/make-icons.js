/* Render the Provini's Gambling Genie crest to PNG icons (192/512/180) with
   headless Chromium. Gold crown (it's a Palace) over a football on deep
   Giants navy with a warm glow — original artwork. Run: node scripts/make-icons.js */

const { chromium } = require('playwright-core');
const path = require('path');
const root = path.join(__dirname, '..');

const SVG = `
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bg" cx="50%" cy="36%" r="80%">
      <stop offset="0" stop-color="#1c4197"/>
      <stop offset="55%" stop-color="#0d2360"/>
      <stop offset="100%" stop-color="#060f2c"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="42%">
      <stop offset="0" stop-color="rgba(255,214,120,0.40)"/>
      <stop offset="100%" stop-color="rgba(255,214,120,0)"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff2bf"/>
      <stop offset="34%" stop-color="#f5d35f"/>
      <stop offset="70%" stop-color="#dca413"/>
      <stop offset="100%" stop-color="#a9760a"/>
    </linearGradient>
    <linearGradient id="red" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e63a48"/>
      <stop offset="100%" stop-color="#9c1424"/>
    </linearGradient>
    <linearGradient id="leather" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8a5a2b"/>
      <stop offset="100%" stop-color="#5c3617"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <circle cx="256" cy="212" r="168" fill="url(#glow)"/>
  <rect x="18" y="18" width="476" height="476" rx="96" fill="none" stroke="rgba(245,211,95,0.45)" stroke-width="6"/>

  <!-- crown -->
  <g stroke="#7a5407" stroke-width="4" stroke-linejoin="round">
    <path d="M104,300 L104,202 L180,258 L256,142 L332,258 L408,202 L408,300 Z" fill="url(#gold)"/>
    <rect x="104" y="300" width="304" height="50" rx="12" fill="url(#gold)"/>
  </g>
  <!-- band gems -->
  <circle cx="160" cy="325" r="13" fill="url(#red)"/>
  <circle cx="256" cy="325" r="15" fill="url(#red)"/>
  <circle cx="352" cy="325" r="13" fill="url(#red)"/>
  <!-- tip jewels -->
  <circle cx="104" cy="202" r="17" fill="url(#red)" stroke="#7a5407" stroke-width="3"/>
  <circle cx="256" cy="142" r="19" fill="url(#red)" stroke="#7a5407" stroke-width="3"/>
  <circle cx="408" cy="202" r="17" fill="url(#red)" stroke="#7a5407" stroke-width="3"/>
  <!-- crown sheen -->
  <path d="M118,214 L182,260 L256,160" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="5" stroke-linecap="round"/>

  <!-- football centerpiece, tucked under the crown -->
  <g transform="translate(256,398) rotate(-18)">
    <ellipse rx="78" ry="48" fill="url(#leather)" stroke="#3a1e0d" stroke-width="4"/>
    <ellipse rx="78" ry="48" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" transform="scale(0.84)"/>
    <line x1="-50" y1="0" x2="50" y2="0" stroke="#fdf3e3" stroke-width="8" stroke-linecap="round"/>
    <line x1="-18" y1="-12" x2="-18" y2="12" stroke="#fdf3e3" stroke-width="6" stroke-linecap="round"/>
    <line x1="0" y1="-14" x2="0" y2="14" stroke="#fdf3e3" stroke-width="6" stroke-linecap="round"/>
    <line x1="18" y1="-12" x2="18" y2="12" stroke="#fdf3e3" stroke-width="6" stroke-linecap="round"/>
  </g>
</svg>`;

const page = (size) => `<!doctype html><meta charset="utf8">
<style>html,body{margin:0}div{width:${size}px;height:${size}px}svg{width:100%;height:100%;display:block}</style>
<div>${SVG}</div>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const size of [512, 192, 180]) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(page(size));
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    await p.screenshot({ path: path.join(root, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
    console.log('wrote', name);
  }
  await browser.close();
})();
