/* Headless UI verification for the renderer (runs in Chromium via puppeteer). */
'use strict';
const puppeteer = require('puppeteer');

const BASE = 'http://127.0.0.1:8099/index.html';
const SHOT = (n) => `__dirname + '/../shots/'${n}.png`;

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1512, height: 960, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  // 1) HOME
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: SHOT('01-home') });

  // 2) STUDIO with default sample
  await page.click('#nav-start');
  await page.waitForSelector('#stage-content svg', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: SHOT('02-studio-flowchart') });

  // 3) sequence sample via Samples menu
  await page.click('#btn-samples');
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu-item')];
    const it = items.find((i) => i.textContent.includes('Sequence diagram'));
    it && it.click();
  });
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: SHOT('03-studio-sequence') });

  // 4) markdown demo
  await page.click('#btn-samples');
  await new Promise((r) => setTimeout(r, 250));
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu-item')];
    const it = items.find((i) => i.textContent.includes('Markdown field guide'));
    it && it.click();
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() => { document.querySelector('#doc-view').scrollTop = 120; });
  await page.screenshot({ path: SHOT('04-studio-markdown') });

  // 5) error state — back to diagram, break syntax
  await page.evaluate(() => {
    document.querySelector('.kind-toggle [data-kind="mermaid"]').click();
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => {
    const cmEl = document.querySelector('#cm-host .CodeMirror');
    const ed = cmEl.CodeMirror;
    ed.setValue('flowchart TD\n  A[broken --> B\n  B --> C');
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: SHOT('05-error-state') });

  // 6) dark theme
  await page.evaluate(() => {
    const cmEl = document.querySelector('#cm-host .CodeMirror');
    cmEl.CodeMirror.setValue(window.SAMPLES.SAMPLES.sequence.code);
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.select('#sel-theme', 'dark');
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: SHOT('06-dark-theme') });

  // 7) code-only view + recent drawer
  await page.evaluate(() => { document.querySelector('.segmented [data-vp="code"]').click(); });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('#rail-recent');
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: SHOT('07-code-recent') });

  const stats = await page.evaluate(() => ({
    svgs: document.querySelectorAll('#stage-content svg, #doc-view svg').length,
    statusRender: document.querySelector('#status-render').textContent,
    fileName: document.querySelector('#file-name').textContent
  }));
  console.log('STATS', JSON.stringify(stats));
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'NO PAGE ERRORS');
  await browser.close();
})().catch((e) => { console.error('SMOKE FAILED', e); process.exit(1); });
