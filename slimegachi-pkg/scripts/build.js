#!/usr/bin/env node
/**
 * SLIMEgachi build script.
 * - Reads SVG art, encodes as base64 data URIs
 * - Embeds art into src/slimegachi.js, writes dist/slimegachi.js
 * - Copies src/slimegachi.css to dist/slimegachi.css
 * - Bundles a single-file dist/slimegachi.standalone.html for demo / sandbox use
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(ROOT, 'assets', 'pet-art');

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

/* 1. Encode SVG art as base64 data URIs */
const PETS = ['Kitten', 'Monkey', 'Owl', 'Dragon'];
const artMap = {};
for (const pet of PETS) {
  const filename = pet.toLowerCase() + '.svg';
  const svg = fs.readFileSync(path.join(ASSETS, filename));
  const b64 = svg.toString('base64');
  artMap[pet] = 'data:image/svg+xml;base64,' + b64;
}
const artJson = JSON.stringify(artMap, null, 2);

/* 2. Inject art into widget JS */
const srcJs = fs.readFileSync(path.join(SRC, 'slimegachi.js'), 'utf8');
const distJs = srcJs.replace('/*__EMBEDDED_PET_ART__*/ {}', artJson);
fs.writeFileSync(path.join(DIST, 'slimegachi.js'), distJs);
console.log('✓ dist/slimegachi.js (' + distJs.length + ' bytes)');

/* 3. Embed webfonts as base64 @font-face so dist + standalone are fully
   self-contained (no external font requests). The faces match the family names
   referenced by the --slimegachi-font-* tokens in the CSS. JetBrains Mono is a
   variable font, so one woff2 covers the 400–700 weight range. */
const FONTS = path.join(ROOT, 'assets', 'fonts');
const jbmB64 = fs.readFileSync(path.join(FONTS, 'jetbrainsmono-latin.woff2')).toString('base64');
const wrB64 = fs.readFileSync(path.join(FONTS, 'whiterabbit.woff')).toString('base64');
const fontFaceCss = [
  '/* Embedded webfonts — self-contained, no external requests.',
  '   JetBrains Mono: SIL Open Font License 1.1 (variable, weights 400–700).',
  '   White Rabbit: © Matthew Welch, free for personal & commercial use. */',
  "@font-face {",
  "  font-family: 'JetBrains Mono';",
  "  font-style: normal;",
  "  font-weight: 400 700;",
  "  font-display: swap;",
  '  src: url(data:font/woff2;base64,' + jbmB64 + ") format('woff2');",
  "}",
  "@font-face {",
  "  font-family: 'White Rabbit';",
  "  font-style: normal;",
  "  font-weight: 400;",
  "  font-display: swap;",
  '  src: url(data:font/woff;base64,' + wrB64 + ") format('woff');",
  "}",
  ""
].join('\n');

/* 4. Copy CSS (with the embedded faces prepended) */
const srcCss = fs.readFileSync(path.join(SRC, 'slimegachi.css'), 'utf8');
const distCss = fontFaceCss + srcCss;
fs.writeFileSync(path.join(DIST, 'slimegachi.css'), distCss);
console.log('✓ dist/slimegachi.css (' + distCss.length + ' bytes, fonts embedded)');

/* 5. Build standalone HTML demo
   Bundles CSS inline (with embedded fonts), JS inline, and auto-mounts on
   DOMContentLoaded. Fully self-contained — works offline, no external requests. */
const standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>SLIMEgachi — Standalone Demo</title>
<style>
html,body{height:100%;margin:0;background:#0a0612;color:#e8e0f4;font-family:system-ui,sans-serif;overflow:hidden;}
body{display:flex;align-items:center;justify-content:center;}
#slimegachi-mount{width:100%;height:100%;max-width:540px;max-height:960px;}
${distCss}
</style>
</head>
<body>
<div id="slimegachi-mount"></div>
<script>
${distJs}
</script>
<script>
window.addEventListener('DOMContentLoaded', function(){
  window.__game = SLIMEgachi.mount(document.getElementById('slimegachi-mount'), {
    showDevPanel: true,
    events: {
      onAchievement: function(e){ console.log('[achievement]', e); },
      onCoinsChanged: function(e){ console.log('[coins]', e); },
      onCareAction: function(e){ console.log('[care]', e); },
      onMiniGameComplete: function(e){ console.log('[minigame]', e); },
      onError: function(e){ console.warn('[error]', e); }
    }
  });
});
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, 'slimegachi.standalone.html'), standaloneHtml);
console.log('✓ dist/slimegachi.standalone.html (' + standaloneHtml.length + ' bytes)');

console.log('Build complete.');
