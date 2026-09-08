/* Render the app icon to PNGs (192/512/180) with headless Chromium so we
   don't need an image lib. Navy tile, red "ny" badge, red base stripe —
   matching the masthead. Run: node scripts/make-icons.js */

const { chromium } = require('playwright-core');
const path = require('path');
const root = path.join(__dirname, '..');

const icon = (size) => `<!doctype html><html><head><meta charset="utf8">
<style>
  html,body{margin:0}
  .tile{
    width:${size}px;height:${size}px;
    background:linear-gradient(160deg,#12347f 0%,#0a1c50 60%,#0b2265 100%);
    display:flex;align-items:center;justify-content:center;position:relative;
    font-family:Georgia, 'Times New Roman', serif;
  }
  .badge{
    background:#c8283f;color:#fff;border-radius:${size*0.14}px;
    padding:${size*0.06}px ${size*0.11}px ${size*0.08}px;
    font-weight:700;font-size:${size*0.30}px;letter-spacing:${size*0.01}px;
    box-shadow:0 ${size*0.02}px ${size*0.06}px rgba(0,0,0,0.4);
    line-height:1;
  }
  .stripe{position:absolute;left:0;right:0;bottom:${size*0.12}px;height:${size*0.02}px;background:#c8283f;opacity:.9}
</style></head>
<body><div class="tile"><span class="badge">ny</span><div class="stripe"></div></div></body></html>`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const size of [192, 512, 180]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(icon(size));
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    await page.screenshot({ path: path.join(root, name), clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log('wrote', name);
  }
  await browser.close();
})();
