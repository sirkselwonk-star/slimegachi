#!/usr/bin/env node
/**
 * Copy the built widget into the deployed folder and bump cache busters.
 *
 *   dist/slimegachi.js   →  ../slimegachi/slimegachi.js
 *   dist/slimegachi.css  →  ../slimegachi/slimegachi.css
 *
 * For each file whose contents changed, the matching `?v=N` in ../index.html
 * is incremented, because GitHub Pages otherwise serves the stale copy.
 * Files that did not change are left alone, so running this twice is a no-op.
 *
 * Usage:  npm run release   (typecheck + build + smoke test + this)
 */
const fs = require('fs');
const path = require('path');

const PKG = path.resolve(__dirname, '..');
const SITE = path.resolve(PKG, '..');
const INDEX = path.join(SITE, 'index.html');
const FILES = ['slimegachi.js', 'slimegachi.css'];

let html = fs.readFileSync(INDEX, 'utf8');
let changed = 0;

for (const name of FILES) {
  const from = path.join(PKG, 'dist', name);
  const to = path.join(SITE, 'slimegachi', name);
  const next = fs.readFileSync(from);
  if (fs.existsSync(to) && fs.readFileSync(to).equals(next)) {
    console.log('= ' + name + ' unchanged');
    continue;
  }
  fs.writeFileSync(to, next);
  const re = new RegExp('(slimegachi/' + name.replace('.', '\\.') + '\\?v=)(\\d+)');
  const m = html.match(re);
  if (!m) throw new Error('No ?v=N cache buster for ' + name + ' in index.html');
  const v = Number(m[2]) + 1;
  html = html.replace(re, '$1' + v);
  console.log('✓ ' + name + ' copied, cache buster v' + m[2] + ' → v' + v);
  changed++;
}

if (changed) fs.writeFileSync(INDEX, html);
console.log(changed ? 'Deployed copy updated.' : 'Deployed copy already up to date.');
