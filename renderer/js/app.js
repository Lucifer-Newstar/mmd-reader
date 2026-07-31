/* ==========================================================================
   Mermaid Reader — renderer application
   Desktop: talks to Electron via window.desktop (main/preload.js)
   Browser: degrades gracefully to FileReader / downloads / localStorage
   ========================================================================== */
(function () {
  'use strict';

  const { SAMPLES, PROMPT_CHIPS, TYPE_CHIPS, MARQUEE, DEFAULT } = window.SAMPLES;

  /* ---------------------------------------------------------------- */
  /* helpers                                                           */
  /* ---------------------------------------------------------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const desktop = window.desktop || null;
  const IS_DESKTOP = !!(desktop && desktop.isDesktop);
  const IS_MAC = IS_DESKTOP ? desktop.platform === 'darwin'
                            : /Mac|iPhone|iPad/.test(navigator.platform || '');
  const MOD = IS_MAC ? '⌘' : 'Ctrl';
  const MERMAID_VERSION = '11.16.1';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  document.body.classList.toggle('is-desktop', IS_DESKTOP);
  if (IS_DESKTOP) document.body.classList.add(`platform-${desktop.platform}`);

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove(); return ok;
    }
  }

  /* ---------------------------------------------------------------- */
  /* toasts                                                            */
  /* ---------------------------------------------------------------- */
  function toast(msg, kind = 'ok') {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = `toast${kind === 'err' ? ' err' : ''}`;
    el.innerHTML = `<svg class="ic"><use href="#${kind === 'err' ? 'i-alert' : 'i-check'}"/></svg><span>${esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); }, 2400);
  }

  /* ---------------------------------------------------------------- */
  /* dropdown menus                                                    */
  /* ---------------------------------------------------------------- */
  let activeMenu = null;
  function closeMenu() {
    if (activeMenu) { activeMenu.remove(); activeMenu = null; }
  }
  function openMenu(anchor, items) {
    closeMenu();
    const menu = document.createElement('div');
    menu.className = 'menu';
    for (const item of items) {
      if (item.sep) {
        const s = document.createElement('div'); s.className = 'menu-sep'; menu.appendChild(s); continue;
      }
      if (item.header) {
        const h = document.createElement('div'); h.className = 'menu-label'; h.textContent = item.header; menu.appendChild(h); continue;
      }
      const b = document.createElement('button');
      b.className = 'menu-item';
      b.disabled = !!item.disabled;
      b.innerHTML = `${item.icon ? `<svg class="ic"><use href="#${item.icon}"/></svg>` : '<span style="width:16px"></span>'}<span>${esc(item.label)}</span>${item.kbd ? `<kbd>${esc(item.kbd)}</kbd>` : ''}`;
      b.addEventListener('click', () => { closeMenu(); item.action && item.action(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = clamp(r.left, 8, window.innerWidth - mw - 8);
    if (r.left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    activeMenu = menu;
  }
  document.addEventListener('mousedown', (e) => {
    if (activeMenu && !activeMenu.contains(e.target) && !e.target.closest('#btn-samples,#btn-actions')) closeMenu();
  });
  window.addEventListener('resize', closeMenu);

  /* ---------------------------------------------------------------- */
  /* state                                                             */
  /* ---------------------------------------------------------------- */
  const state = {
    code: DEFAULT,
    kind: 'mermaid',            // 'mermaid' | 'markdown'
    view: 'split',              // 'code' | 'split' | 'preview'
    theme: 'default',
    fileName: 'untitled.mmd',
    filePath: null,
    dirty: false,
    zoom: 1, panX: 0, panY: 0,
    fitPending: true,
    rendering: false
  };
  window.__isDirty = () => state.dirty;

  /* ---------------------------------------------------------------- */
  /* mermaid                                                           */
  /* ---------------------------------------------------------------- */
  function applyMermaidConfig() {
    const base = {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: state.theme,
      fontFamily: 'Inter, sans-serif',
      suppressErrorRendering: true,
      flowchart: { htmlLabels: true, curve: 'basis' },
      themeCSS: '',
    };
    if (state.theme === 'base') {
      base.themeVariables = {
        primaryColor: '#dcecef', primaryBorderColor: '#96c9d6',
        primaryTextColor: '#111111', lineColor: '#5d55d4',
        secondaryColor: '#fde7f0', tertiaryColor: '#f9f7f5',
        fontFamily: 'Inter, sans-serif'
      };
    }
    mermaid.initialize(base);
  }
  applyMermaidConfig();

  /* ---------------------------------------------------------------- */
  /* CodeMirror editor                                                 */
  /* ---------------------------------------------------------------- */
  const cm = CodeMirror($('#cm-host'), {
    value: state.code,
    mode: 'mermaid',
    lineNumbers: true,
    styleActiveLine: true,
    matchBrackets: true,
    tabSize: 2,
    indentUnit: 2,
    lineWrapping: false,
    extraKeys: {
      Tab: (editor) => editor.replaceSelection('  ', 'end'),
      'Ctrl-S': () => saveFile(false),
      'Cmd-S': () => saveFile(false)
    }
  });

  cm.on('change', () => {
    state.code = cm.getValue();
    markDirty(true);
    scheduleRender();
    saveSession();
  });

  /* session persistence — remember the working buffer locally between launches */
  let sessionTimer = null;
  function saveSession() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
      try {
        if (state.code.length < 400000) {
          localStorage.setItem('mr.session', JSON.stringify({
            name: state.fileName, code: state.code, kind: state.kind,
            theme: state.theme, savedAt: Date.now()
          }));
        }
      } catch { /* quota — skip */ }
    }, 900);
  }
  function readSession() {
    try { return JSON.parse(localStorage.getItem('mr.session') || 'null'); } catch { return null; }
  }
  cm.on('cursorActivity', () => {
    const c = cm.getCursor();
    $('#status-cursor').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
  });

  function markDirty(d) {
    if (state.dirty === d) return;
    state.dirty = d;
    $('#dirty-dot').hidden = !d;
    updateMeta();
  }
  function updateMeta() {
    $('#file-name').textContent = state.fileName;
    document.title = `${state.fileName}${state.dirty ? ' •' : ''} — Mermaid Reader`;
    if (IS_DESKTOP) desktop.setMeta({ name: state.fileName, dirty: state.dirty });
  }

  /* ---------------------------------------------------------------- */
  /* rendering                                                         */
  /* ---------------------------------------------------------------- */
  let renderTimer = null;
  let renderSeq = 0;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 260);
  }

  async function render() {
    if (document.body.dataset.view !== 'studio') return;
    if (state.rendering) { scheduleRender(); return; }
    state.rendering = true;
    const seq = ++renderSeq;
    const t0 = performance.now();
    try {
      if (state.kind === 'mermaid') await renderDiagram(state.code, seq);
      else await renderMarkdown(state.code, seq);
      const ms = Math.max(1, Math.round(performance.now() - t0));
      $('#status-render').textContent = `rendered in ${ms} ms`;
    } finally {
      state.rendering = false;
      updateCharStats();
    }
  }

  function updateCharStats() {
    const el = $('#status-chars');
    if (state.kind === 'markdown') {
      const words = state.code.trim().split(/\s+/).filter(Boolean).length;
      const mins = Math.max(1, Math.round(words / 220));
      el.textContent = `${words.toLocaleString()} words · ~${mins} min read · ${state.code.length.toLocaleString()} chars`;
    } else {
      el.textContent = `${state.code.length.toLocaleString()} characters`;
    }
  }

  function setError(msg) {
    const card = $('#error-card');
    if (!msg) {
      card.hidden = true;
      $('#status-errors').hidden = true;
      return;
    }
    card.hidden = false;
    $('#status-errors').hidden = false;
    $('#err-msg').textContent = msg;
    $('#err-ver').textContent = `mermaid@${MERMAID_VERSION}`;
  }
  $('#err-close').addEventListener('click', () => { $('#error-card').hidden = true; });

  /* --- single diagram --- */
  let renderId = 0;
  async function renderDiagram(code, seq) {
    const stageContent = $('#stage-content');
    $('#doc-view').hidden = true;
    stageContent.style.display = '';
    if (!code.trim()) {
      stageContent.innerHTML = '';
      $('#stage-empty').hidden = false;
      setError(null);
      return;
    }
    $('#stage-empty').hidden = true;

    // parse first so we never paint errors onto the canvas
    try {
      await mermaid.parse(code);
    } catch (err) {
      setError(cleanError(err));
      return;
    }

    try {
      const id = `dmr-${++renderId}`;
      const { svg } = await mermaid.render(id, code);
      if (seq !== renderSeq) return;               // a newer render won
      stageContent.innerHTML = svg;
      $$('#stage-content > div[id^="dmr-"]').forEach((n) => n.remove()); // strays
      setError(null);
      if (state.fitPending) { fitToStage(); state.fitPending = false; }
      else applyTransform();
      updateStageChrome();
    } catch (err) {
      setError(cleanError(err));
    }
  }

  function cleanError(err) {
    let msg = (err && (err.message || err.str)) || String(err);
    return msg.replace(/\u001b\[\d+m/g, '').replace(/^Error:\s*/i, '').trim();
  }

  /* --- markdown document --- */
  async function renderMarkdown(code, seq) {
    const doc = $('#doc-view');
    $('#stage-content').style.display = 'none';
    $('#stage-empty').hidden = true;
    doc.hidden = false;

    const snippets = [];
    const buffered = code.replace(
      /^[ \t]*```mermaid[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm,
      (m, body) => { snippets.push(body); return `\n<div class="mm-slot" data-i="${snippets.length - 1}"></div>\n`; }
    );

    const html = DOMPurify.sanitize(marked.parse(buffered), { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] });
    if (seq !== renderSeq) return;
    doc.innerHTML = html;

    let failed = 0;
    for (const slot of $$('.mm-slot', doc)) {
      const i = Number(slot.dataset.i);
      const block = document.createElement('div');
      block.className = 'mermaid-block';
      try {
        const id = `dmd-${++renderId}`;
        const { svg } = await mermaid.render(id, snippets[i].trim());
        block.innerHTML = svg;
        slot.replaceWith(block);
      } catch (err) {
        failed++;
        block.classList.add('mermaid-error');
        block.innerHTML = `<svg class="ic"><use href="#i-alert"/></svg><pre>${esc(cleanError(err))}</pre>`;
        slot.replaceWith(block);
      }
      if (seq !== renderSeq) return;
    }
    setError(null);
    const errFlag = $('#status-errors');
    errFlag.hidden = failed === 0;
    $('#status-err-count').textContent = failed;
    updateStageChrome();
  }

  function currentSvg() {
    if (state.kind === 'mermaid') return $('#stage-content svg');
    return $('#doc-view .mermaid-block svg') || $('#doc-view svg');
  }

  function updateStageChrome() {
    const isDoc = state.kind === 'markdown';
    $('#preview-title').textContent = isDoc ? 'Document' : 'Diagram';
    $('#preview-pane').classList.toggle('doc-mode', isDoc);
    $('#zoom-pill').style.visibility = isDoc ? 'hidden' : 'visible';
    $('#theme-wrap').style.visibility = isDoc ? 'hidden' : 'visible';
    const outlineBtn = $('#btn-outline');
    outlineBtn.style.display = isDoc ? '' : 'none';
    outlineBtn.onclick = showOutline;
  }

  /* ---------------------------------------------------------------- */
  /* pan & zoom canvas                                                 */
  /* ---------------------------------------------------------------- */
  const stage = $('#stage');
  const stageContent = $('#stage-content');

  function applyTransform() {
    stageContent.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    $('#zoom-val').textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function diagramBounds() {
    const svg = $('#stage-content svg');
    if (!svg) return null;
    try {
      const bb = svg.getBBox();
      return { w: bb.width, h: bb.height };
    } catch {
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      if (vb.length === 4) return { w: vb[2], h: vb[3] };
      return { w: svg.clientWidth || 400, h: svg.clientHeight || 300 };
    }
  }

  function fitToStage() {
    const b = diagramBounds();
    if (!b) return;
    const pad = 56;
    const sw = stage.clientWidth - pad * 2;
    const sh = stage.clientHeight - pad * 2;
    const z = clamp(Math.min(sw / b.w, sh / b.h), 0.04, 3);
    state.zoom = z;
    state.panX = pad + (sw - b.w * z) / 2;
    state.panY = pad + (sh - b.h * z) / 2;
    applyTransform();
  }

  function setZoom(next, cx, cy) {
    const rect = stage.getBoundingClientRect();
    const px = (cx == null ? rect.width / 2 : cx - rect.left);
    const py = (cy == null ? rect.height / 2 : cy - rect.top);
    const z = clamp(next, 0.04, 8);
    const k = z / state.zoom;
    state.panX = px - (px - state.panX) * k;
    state.panY = py - (py - state.panY) * k;
    state.zoom = z;
    applyTransform();
  }

  stage.addEventListener('wheel', (e) => {
    if (state.kind !== 'mermaid') return;
    e.preventDefault();
    const factor = Math.pow(1.0015, -e.deltaY);
    setZoom(state.zoom * factor, e.clientX, e.clientY);
  }, { passive: false });

  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (state.kind !== 'mermaid') return;
    if (e.button !== 0 && e.button !== 1) return;
    drag = { x: e.clientX, y: e.clientY };
    stage.classList.add('panning');
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    state.panX += e.clientX - drag.x;
    state.panY += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    applyTransform();
  });
  const endDrag = () => { drag = null; stage.classList.remove('panning'); };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', () => { if (state.kind === 'mermaid') fitToStage(); });

  $('#zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.25));
  $('#zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.25));
  $('#zoom-val').addEventListener('click', () => { state.zoom = 1; centerDiagram(); });
  $('#zoom-fit').addEventListener('click', fitToStage);
  function centerDiagram() {
    const b = diagramBounds();
    if (!b) return;
    state.panX = (stage.clientWidth - b.w * state.zoom) / 2;
    state.panY = (stage.clientHeight - b.h * state.zoom) / 2;
    applyTransform();
  }

  /* ---------------------------------------------------------------- */
  /* export / share                                                    */
  /* ---------------------------------------------------------------- */
  let embeddedFontCss = null;
  async function getFontCss() {
    if (embeddedFontCss !== null) return embeddedFontCss;
    try {
      const families = [
        'Inter-400-normal.woff2', 'Inter-500-normal.woff2', 'Inter-700-normal.woff2',
        'JetBrainsMono-400-normal.woff2'
      ];
      const b64 = await Promise.all(families.map(async (f) => {
        const res = await fetch(`fonts/${f}`);
        const buf = await res.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        return btoa(bin);
      }));
      embeddedFontCss = [
        `@font-face{font-family:'Inter';font-weight:400;src:url(data:font/woff2;base64,${b64[0]}) format('woff2')}`,
        `@font-face{font-family:'Inter';font-weight:500;src:url(data:font/woff2;base64,${b64[1]}) format('woff2')}`,
        `@font-face{font-family:'Inter';font-weight:700;src:url(data:font/woff2;base64,${b64[2]}) format('woff2')}`,
        `@font-face{font-family:'JetBrains Mono';font-weight:400;src:url(data:font/woff2;base64,${b64[3]}) format('woff2')}`
      ].join('');
    } catch {
      embeddedFontCss = '';
    }
    return embeddedFontCss;
  }

  async function buildSvgMarkup() {
    const svg = currentSvg();
    if (!svg) return null;
    const clone = svg.cloneNode(true);
    const b = diagramBoundsOf(svg);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', b.w);
    clone.setAttribute('height', b.h);
    clone.removeAttribute('style');
    clone.style.maxWidth = 'none';
    const fontCss = await getFontCss();
    if (fontCss) {
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = fontCss;
      clone.insertBefore(style, clone.firstChild);
    }
    return { markup: new XMLSerializer().serializeToString(clone), w: b.w, h: b.h };
  }
  function diagramBoundsOf(svg) {
    try {
      const bb = svg.getBBox();
      if (bb.width > 0) return { w: Math.ceil(bb.width) + 8, h: Math.ceil(bb.height) + 8 };
    } catch { /* ignore */ }
    const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (vb.length === 4 && vb[2] > 0) return { w: Math.ceil(vb[2]) + 8, h: Math.ceil(vb[3]) + 8 };
    return { w: svg.clientWidth || 800, h: svg.clientHeight || 600 };
  }

  function exportBaseName() {
    return state.fileName.replace(/\.(mmd|mermaid|md|markdown|txt)$/i, '') || 'diagram';
  }

  /* PDF via Electron's printToPDF over the print stylesheet.
     Diagrams: we size the PDF page to the diagram itself (microns).
     Documents: A4 portrait with paged CSS. */
  async function exportPdf() {
    if (!IS_DESKTOP) { window.print(); return; }
    const base = `${exportBaseName()}.pdf`;
    if (state.kind === 'markdown') {
      document.body.classList.add('printing-doc');
      try {
        const res = await desktop.exportPdf({ defaultName: base, landscape: false });
        if (res && !res.canceled) toast('PDF exported');
      } finally { document.body.classList.remove('printing-doc'); }
      return;
    }
    const b = diagramBounds();
    if (!b || !currentSvg()) { toast('Nothing to export — render a diagram first', 'err'); return; }
    const pad = 96;                                  // breathing room, in css px
    const w = Math.ceil(b.w + pad), h = Math.ceil(b.h + pad);
    document.body.classList.add('printing-diagram');
    try {
      const res = await desktop.exportPdf({
        defaultName: base,
        landscape: w > h,
        pageSizeMicrons: {
          width: Math.round(w * 264.5833),           // css px → microns at 96dpi
          height: Math.round(h * 264.5833)
        }
      });
      if (res && !res.canceled) toast('PDF exported');
    } finally { document.body.classList.remove('printing-diagram'); }
  }

  async function exportSvg() {
    const built = await buildSvgMarkup();
    if (!built) { toast('Nothing to export — render a diagram first', 'err'); return; }
    const markup = `<?xml version="1.0" encoding="UTF-8"?>\n${built.markup}`;
    const name = `${exportBaseName()}.svg`;
    if (IS_DESKTOP) {
      const res = await desktop.exportDialog({ kind: 'svg', defaultName: name, payload: markup });
      if (res && !res.canceled) toast(`Exported ${res.path ? name : ''} — done`);
    } else {
      downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), name);
      toast('SVG downloaded');
    }
  }

  async function exportPng(scale = 2.5) {
    const built = await buildSvgMarkup();
    if (!built) { toast('Nothing to export — render a diagram first', 'err'); return; }
    const url = URL.createObjectURL(new Blob([built.markup], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = await loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = built.w * scale;
      canvas.height = built.h * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = state.theme === 'dark' ? '#1f1836' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const name = `${exportBaseName()}.png`;
      if (IS_DESKTOP) {
        const res = await desktop.exportDialog({ kind: 'png', defaultName: name, payload: dataUrl });
        if (res && !res.canceled) toast('PNG exported');
      } else {
        downloadBlob(dataUrlToBlob(dataUrl), name);
        toast('PNG downloaded');
      }
      return dataUrl;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function copyImage() {
    const built = await buildSvgMarkup();
    if (!built) { toast('Nothing to copy — render a diagram first', 'err'); return; }
    try {
      const url = URL.createObjectURL(new Blob([built.markup], { type: 'image/svg+xml;charset=utf-8' }));
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = built.w * 2.5; canvas.height = built.h * 2.5;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = state.theme === 'dark' ? '#1f1836' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Diagram copied to clipboard');
    } catch {
      toast('Clipboard image not available here — export PNG instead', 'err');
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
  function dataUrlToBlob(dataUrl) {
    const [head, data] = dataUrl.split(',');
    const mime = (head.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* share links — pako-compatible: #pako:base64url(deflateRaw(json)) */
  async function buildShareUrl() {
    const payload = JSON.stringify({ c: state.code, k: state.kind, t: state.theme });
    let encoded;
    try {
      const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      encoded = 'pako:' + bytesToB64url(new Uint8Array(buf));
    } catch {
      encoded = 'b64:' + bytesToB64url(new TextEncoder().encode(payload));
    }
    return `${location.href.split('#')[0]}#/${encoded}`;
  }
  function bytesToB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function readShareUrl(hash) {
    const m = hash.match(/^#\/?(pako|b64):([^/]+)$/);
    if (!m) return null;
    try {
      const raw = b64urlToBytes(m[2]);
      let text;
      if (m[1] === 'pako') {
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        text = await new Response(stream).text();
      } else {
        text = new TextDecoder().decode(raw);
      }
      const data = JSON.parse(text);
      if (typeof data.c === 'string') return { code: data.c, kind: data.k === 'markdown' ? 'markdown' : 'mermaid', theme: data.t };
    } catch { /* corrupt link */ }
    return null;
  }
  async function shareLink() {
    const url = await buildShareUrl();
    history.replaceState(null, '', `#/pako:${url.split('#/pako:')[1] || ''}`);
    const m = url.match(/#\/(pako|b64):(.+)$/);
    if (m) history.replaceState(null, '', `#/${m[1]}:${m[2]}`);
    const ok = await copyText(url);
    toast(ok ? 'Share link copied to clipboard' : url, ok ? 'ok' : 'err');
  }

  /* ---------------------------------------------------------------- */
  /* files                                                             */
  /* ---------------------------------------------------------------- */
  const ACCEPT = '.mmd,.mermaid,.md,.markdown,.txt';

  function detectKind(content, name) {
    const ext = ((name || '').match(/\.(\w+)$/) || [])[1];
    if (ext && /^(md|markdown|mdown|mkd)$/i.test(ext)) return 'markdown';
    if (ext && /^(mmd|mermaid)$/i.test(ext)) return 'mermaid';
    if (/^[ \t]*```mermaid/m.test(content)) return 'markdown';
    const stripped = content
      .replace(/^%%.*$/gm, '')
      .replace(/^---\n[\s\S]*?\n---/, '')
      .trimStart();
    const first = (stripped.split('\n')[0] || '').trim();
    if (/^(flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph|quadrantChart|xychart-beta|block-beta|architecture-beta|sankey-beta|radar-beta|C4Context|requirementDiagram|kanban|packet-beta|zenuml|info)\b/.test(first)) {
      return 'mermaid';
    }
    return /^[#>*\-]|\|/.test(first) || content.includes('\n#') ? 'markdown' : 'mermaid';
  }

  function openContent({ name, content, path = null, fromLink = false, ephemeral = false }) {
    state.code = content;
    state.kind = detectKind(content, name);
    state.fileName = name || (state.kind === 'markdown' ? 'untitled.md' : 'untitled.mmd');
    state.filePath = path;
    state.fitPending = true;
    if (!fromLink) state.theme = 'default';
    cm.setValue(state.code);
    cm.clearHistory();
    setKindButtons();
    applyMermaidConfig();
    $('#sel-theme').value = state.theme;
    markDirty(false);
    updateMeta();
    updateDesktopOnlyButtons();
    if (IS_DESKTOP) desktop.watchFile(path || null);      // live-reload for files on disk
    openStudio();
    render();
    if (!ephemeral) addLocalRecent();
  }

  async function openFileDialog() {
    if (IS_DESKTOP) {
      const res = await desktop.openFileDialog();
      if (res.canceled) return;
      if (res.error) { toast(res.error, 'err'); return; }
      openContent(res);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = ACCEPT;
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        openContent({ name: file.name, content: await file.text() });
      };
      input.click();
    }
  }

  async function saveFile(saveAs) {
    const ext = state.kind === 'markdown' ? 'md' : 'mmd';
    const content = cm.getValue();
    if (!IS_DESKTOP) {
      downloadBlob(new Blob([content], { type: 'text/plain' }), state.fileName.includes('.') && !saveAs ? state.fileName : `${exportBaseName()}.${ext}`);
      markDirty(false);
      toast('Source file downloaded');
      return;
    }
    if (state.filePath && !saveAs) {
      const res = await desktop.saveFile(state.filePath, content);
      if (res.ok) { markDirty(false); toast(`Saved ${state.fileName}`); }
      else toast(res.error || 'Save failed', 'err');
      return;
    }
    const res = await desktop.saveFileDialog({
      defaultPath: state.fileName.includes('.') ? state.fileName : `untitled.${ext}`,
      content
    });
    if (!res.canceled) {
      state.filePath = res.path;
      state.fileName = res.name;
      markDirty(false);
      updateDesktopOnlyButtons();
      toast(`Saved ${res.name}`);
    }
  }

  async function saveThenClose() {
    await saveFile(false);
    if (!state.dirty && IS_DESKTOP) desktop.confirmQuit();
  }

  async function reloadFromDisk() {
    if (!IS_DESKTOP || !state.filePath) return;
    const res = await desktop.readFile(state.filePath);
    if (res.ok) {
      state.code = res.content;
      cm.setValue(res.content);
      markDirty(false);
      render();
      toast('Reloaded from disk');
    } else toast(res.error || 'Reload failed', 'err');
  }

  function updateDesktopOnlyButtons() {
    $('#btn-reload-file').hidden = !(IS_DESKTOP && state.filePath);
  }

  /* recent files */
  async function listRecent() {
    if (IS_DESKTOP) return desktop.getRecent();
    try { return JSON.parse(localStorage.getItem('mr.recent') || '[]'); } catch { return []; }
  }
  function addLocalRecent() {
    if (IS_DESKTOP) return; // main process tracks by path
    try {
      let list = JSON.parse(localStorage.getItem('mr.recent') || '[]');
      list = list.filter((r) => r.name !== state.fileName);
      if (state.code.length < 200000) {
        list.unshift({ name: state.fileName, content: state.code, openedAt: Date.now() });
        localStorage.setItem('mr.recent', JSON.stringify(list.slice(0, 10)));
      }
    } catch { /* storage full — skip */ }
  }

  /* ---------------------------------------------------------------- */
  /* drawer (recent files / shortcuts)                                 */
  /* ---------------------------------------------------------------- */
  const drawer = $('#drawer');
  function openDrawer(title, build) {
    $('#drawer-title').textContent = title;
    const body = $('#drawer-body');
    body.innerHTML = '';
    build(body);
    drawer.hidden = false;
  }
  function closeDrawer() { drawer.hidden = true; }
  $('#drawer-close').addEventListener('click', closeDrawer);

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  async function showRecent() {
    const list = await listRecent();
    closeMenu();
    openDrawer('Recent files', (body) => {
      if (!list.length) {
        body.innerHTML = `<div class="drawer-empty">No recent files yet.<br>Open a <code>.mmd</code> or <code>.md</code> file and it will appear here.</div>`;
        return;
      }
      for (const item of list) {
        const b = document.createElement('button');
        b.className = 'recent-item';
        b.innerHTML = `
          <span class="r-name"><svg class="ic"><use href="#i-file"/></svg><span>${esc(item.name)}</span></span>
          ${item.path ? `<span class="r-path">${esc(item.path)}</span>` : ''}
          <span class="r-time">${timeAgo(item.openedAt)}</span>`;
        b.addEventListener('click', async () => {
          closeDrawer();
          if (IS_DESKTOP && item.path) {
            const res = await desktop.readFile(item.path);
            if (res.ok) openContent(res);
            else toast('File no longer exists at that path', 'err');
          } else if (item.content != null) {
            openContent({ name: item.name, content: item.content });
          }
        });
        body.appendChild(b);
      }
      const clear = document.createElement('button');
      clear.className = 'btn soft sm';
      clear.innerHTML = '<svg class="ic"><use href="#i-trash"/></svg>Clear recent files';
      clear.addEventListener('click', async () => {
        if (IS_DESKTOP) await desktop.clearRecent();
        else localStorage.removeItem('mr.recent');
        closeDrawer();
        toast('Recent files cleared');
      });
      body.appendChild(clear);
    });
  }

  /* heading outline for Markdown documents */
  function showOutline() {
    const headings = $$('#doc-view h1, #doc-view h2, #doc-view h3, #doc-view h4');
    openDrawer('Outline', (body) => {
      if (!headings.length) {
        body.innerHTML = '<div class="drawer-empty">No headings in this document.</div>';
        return;
      }
      headings.forEach((h) => {
        const level = Number(h.tagName[1]);
        const b = document.createElement('button');
        b.className = 'recent-item outline-item';
        b.style.paddingLeft = `${12 + (level - 1) * 14}px`;
        b.innerHTML = `<span class="r-name"><span style="font-weight:${level <= 2 ? 700 : 500}">${esc(h.textContent)}</span></span>`;
        b.addEventListener('click', () => {
          closeDrawer();
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        body.appendChild(b);
      });
    });
  }

  function showShortcuts() {
    closeMenu();
    const rows = [
      ['Open file', [`${MOD}`, 'O']],
      ['Save', [`${MOD}`, 'S']],
      ['Save as…', ['Shift', `${MOD}`, 'S']],
      ['Export as PNG', [`${MOD}`, 'E']],
      ['Export as SVG', ['Shift', `${MOD}`, 'E']],
      ['Export as PDF', [`${MOD}`, 'P']],
      ['Copy diagram as image', ['Shift', `${MOD}`, 'C']],
      ['Copy share link', ['Shift', `${MOD}`, 'L']],
      ['View: code / split / preview', ['Alt', `${MOD}`, '1 · 2 · 3']],
      ['Diagram zoom', [`${MOD}`, '+ / −']],
      ['Fit diagram to view', [`${MOD}`, '0']],
      ['Show shortcuts', [`${MOD}`, '/']]
    ];
    openDrawer('Keyboard shortcuts', (body) => {
      for (const [label, keys] of rows) {
        const row = document.createElement('div');
        row.className = 'sc-row';
        row.innerHTML = `<span>${esc(label)}</span><span class="keys">${keys.map((k) => `<kbd class="sc">${esc(k)}</kbd>`).join('')}</span>`;
        body.appendChild(row);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* view modes, gutter drag, fullscreen                               */
  /* ---------------------------------------------------------------- */
  function setView(mode) {
    state.view = mode;
    document.body.dataset.vp = mode;
    $$('.segmented [data-vp]').forEach((b) => b.classList.toggle('active', b.dataset.vp === mode));
    cm.refresh();
    if (state.kind === 'mermaid' && mode !== 'code') setTimeout(() => { if (state.fitPending === false) applyTransform(); }, 30);
  }
  $$('.segmented [data-vp]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.vp)));

  (function initGutter() {
    const gutter = $('#gutter');
    const codePane = $('#code-pane');
    let dragging = false;
    gutter.addEventListener('pointerdown', (e) => {
      dragging = true;
      gutter.classList.add('dragging');
      gutter.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    gutter.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const work = $('.workbench').getBoundingClientRect();
      const railW = $('.rail').offsetWidth;
      let pct = ((e.clientX - work.left - railW) / (work.width - railW)) * 100;
      pct = clamp(pct, 22, 70);
      codePane.style.width = `${pct}%`;
    });
    gutter.addEventListener('pointerup', () => {
      dragging = false;
      gutter.classList.remove('dragging');
    });
    gutter.addEventListener('dblclick', () => { codePane.style.width = '42%'; });
  })();

  $('#btn-full').addEventListener('click', () => {
    const on = document.body.classList.toggle('preview-full');
    if (!on) setTimeout(() => cm.refresh(), 30);
    if (!on && state.kind === 'mermaid') setTimeout(fitToStage, 40);
    if (on && state.kind === 'mermaid') setTimeout(fitToStage, 40);
  });

  /* ---------------------------------------------------------------- */
  /* kind toggle + theme                                               */
  /* ---------------------------------------------------------------- */
  function setKindButtons() {
    $$('.kind-toggle [data-kind]').forEach((b) => b.classList.toggle('active', b.dataset.kind === state.kind));
    $('#status-kind').textContent = state.kind;
    cm.setOption('mode', state.kind === 'mermaid' ? 'mermaid' : 'markdown');
  }
  $$('.kind-toggle [data-kind]').forEach((b) => b.addEventListener('click', () => {
    state.kind = b.dataset.kind;
    setKindButtons();
    if (state.kind === 'markdown' && state.fileName.endsWith('.mmd')) state.fileName = state.fileName.replace(/\.mmd$/, '.md');
    if (state.kind === 'mermaid' && state.fileName.endsWith('.md')) state.fileName = state.fileName.replace(/\.md$/, '.mmd');
    updateMeta();
    updateStageChrome();
    fitIfPending();
    render();
  }));

  function fitIfPending() { state.fitPending = state.kind === 'mermaid'; }

  $('#sel-theme').addEventListener('change', (e) => {
    state.theme = e.target.value;
    applyMermaidConfig();
    render();
  });
  function setTheme(t) {
    if (!['default', 'neutral', 'forest', 'dark', 'base'].includes(t)) return;
    state.theme = t;
    $('#sel-theme').value = t;
    applyMermaidConfig();
    render();
  }

  /* ---------------------------------------------------------------- */
  /* sample & action menus                                             */
  /* ---------------------------------------------------------------- */
  function loadSample(key) {
    const s = SAMPLES[key];
    if (!s) return;
    state.theme = 'default';
    if (s.kind === 'markdown') {
      openContent({ name: 'field-guide.md', content: s.code });
      state.kind = 'markdown';
      setKindButtons();
      updateStageChrome();
      render();
    } else {
      openContent({ name: `${key}.mmd`, content: s.code });
    }
    state.fitPending = true;
    render();
    toast(`${s.label} sample loaded`);
  }

  $('#btn-samples').addEventListener('click', (e) => {
    e.stopPropagation();
    const items = [{ header: 'Sample diagrams' }];
    for (const [key, s] of Object.entries(SAMPLES)) {
      if (s.kind === 'markdown') continue;
      items.push({ label: s.label, icon: 'i-sample', action: () => loadSample(key) });
    }
    items.push({ sep: true });
    items.push({ header: 'Documents' });
    items.push({ label: 'Markdown field guide', icon: 'i-book', action: () => loadSample('markdown') });
    openMenu(e.currentTarget, items);
  });

  $('#btn-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu(e.currentTarget, [
      { header: 'File' },
      { label: 'Open…', icon: 'i-folder', kbd: `${MOD} O`, action: openFileDialog },
      { label: 'Save', icon: 'i-save', kbd: `${MOD} S`, action: () => saveFile(false) },
      { label: 'Save as…', icon: 'i-download', kbd: `Shift ${MOD} S`, action: () => saveFile(true) },
      { sep: true },
      { header: 'Export' },
      { label: 'Export as PNG…', icon: 'i-image', kbd: `${MOD} E`, action: () => exportPng() },
      { label: 'Export as SVG…', icon: 'i-download', kbd: `Shift ${MOD} E`, action: exportSvg },
      { label: 'Export as PDF…', icon: 'i-book', kbd: `${MOD} P`, action: exportPdf },
      { label: 'Copy diagram as image', icon: 'i-copy', kbd: `Shift ${MOD} C`, action: copyImage },
      { sep: true },
      { header: 'Share' },
      { label: 'Copy share link', icon: 'i-link', kbd: `Shift ${MOD} L`, action: shareLink },
      { label: 'Copy Markdown embed', icon: 'i-clipboard', action: copyMarkdownEmbed },
      { sep: true },
      { label: 'Restore default sample', icon: 'i-refresh', action: () => { openContent({ name: 'untitled.mmd', content: DEFAULT }); toast('Editor restored'); } }
    ]);
  });

  async function copyMarkdownEmbed() {
    const ok = await copyText('```mermaid\n' + cm.getValue().trim() + '\n```');
    toast(ok ? 'Markdown embed copied' : 'Copy failed', ok ? 'ok' : 'err');
  }

  $('#btn-share').addEventListener('click', shareLink);
  $('#btn-copy-img').addEventListener('click', copyImage);

  /* ---------------------------------------------------------------- */
  /* navigation between home & studio                                  */
  /* ---------------------------------------------------------------- */
  function openStudio() {
    document.body.dataset.view = 'studio';
    $('#home').hidden = true;
    $('#studio').hidden = false;
    document.body.style.overflow = 'hidden';
    if (!location.hash || location.hash === '#/') history.replaceState(null, '', '#/edit');
    setView(state.view);
    cm.refresh();
  }
  function goHome() {
    document.body.dataset.view = 'home';
    $('#home').hidden = false;
    $('#studio').hidden = true;
    document.body.style.overflow = '';
    document.body.classList.remove('preview-full');
    closeDrawer(); closeMenu();
    history.replaceState(null, '', '#/');
  }
  $('#btn-back').addEventListener('click', goHome);
  $('#rail-home').addEventListener('click', goHome);
  $('#nav-start').addEventListener('click', () => { openStudio(); state.fitPending = true; render(); });
  $('#brand-home').addEventListener('click', (e) => { e.preventDefault(); goHome(); });

  /* ---------------------------------------------------------------- */
  /* home page wiring                                                  */
  /* ---------------------------------------------------------------- */
  (function buildChips() {
    const prompts = $('#prompt-chips');
    for (const chip of PROMPT_CHIPS) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = `<b>${esc(chip.label)}</b>`;
      b.addEventListener('click', () => loadSample(chip.sample));
      prompts.appendChild(b);
    }
    const types = $('#type-chips');
    for (const key of TYPE_CHIPS) {
      const s = SAMPLES[key];
      const b = document.createElement('button');
      b.className = 'chip dt';
      b.textContent = s.label.toLowerCase();
      b.addEventListener('click', () => loadSample(key));
      types.appendChild(b);
    }
    const doc = document.createElement('button');
    doc.className = 'chip dt';
    doc.textContent = 'markdown demo';
    doc.addEventListener('click', () => loadSample('markdown'));
    types.appendChild(doc);
  })();

  (function buildMarquee() {
    const track = $('#marquee-track');
    const seq = [...MARQUEE, ...MARQUEE];
    for (const w of seq) {
      const span = document.createElement('span');
      span.textContent = w;
      track.appendChild(span);
    }
  })();

  $('#drop-card').addEventListener('click', (e) => {
    if (e.target.closest('.btn')) return;
    openFileDialog();
  });
  $('#drop-card').addEventListener('keydown', (e) => { if (e.key === 'Enter') openFileDialog(); });
  $('#btn-open-file').addEventListener('click', (e) => { e.stopPropagation(); openFileDialog(); });
  $('#btn-paste').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast('Clipboard is empty', 'err'); return; }
      openContent({ name: 'clipboard.txt', content: text });
    } catch {
      toast('Clipboard access was blocked — press Ctrl/Cmd+V in the editor instead', 'err');
      openStudio();
      cm.focus();
    }
  });

  /* rail */
  $('#rail-open').addEventListener('click', openFileDialog);
  $('#rail-save').addEventListener('click', () => saveFile(false));
  $('#rail-recent').addEventListener('click', () => { drawer.hidden ? showRecent() : closeDrawer(); });
  $('#rail-shortcuts').addEventListener('click', () => { drawer.hidden ? showShortcuts() : closeDrawer(); });
  $('#btn-reload-file').addEventListener('click', reloadFromDisk);

  /* ---------------------------------------------------------------- */
  /* drag & drop                                                       */
  /* ---------------------------------------------------------------- */
  let dragDepth = 0;
  function isFileDrag(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  }
  document.addEventListener('dragenter', (e) => {
    if (!isFileDrag(e)) return;
    dragDepth++;
    $('#drop-overlay').hidden = false;
  });
  document.addEventListener('dragleave', (e) => {
    if (!isFileDrag(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) $('#drop-overlay').hidden = true;
  });
  document.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('#drop-overlay').hidden = true;
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast('File is too large (4 MB max)', 'err'); return; }
    const content = await file.text();
    openContent({ name: file.name, content, path: IS_DESKTOP ? file.path || null : null });
    toast(`Opened ${file.name}`);
  });

  /* paste raw text anywhere on home → open it */
  document.addEventListener('paste', (e) => {
    if (document.body.dataset.view !== 'home') return;   // CodeMirror handles studio pastes
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text && text.trim()) openContent({ name: 'clipboard.txt', content: text });
  });

  /* ---------------------------------------------------------------- */
  /* keyboard (browser only — Electron menu accelerators cover desktop)*/
  /* ---------------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    if (e.key === 'Escape') {
      if (!drawer.hidden) { closeDrawer(); return; }
      closeMenu();
      if (document.body.classList.contains('preview-full')) document.body.classList.remove('preview-full');
      return;
    }
    if (IS_DESKTOP) return;                 // menu accelerators fire instead
    if (!mod) return;
    const k = e.key.toLowerCase();
    const map = {
      o: () => openFileDialog(),
      s: () => (e.shiftKey ? saveFile(true) : saveFile(false)),
      e: () => (e.shiftKey ? exportSvg() : exportPng()),
      p: () => exportPdf(),
      c: () => { if (e.shiftKey) copyImage(); },
      l: () => { if (e.shiftKey) shareLink(); },
      '/': () => showShortcuts()
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  /* ---------------------------------------------------------------- */
  /* Electron menu bridge                                              */
  /* ---------------------------------------------------------------- */
  if (IS_DESKTOP) {
    const on = desktop.onMenu.bind(desktop);
    on('menu:open', openFileDialog);
    on('menu:open-path', (payload) => payload && openContent(payload));
    on('menu:save', () => saveFile(false));
    on('menu:save-as', () => saveFile(true));
    on('menu:save-then-close', saveThenClose);
    on('menu:export-png', () => exportPng());
    on('menu:export-svg', exportSvg);
    on('menu:copy-image', copyImage);
    on('menu:copy-link', shareLink);
    on('menu:view-code', () => setView('code'));
    on('menu:view-split', () => setView('split'));
    on('menu:view-preview', () => setView('preview'));
    on('menu:theme', (t) => setTheme(t));
    on('menu:zoom', (dir) => {
      if (dir === 'in') setZoom(state.zoom * 1.25);
      else if (dir === 'out') setZoom(state.zoom / 1.25);
      else { state.zoom = 1; centerDiagram(); }
    });
    on('menu:shortcuts', showShortcuts);
    on('menu:export-pdf', exportPdf);
    on('menu:file-updated', ({ content }) => {
      if (content === state.code) return;               // our own save — ignore
      if (!state.dirty) {
        state.code = content;
        cm.setValue(content);
        cm.clearHistory();
        markDirty(false);
        render();
        toast('File changed on disk — reloaded');
      } else {
        toast('File changed on disk — press the reload icon to adopt changes', 'err');
      }
    });
  }

  /* external links through OS shell on desktop */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="http"]');
    if (a && IS_DESKTOP) { e.preventDefault(); desktop.openExternal(a.href); }
  });

  /* ---------------------------------------------------------------- */
  /* boot                                                              */
  /* ---------------------------------------------------------------- */
  $('#mermaid-ver').textContent = MERMAID_VERSION;
  $('#mermaid-ver-foot').textContent = MERMAID_VERSION;
  updateMeta();
  setKindButtons();
  updateStageChrome();

  (async function boot() {
    const shared = await readShareUrl(location.hash);
    if (shared) {
      if (shared.theme) { state.theme = shared.theme; }
      openContent({ name: 'shared.mmd', content: shared.code, fromLink: true });
      state.kind = shared.kind;
      setKindButtons();
      updateStageChrome();
      render();
      toast('Opened shared diagram');
    } else {
      // restore the previous working session (fully local) — including #/edit reloads
      const session = readSession();
      if (session && session.code) {
        if (['default', 'neutral', 'forest', 'dark', 'base'].includes(session.theme)) state.theme = session.theme;
        openContent({ name: session.name || 'untitled.mmd', content: session.code, ephemeral: true });
        if (session.kind) { state.kind = session.kind; setKindButtons(); updateStageChrome(); render(); }
        if (location.hash !== '#/edit') toast('Restored your last session');
      } else if (location.hash === '#/edit') {
        openStudio();
        render();
      }
      // else: fresh launch → stay on the home page
    }
  })();
})();
