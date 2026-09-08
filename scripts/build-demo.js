/* Bundle the multi-file app into one self-contained HTML for a shareable
   demo (Artifact / any static host). Inlines CSS + JS and flips on demo
   mode. Run: node scripts/build-demo.js */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "Provini’s Gambling Genie";

const bodyStart = html.indexOf('>', html.indexOf('<body')) + 1;
const firstScript = html.indexOf('<script');
const body = html.slice(bodyStart, firstScript).trim();

const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const js = srcs.map(s => `/* ==== ${s} ==== */\n` + fs.readFileSync(path.join(root, s), 'utf8')).join('\n;\n');
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

const out = `<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
${body}
<script>window.PFP_DEMO = true;</script>
<script>
${js}
</script>`;

// Inline local PNG images as data URIs — the artifact sandbox blocks
// external image files but allows data: URIs.
const inlined = out.replace(/src="(icon-\d+\.png|apple-touch-icon\.png|genie-src\.png)"/g, (m, file) => {
  try {
    const b64 = fs.readFileSync(path.join(root, file)).toString('base64');
    return `src="data:image/png;base64,${b64}"`;
  } catch (e) { return m; }
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const outPath = path.join(root, 'dist/pros-fantasy-palace-demo.html');
fs.writeFileSync(outPath, inlined);
console.log('wrote', outPath, '(' + Math.round(inlined.length / 1024) + ' KB), inlined', srcs.length, 'scripts + images');
