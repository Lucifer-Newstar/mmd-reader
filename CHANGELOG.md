# Changelog

All notable changes to mmd-reader are documented here. This project follows
[Semantic Versioning](https://semver.org/) and the format is based on
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

## [1.0.0] — 2026-08-09

First public release. 🧜‍♀️

### Added
- mermaid.ai-inspired start page: hero, prompt chips ("What do you need to figure out?"),
  diagram-type chips, brand band, footer.
- Studio: live Mermaid Live Editor-style workspace — CodeMirror editor with a bespoke
  Mermaid syntax highlighter, draggable split, code/split/preview modes.
- Markdown documents render as branded, typeset pages with every ` ```mermaid ` fence
  rendered inline, plus heading outline drawer and reading-time stats in the status bar.
- Preview canvas: drag-to-pan, cursor-anchored wheel zoom, fit-to-view, 100% reset,
  fullscreen preview; five Mermaid themes (default / neutral / forest / dark / base).
- mermaid.live-style error card; last good render stays visible while you fix syntax.
- Files: native open/save dialogs, drag-and-drop, paste-from-clipboard, OS
  double-click file associations (`.mmd`, `.mermaid`, `.md`, `.markdown`), recent files,
  reload-from-disk, **live file watching** (auto-reload when your external editor saves,
  with unsaved-changes protection).
- Export: PNG (retina, fonts embedded), SVG (fonts embedded), PDF (exact-fit pages for
  diagrams, paged A4 for documents), copy-as-image, copy as ```mermaid Markdown embed.
- Share: fully offline, pako-deflated URL links (`#/pako:…`), like mermaid.live.
- Session restore: your working buffer comes back after a restart (stored locally only).
- Desktop integration: native menus, keyboard accelerators, unsaved-changes guard on
  close, window-state persistence, single-instance behavior, custom About dialog.
- Desktop packaging via electron-builder: Windows (NSIS + portable), macOS (DMG),
  Linux (AppImage + deb).
- Open-source package: MIT license, CONTRIBUTING, Code of Conduct, SECURITY policy,
  issue/PR templates, CI (`npm run check`).

### Security
- Sandboxed renderer, contextIsolation, strict CSP (`script-src 'self'`).
- Markdown sanitized via DOMPurify; Mermaid at `securityLevel: 'strict'`.
- Zero runtime network: no CDNs, fonts-by-URL, analytics, or telemetry.

[Unreleased]: https://github.com/Lucifer-Newstar/mmd-reader/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Lucifer-Newstar/mmd-reader/releases/tag/v1.0.0
