/* Resize the Provini's Gambling Genie source image into the app icons
   (192/512/180) with headless Chromium — no image lib needed. The source
   (genie-src.png) is an original character illustration. icon-512 doubles
   as the in-app avatar. Run: node scripts/make-icons.js */

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const dataUri = 'data:image/png;base64,' +
  fs.readFileSync(path.join(root, 'genie-src.png')).toString('base64');

const html = (size) => `<!doctype html><meta charset="utf8">
<style>html,body{margin:0}img{width:${size}px;height:${size}px;object-fit:cover;display:block}</style>
<img id="i" src="${dataUri}">`;

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const size of [512, 192, 180]) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(html(size));
    await p.waitForFunction('document.getElementById("i")?.complete === true');
    const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
    await p.screenshot({ path: path.join(root, name), clip: { x: 0, y: 0, width: size, height: size } });
    await p.close();
    console.log('wrote', name);
  }
  await browser.close();
})();
