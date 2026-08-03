/* Security & behavior smoke: offline assertion + XSS injection resistance.
 * Tracks every network request the page makes and asserts all are same-origin local.
 * Then opens a hostile .md and asserts no attacker script ran. */
'use strict';
const puppeteer = require('puppeteer');

const BASE = 'http://127.0.0.1:8099/index.html';
const HOSTILE_MD = [
  '# Hostile doc',
  '',
  '<script>window.__pwned = 1; document.title = "PWNED";</scr' + 'ipt>',
  '',
  '<img src="x" onerror="window.__pwnedImg = 1">',
  '',
  '<a href="javascript:window.__pwnedLink=1">click me maybe</a>',
  '',
  '```mermaid',
  'flowchart TB',
  '  A["<img src=x onerror=window.__mmdPwned=1>"] --> B',
  '```',
  ''
].join('\n');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1512, height: 960 });
  await page.setCacheEnabled(false);

  const seen = [];
  page.on('request', (req) => seen.push(req.url()));
  const failures = [];

  // ---------- pass 1: full normal session stays local ----------
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.click('#nav-start');
  await page.waitForSelector('#stage-content svg', { timeout: 25000 });
  await page.evaluate(async () => {
    // exercise markdown render + export machinery (this fires local font fetches for export)
    document.querySelector('#btn-samples').click();
    await new Promise((r) => setTimeout(r, 150));
    [...document.querySelectorAll('.menu-item')].find(i => i.textContent.includes('Markdown field guide')).click();
  });
  await new Promise((r) => setTimeout(r, 2500));

  for (const url of seen) {
    if (!url.startsWith('http://127.0.0.1:8099/') && !url.startsWith('data:') && !url.startsWith('blob:'))
      failures.push(`NON-LOCAL REQUEST: ${url}`);
  }
  console.log(`requests observed: ${seen.length} (all must be local)`);

  // ---------- pass 2: hostile markdown ----------
  await page.evaluate((md) => {
    const dt = new DataTransfer();
    const f = new File([md], 'evil.md', { type: 'text/markdown' });
    dt.items.add(f);
    const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
  }, HOSTILE_MD);
  await new Promise((r) => setTimeout(r, 2500));
  const hostile = await page.evaluate(() => ({
    pwned: !!window.__pwned,
    pwnedImg: !!window.__pwnedImg,
    mmdPwned: !!window.__mmdPwned,
    title: document.title,
    scriptsInDoc: document.querySelectorAll('#doc-view script').length,
    handlersInDoc: [...document.querySelectorAll('#doc-view *')].filter(el =>
      [...el.attributes].some(a => /^on/i.test(a.name))).length,
    currentFile: document.querySelector('#file-name').textContent,
    docHasList: !!document.querySelector('#doc-view h1')
  }));
  console.log('hostile doc result:', JSON.stringify(hostile));
  if (hostile.pwned || hostile.pwnedImg || hostile.mmdPwned) failures.push('XSS executed!');
  if (hostile.scriptsInDoc > 0) failures.push('script tag survived sanitization');
  if (hostile.handlersInDoc > 0) failures.push('inline event handlers survived sanitization');
  if (hostile.currentFile !== 'evil.md') failures.push('dropped file not opened');
  if (!hostile.docHasList) failures.push('hostile markdown did not render at all');

  // ---------- pass 3: new features (outline, session restore, word count) ----------
  await page.evaluate(() => document.querySelector('#btn-outline').click());
  await new Promise((r) => setTimeout(r, 400));
  const outline = await page.evaluate(() => ({
    drawerOpen: !document.querySelector('#drawer').hidden,
    items: document.querySelectorAll('.outline-item').length
  }));
  if (!outline.drawerOpen || outline.items < 1) failures.push(`outline broken: ${JSON.stringify(outline)}`);
  await page.evaluate(() => document.querySelector('#drawer-close').click());

  const wordStat = await page.evaluate(() => document.querySelector('#status-chars').textContent);
  if (!/words/.test(wordStat)) failures.push(`word count missing: "${wordStat}"`);

  // session restore: reload and expect the hostile buffer back
  await page.evaluate(() => { const cm = document.querySelector('#cm-host .CodeMirror'); cm.CodeMirror.setValue('flowchart LR\n  X-->Y'); });
  await new Promise((r) => setTimeout(r, 1600)); // session save is debounced 900ms
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));
  const restored = await page.evaluate(() => ({
    view: document.body.dataset.view,
    text: document.querySelector('#cm-host .CodeMirror').CodeMirror.getValue()
  }));
  if (restored.view !== 'studio' || !restored.text.includes('X-->Y')) failures.push(`session restore failed: ${JSON.stringify(restored).slice(0, 120)}`);

  console.log(failures.length ? `\n⚠ FAILURES:\n${failures.join('\n')}` : '\n✓ offline + XSS-safe + new features OK');
  await browser.close();
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('SMOKE ERROR', e.message); process.exit(1); });
