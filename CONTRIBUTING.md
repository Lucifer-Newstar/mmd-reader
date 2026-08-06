# Contributing to mmd-reader

First off — thank you! 🧜‍♀️ This project is a labor of love for the Mermaid ecosystem, and
contributions of every size are welcome: bug reports, docs, samples, design polish, code.

**Maintainer:** Navin Jairam (a.k.a. [@Lucifer-Newstar](https://github.com/Lucifer-Newstar))
— <navin.jairam@gmail.com>

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

---

## The one hard rule: offline & local-first

mmd-reader must run with the network cable **unplugged**. Forever. That means:

- ❌ No runtime network requests — no CDNs, no analytics, no telemetry, no font services,
  no update-check beacons. Everything the app needs ships inside it (`renderer/vendor/`,
  `renderer/fonts/`).
- ❌ No new remote dependencies in the render path. Rendering happens with the bundled
  `mermaid.min.js` and `marked`/`DOMPurify`.
- ✅ The only outbound traffic the app can ever produce is the user *explicitly* clicking a
  documentation/GitHub link, which is handed to the OS default browser via
  `shell.openExternal` — never loaded into the app window.
- ✅ User files live wherever the user put them. State the app writes (recent files, window
  bounds, session buffer) stays in the OS user-data directory / localStorage.

PRs that add network behavior will be closed with a kind note and a link to this section.

## Ways to contribute

- **Report bugs** — open an [issue](https://github.com/Lucifer-Newstar/mmd-reader/issues/new)
  with the bug-report template. A failing `.mmd`/`.md` file attached (or a share link copied
  from the app: `Shift+Ctrl/Cmd+L`) is the fastest path to a fix.
- **Suggest features** — feature-request template. Keep the offline rule in mind.
- **Add sample diagrams** — see below; one-file change, great first PR.
- **Code** — fork, branch, PR. Small focused PRs beat giant ones.

## Development setup

```bash
git clone https://github.com/Lucifer-Newstar/mmd-reader.git
cd mmd-reader
npm install          # dev-only deps: electron + electron-builder
npm start            # launch the app
npm run dev          # launch with DevTools detached
```

No build step for the renderer — plain HTML/CSS/JS. Edit, reload the window (`Ctrl+R`), repeat.

### Project layout

| Path                        | Purpose                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `main/main.js`              | Electron main: window, native menus, dialogs, IPC, file watch |
| `main/preload.js`           | `contextBridge` → `window.desktop` (allowlisted channels only)|
| `renderer/index.html`       | Both app shells (home + studio), SVG icon sprite              |
| `renderer/css/app.css`      | Visual system (mermaid.ai palette/typography) + print rules   |
| `renderer/js/app.js`        | Render pipeline, pan/zoom canvas, files, menus, sharing       |
| `renderer/js/samples.js`    | Sample diagrams + home-page chip mappings                     |
| `renderer/js/mermaid-mode.js` | CodeMirror mode for Mermaid syntax                          |
| `scripts/check.js`          | Fast offline lint/validation suite (runs in CI)               |

## Before you send a PR

1. `npm run check` must pass (syntax-checks every JS file, validates that all bundled
   samples parse, asserts the offline rule — no external URLs in the boot path).
2. If you changed rendering behavior, run the UI smoke (optional, needs Chromium deps):
   `npm i -D puppeteer && node scripts/smoke.js` and eyeball `shots/*.png`.
3. Update `CHANGELOG.md` under `## Unreleased`.
4. Keep PRs focused; reference issues with `Fixes #123`.

### Commit style

Conventional Commits, 72-col subject:

```
feat(renderer): add nolan-theme variables for base theme
fix(main): stop watching file after window close
docs(readme): document the share-link format
test(scripts): assert CSP blocks inline event handlers
```

Types: `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `chore` · `build` · `ci`.

### Adding a new sample diagram

1. Add an entry to `window.SAMPLES.SAMPLES` in `renderer/js/samples.js`.
2. Give it a `label` and a `code` string.
3. Run `npm run check` — it parses every sample with the real bundled Mermaid, so a broken
   sample fails CI.
4. Optionally map a home-page prompt chip to it in `PROMPT_CHIPS`.

### Working in the renderer

- mermaid is a UMD global (`window.mermaid`), configured in `applyMermaidConfig()`.
  Rendering goes through `mermaid.parse()` first, then `mermaid.render()` — errors land in
  the mermaid.live-style error card without clobbering the last good frame.
- The preview canvas transform lives in `state.{zoom,panX,panY}`; always mutate via
  `setZoom()`/`applyTransform()`.
- Security: anything that touches the DOM from user files must pass through `DOMPurify`.
  The CSP is `script-src 'self'` — inline handlers (`onclick=`) are blocked by design.

## Releasing (maintainers)

```bash
npm version patch            # bumps + tags
npm run dist                 # NSIS + portable (Win), DMG (mac), AppImage/deb (Linux)
git push --follow-tags
```

Attach the artifacts from `dist-app/` to a GitHub Release with notes from `CHANGELOG.md`.

Thanks again — and happy diagramming!
