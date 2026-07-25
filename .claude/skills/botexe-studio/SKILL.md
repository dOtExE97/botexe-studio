---
name: botexe-studio
description: Bauanleitung und Fallstricke für das Repo bOtExE Studio (Overlay-Widgets, Electron-App, Release). Nutze diesen Skill bei jeder Arbeit an diesem Projekt — Widget bauen oder ändern, Einstellung hinzufügen, Screenshot prüfen, releasen. Die vollständige Anleitung steht in AGENTS.md im Repo-Wurzelverzeichnis.
---

# bOtExE Studio

**Die vollständige, tool-neutrale Bauanleitung ist `AGENTS.md` im Repo-Wurzelverzeichnis — lies sie zuerst.** Sie ist die einzige Quelle der Wahrheit; dieser Skill fasst nur die Fallstricke zusammen, an denen sonst am meisten Zeit verloren geht.

Freier TikFinity-Ersatz für TikTok-Streamer. Electron + Vite + TypeScript-Monorepo. Die Endnutzer sind Streamer, keine Entwickler — sie urteilen über Bilder und Verhalten. Antworten auf Deutsch. **Nichts releasen ohne ausdrückliche Freigabe.**

## Die teuersten Fallstricke (Details in AGENTS.md)

- **container-type-Falle:** `container-type` UND eine `cq`-Einheit in DERSELBEN CSS-Regel misst den Viewport statt der Box (ein Element kann seinen eigenen Container nicht abfragen). `container-type` auf die Wurzel, `cq` in die Kinder.
- **Textgröße:** jede Basisgröße `calc(clamp(…) * var(--bx-fs, 1))`, Faktor AUSSEN ums clamp.
- **Screenshots headless:** KEIN `--disable-gpu` (hängt), sondern `--enable-unsafe-swiftshader`. `requestAnimationFrame` feuert nicht — `setTimeout` nehmen. CSS-Animationen folgen der virtuellen Zeit nicht — mit negativem `animation-delay` + `paused` einfrieren.
- **Verifikation nur per Exit-Code** (`lint`, `typecheck`, `test`, `widget-check` — alle 0), nie am getailten Log. **`node --check <datei>` nach jeder `.js`-Änderung in `widget-kit/`** — ESLint erfasst diese Dateien nicht.
- **TikTok-Gift-Bilder** nie ins Repo committen. Lokal testen über `gift-master.json` + separaten HTTP-Server; danach `find . -name "*.webp" -not -path "./node_modules/*"` == 0.
- **Bestehende Overlays dürfen sich nie verändern** — neue Optik = neuer Stil-Wert, Widget-Typen nicht löschen.
- **`.bx-frameless`** und **`.bx-premium`** sind gemeinsame opt-in-Ebenen in `widget-base.css`; ihre Fallen (formtragende Ränder, belegte Pseudo-Elemente) stehen in AGENTS.md.

## Release

Ablauf und Reihenfolge stehen in AGENTS.md (Version in beiden `package.json`, CHANGELOG, package, smoke, `git commit -F`, tag, push, auf CI **und** Windows Build warten). Nur nach Freigabe.
