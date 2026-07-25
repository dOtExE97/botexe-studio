# CLAUDE.md

Die vollständige Bauanleitung für dieses Repo steht in **[AGENTS.md](AGENTS.md)** —
tool-neutral, für alle KI-Coding-Agenten. Bitte zuerst lesen.

Sie enthält: Aufbau des Monorepos, wie ein Overlay-Widget gebaut/registriert wird,
die CSS-Konventionen (container-type, `--bx-fs`, frameless, premium) samt ihrer
Fallstricke, die Screenshot-Fallen (headless Chrome), die Verifikation per
Exit-Code und den Release-Ablauf.

Kurz-Merker:
- **Nichts releasen ohne ausdrückliche Freigabe.** Sprache: Deutsch.
- Nach jeder `.js`-Änderung in `packages/widget-kit/`: `node --check <datei>` (ESLint erfasst diese Dateien nicht).
- Verifikation nur per Exit-Code (`lint`, `typecheck`, `test`, `widget-check` — alle 0), nie am getailten Log.
- TikTok-Gift-Bilder gehören TikTok und werden nie ins Repo committet.
