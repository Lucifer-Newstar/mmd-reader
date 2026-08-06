# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues.**

Email **navin.jairam@gmail.com** with `[mmd-reader security]` in the subject.
Include steps to reproduce and, if the issue involves file parsing, a minimal
`.mmd`/`.md` reproducer. You can expect an acknowledgment within a few days.

## Threat model (read: what this app does on your machine)

mmd-reader is **offline and fully local**.

* The renderer runs sandboxed Chromium with `contextIsolation` on,
  `nodeIntegration` off, and a strict CSP (`default-src 'self'`,
  `script-src 'self'`).
* Markdown from disk is parsed by `marked` and sanitized by `DOMPurify`
  before touching the DOM. Inline HTML/JS in a `.md` file is stripped —
  never executed.
* Mermaid runs with `securityLevel: 'strict'` (no embedded HTML labels,
  no click handlers from diagram text).
* The only network the app can ever make is a link you explicitly click,
  which is handed to your default browser via `shell.openExternal`.
  Navigation/new-window attempts from inside the app are denied.
* App-written state (recent files, window bounds, session buffer) lives in
  the OS user-data dir / localStorage. Nothing is uploaded anywhere.

If you find anywhere these invariants don't hold, that's a security bug —
please tell us.
