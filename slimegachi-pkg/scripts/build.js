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

/* 3. Copy CSS */
const srcCss = fs.readFileSync(path.join(SRC, 'slimegachi.css'), 'utf8');
fs.writeFileSync(path.join(DIST, 'slimegachi.css'), srcCss);
console.log('✓ dist/slimegachi.css (' + srcCss.length + ' bytes)');

/* 4. Build standalone HTML demo
   Bundles CSS inline, JS inline, and auto-mounts on DOMContentLoaded.
   This file works in the Claude sandbox (no external requests). */
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
${srcCss}
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
