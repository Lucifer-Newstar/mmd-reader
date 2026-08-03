#!/usr/bin/env node
/**
 * mmd-reader offline check suite — no dependencies, runs anywhere Node 18+ runs.
 *
 *   1. Syntax-checks every first-party JS file (node --check)
 *   2. Validates package.json essentials
 *   3. Enforces the OFFLINE RULE: nothing in the renderer's boot path may
 *      reference http(s) resources (scripts, styles, images, fetch, XHR).
 *      Anchors opened via the OS browser and XML namespace identifiers are
 *      exempt by design.
 *   4. Sanity-checks the sample library: keys referenced by the home chips
 *      exist; every sample starts with a recognizable diagram declaration.
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failures = 0;

const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const section = (msg) => console.log(`\n${msg}`);

/* ---------- 1. syntax ---------- */
section('1. JavaScript syntax');
const jsFiles = ['main/main.js', 'main/preload.js', 'renderer/js/app.js',
  'renderer/js/samples.js', 'renderer/js/mermaid-mode.js', 'scripts/check.js',
  'scripts/smoke.js', 'scripts/validate.js'];
for (const rel of jsFiles) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing ${rel}`); continue; }
  try {
    execFileSync(process.execPath, ['--check', abs]);
    ok(rel);
  } catch (e) { fail(`${rel}: ${e.message.split('\n')[0]}`); }
}

/* ---------- 2. package.json ---------- */
section('2. package.json');
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const key of ['name', 'version', 'description', 'license', 'main', 'build']) {
    if (!pkg[key]) fail(`package.json missing "${key}"`); else ok(`"${key}" present`);
  }
  if (pkg.name !== 'mmd-reader') fail(`name should be "mmd-reader", got "${pkg.name}"`);
  const runtimeDeps = Object.keys(pkg.dependencies || {});
  runtimeDeps.length === 0
    ? ok('zero runtime npm dependencies (all rendering code is vendored)')
    : fail(`unexpected runtime dependencies: ${runtimeDeps.join(', ')}`);
} catch (e) { fail(`package.json: ${e.message}`); }

/* ---------- 3. OFFLINE RULE ---------- */
section('3. Offline rule');
const XMLNS = /xmlns(:xlink)?="http:\/\/www\.w3\.org/g;         // identifier, not a fetch
const bootFiles = ['renderer/index.html', 'renderer/css/app.css', 'renderer/css/fonts.css'];
for (const rel of bootFiles) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(XMLNS, '');
  const bad = [];
  // load-bearing remote refs: scripts, stylesheets, images, frames, media, objects.
  // Plain <a href> documentation links are exempt — the shell hands those to the
  // OS default browser and navigations inside the app are denied (main.js).
  for (const m of src.matchAll(/<(script|img|iframe|source|video|audio)\b[^>]*?\bsrc\s*=\s*"(https?:\/\/[^"]+)"|<link\b[^>]*?\bhref\s*=\s*"(https?:\/\/[^"]+)"|<object\b[^>]*?\bdata\s*=\s*"(https?:\/\/[^"]+)"/g)) {
    bad.push(`${rel} loads ${m[2] || m[3] || m[4]}`);
  }
  // stylesheet url(...) or @import
  for (const m of src.matchAll(/@import\s+['"]https?|url\(\s*['"]?https?:\/\//g)) {
    bad.push(`${rel} references remote CSS resource`);
  }
  if (bad.length) bad.forEach(fail); else ok(`${rel} — no remote resources`);
}
// JS: no fetch/XHR/WebSocket to remote hosts
for (const rel of ['renderer/js/app.js']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const patterns = [
    [/fetch\(\s*['"`]https?:\/\//, 'fetch() to remote URL'],
    [/new\s+XMLHttpRequest/, 'XMLHttpRequest'],
    [/new\s+WebSocket\(\s*['"`]wss?:\/\//, 'WebSocket'],
    [/navigator\.sendBeacon/, 'sendBeacon']
  ];
  let clean = true;
  for (const [re, label] of patterns) if (re.test(src)) { fail(`${rel}: ${label}`); clean = false; }
  if (clean) ok(`${rel} — no fetch/XHR/WebSocket/beacon to remote hosts`);
}
{
  const html = fs.readFileSync(path.join(ROOT, 'renderer/index.html'), 'utf8');
  const cspMeta = html.match(/<meta[^>]*Content-Security-Policy[^>]*content\s*=\s*"([\s\S]*?)"\s*\/>/);
  const csp = cspMeta ? cspMeta[1].replace(/\s+/g, ' ') : '';
  const scriptSrc = (csp.match(/script-src ([^;]+)/) || [])[1] || '';
  const jsStrict = scriptSrc.includes("'self'") && !scriptSrc.includes('unsafe-inline') && !scriptSrc.includes('unsafe-eval') && !scriptSrc.includes('*');
  (csp.includes("default-src 'self'") && jsStrict)
    ? ok('CSP present: script-src strictly \'self\' (no inline/eval), everything self-contained')
    : fail(`CSP missing or too permissive: ${csp || '(none)'}`);
}

/* ---------- 4. samples ---------- */
section('4. Sample library');
try {
  const window = {};
  eval(fs.readFileSync(path.join(ROOT, 'renderer/js/samples.js'), 'utf8')); // eslint-disable-line
  const { SAMPLES, PROMPT_CHIPS, TYPE_CHIPS } = window.SAMPLES;
  const DIAGRAM_HEAD = /^(---\n[\s\S]*?\n---\s*\n)?(flowchart|graph|sequenceDiagram|classDiagram(-v2)?|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|xychart-beta|block-beta|architecture-beta|sankey-beta|radar-beta|C4Context|requirementDiagram|kanban|packet-beta|zenuml|info)\b/;
  let bad = 0;
  for (const [key, s] of Object.entries(SAMPLES)) {
    if (!s.label || !s.code) { fail(`sample "${key}" missing label/code`); bad++; continue; }
    if (s.kind === 'markdown') continue;
    const head = s.code.trimStart();
    if (!DIAGRAM_HEAD.test(head)) { fail(`sample "${key}" starts with unknown declaration`); bad++; }
  }
  if (!bad) ok(`all ${Object.keys(SAMPLES).length} samples well-formed`);
  for (const chip of PROMPT_CHIPS) {
    if (!SAMPLES[chip.sample]) fail(`prompt chip "${chip.label}" → missing sample "${chip.sample}"`);
  }
  for (const key of TYPE_CHIPS) {
    if (!SAMPLES[key]) fail(`type chip references missing sample "${key}"`);
  }
  ok('chips resolve against the sample library');
  const fenceCount = (SAMPLES.markdown.code.match(/^```mermaid/gm) || []).length;
  fenceCount >= 1 ? ok(`markdown demo embeds ${fenceCount} mermaid fence(s)`)
                  : fail('markdown demo has no mermaid fences');
} catch (e) { fail(`samples: ${e.message}`); }

/* ---------- summary ---------- */
console.log('');
if (failures) { console.error(`✗ ${failures} check(s) failed`); process.exit(1); }
console.log('✓ all checks passed');
