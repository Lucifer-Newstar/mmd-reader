'use strict';
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'networkidle0' });
  const results = await page.evaluate(async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true });
    const out = {};
    for (const [key, s] of Object.entries(window.SAMPLES.SAMPLES)) {
      if (s.kind === 'markdown') {
        // validate each fence inside the markdown too
        const re = /^[ \t]*```mermaid[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
        let i = 0, ok = true, msg = '';
        for (const m of s.code.matchAll(re)) {
          try { await mermaid.parse(m[1]); } catch (e) { ok = false; msg = String(e.message).slice(0, 160); }
          i++;
        }
        out[key] = { fences: i, ok, msg };
        continue;
      }
      try {
        await mermaid.parse(s.code);
        out[key] = { ok: true };
      } catch (e) {
        out[key] = { ok: false, msg: String(e.message || e).slice(0, 220) };
      }
    }
    return out;
  });
  let fail = 0;
  for (const [k, v] of Object.entries(results)) {
    console.log(v.ok ? `  ok   ${k}` : `  FAIL ${k}: ${v.msg}${v.fences ? ` (fences ${v.fences})` : ''}`);
    if (!v.ok) fail++;
  }
  console.log(fail ? `${fail} SAMPLES FAILED` : 'ALL SAMPLES PARSE ✓');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
