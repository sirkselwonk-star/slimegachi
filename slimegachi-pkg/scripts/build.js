#!/usr/bin/env node
/**
 * SLIMEgachi build script.
 * - Reads SVG art, encodes as base64 data URIs
 * - Bundles the TypeScript in src/ (entry: src/index.ts) with the art embedded:
 *     dist/slimegachi.js      classic script, exposes the global `SLIMEgachi`
 *     dist/slimegachi.esm.js  ES module (`import { mount } from ...`)
 * - Emits type declarations to dist/types/
 * - Writes dist/slimegachi.css (src/slimegachi.css with the webfonts embedded)
 * - Bundles a single-file dist/slimegachi.standalone.html for demo / sandbox use
 *
 * esbuild only strips types; run `npm run typecheck` (tsc) to check them.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

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

/* 2. Bundle the widget. The art map replaces `__EMBEDDED_PET_ART__` in
      src/pet-art.ts. Output is left unminified so it stays readable. */
const version = require(path.join(ROOT, 'package.json')).version;
const banner = [
  '/**',
  ' * SLIMEgachi widget v' + version + ' — zero runtime dependencies.',
  ' *',
  ' * Usage:',
  ' *   const game = SLIMEgachi.mount(container, options);',
  ' *',
  ' * Generated from src/*.ts by scripts/build.js — do not edit by hand.',
  ' * See README.md for the full options/events contract.',
  ' *',
  ' * Browser support: any browser with ES2019 features (Safari 13+, Chrome 75+, Firefox 70+).',
  ' */'
].join('\n');
const shared = {
  entryPoints: [path.join(SRC, 'index.ts')],
  bundle: true,
  target: 'es2019',
  charset: 'utf8',
  legalComments: 'none',
  define: { __EMBEDDED_PET_ART__: JSON.stringify(artMap) },
  banner: { js: banner },
  logLevel: 'warning'
};
esbuild.buildSync(Object.assign({}, shared, {
  format: 'iife', globalName: 'SLIMEgachi', outfile: path.join(DIST, 'slimegachi.js')
}));
esbuild.buildSync(Object.assign({}, shared, {
  format: 'esm', outfile: path.join(DIST, 'slimegachi.esm.js')
}));
const distJs = fs.readFileSync(path.join(DIST, 'slimegachi.js'), 'utf8');
if (!distJs.includes("version = \"" + version + "\"")) {
  throw new Error('src/index.ts version does not match package.json (' + version + ')');
}
console.log('✓ dist/slimegachi.js (' + distJs.length + ' bytes)');
console.log('✓ dist/slimegachi.esm.js');

/* 2b. Type declarations for consumers */
fs.rmSync(path.join(DIST, 'types'), { recursive: true, force: true });
execFileSync(process.execPath, [
  path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', ROOT,
  '--noEmit', 'false', '--declaration', '--emitDeclarationOnly', '--outDir', path.join(DIST, 'types')
], { stdio: 'inherit' });
console.log('✓ dist/types/');

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
  // Demo reset: load with ?reset=1 to wipe saved progress and start from a
  // clean Level-0 slate on any device; the param is then stripped from the URL.
  var params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    try {
      Object.keys(localStorage)
        .filter(function(k){ return k.indexOf('slimegachi') === 0; })
        .forEach(function(k){ localStorage.removeItem(k); });
    } catch (e) {}
    params.delete('reset');
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }
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
