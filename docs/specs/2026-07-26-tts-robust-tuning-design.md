# TTS: zuverlässig + pro Anbieter einstellbar

Datum: 2026-07-26 · Status: Design abgesegnet, in Umsetzung

## Problem (belegt durch Alex' Logs aus Issue #16)
```
17:17:29 [WARN]  [TTS] Synthese-Versuch 1 fehlgeschlagen (Timed out) — neuer Versuch…
17:17:50 [ERROR] [TTS] Synthese fehlgeschlagen (voice=edge:de-DE-ElkeNeural) — Timed out
17:18:31 [INFO]  [Piper] Stimme Karlsson (DE, Mann) — lokal bereit
17:18:32 [WARN]  [TTS] Synthese-Versuch 1 fehlgeschlagen (Timed out) — …   ← weiter edge!
17:18:54 [ERROR] [TTS] Synthese fehlgeschlagen (voice=edge:de-DE-LouisaNeural) — Timed out
```
1. **Edge-TTS (online) antwortet nicht** → „Timed out" aus `node-edge-tts`.
2. **Kein Ausweichen**: Piper war lokal FERTIG installiert, wurde aber nie genutzt → TTS blieb
   komplett stumm. 3 Versuche × ~10 s = **~30 s Stille pro Nachricht**.
3. **Regler wirkungslos**: `rate`/`pitch` werden NUR an `edgeSynthesize` übergeben
   (`piper.synthesize(text, id, target)` bekommt kein Tuning) → bei Piper tut sich nichts.
   Der Hinweis steht nur in einem `title`-Tooltip.
4. (bereits gefixt, Commit 092f5b1) Der TTS-Lautstärkeregler lief über den Mixer-Kanal `tts`,
   und `mixer` fehlte in der SETTINGS_UPDATE-Allowlist → fiel nach jedem Neustart zurück.

## Befund: was kann welcher Anbieter (recherchiert)
| Anbieter | Möglich | Bisher genutzt |
|---|---|---|
| `edge` (node-edge-tts) | rate, pitch, **volume**, **timeout**, proxy | rate/pitch; volume hart `+0%`, timeout ungenutzt |
| `piper` (CLI 2023.11.14-2) | `--length_scale` (Tempo), `--noise_scale` (Ausdruck), `--noise_w` (Aussprache-Variation), `--sentence_silence` | **nichts** |
| `elevenlabs` | stability, similarity_boost, style, use_speaker_boost | nichts (nur `model_id`) |
| `openai` | speed (0.25–4), model (`tts-1` / **`tts-1-hd`**) | model nur aus Zugangsdaten |
| `polly` | **Engine** (standard/neural), SSML rate/pitch | nichts |
| `gtts` | slow | nichts |

## Umfang
### A) Zuverlässigkeit („Notfall-Kette")
1. **Timeouts kürzen**: `SYNTH_TIMEOUT_MS` 12 s → **7 s**; Edge-Lib bekommt ihren `timeout`
   explizit gesetzt (statt Lib-Default). Versuche: 3 → **2** (schnell scheitern, dann ausweichen).
2. **Auto-Ausweichen auf lokal**: Scheitert eine ONLINE-Stimme (edge/gtts/BYOK) endgültig und ist
   eine **Piper-Stimme einsatzbereit**, wird die Ansage sofort damit gesprochen (einmalig, kein
   Endlos-Fallback). Log: `[TTS] Online-Stimme nicht erreichbar → lokale Stimme <name>`.
3. **Sichtbarer Hinweis** statt Stille: Fehler/Fallback wird der Oberfläche gemeldet
   (bestehender `onError`-Kanal), damit man es sieht statt zu rätseln.

### B) Regler pro Anbieter
4. **Tuning-Schema als Daten** (Muster: `BYOK_PROVIDERS.fields`): jeder Anbieter beschreibt seine
   Regler (`key`, `label`, `min`, `max`, `step`, `default`, `hint`, ggf. `options` für Auswahl).
5. **Speicherung pro Anbieter**: `tts.tuning: Record<providerId, Record<key, number|string>>`.
   Migration: vorhandene `tts.rate`/`tts.pitch` → `tuning.edge.rate/pitch` (nichts geht verloren).
   **Pflicht**: `tuning` in die SETTINGS_UPDATE-Allowlist (tts-Unterliste) — sonst der bekannte
   stille Speicher-Bug. Der Wächter-Test wird auf die tts-Unterfelder erweitert.
6. **Anwenden** in allen Engines: edge (rate/pitch/volume/timeout), piper (length_scale,
   noise_scale, noise_w, sentence_silence), openai (speed/model), polly (engine), gtts (slow),
   elevenlabs (voice_settings).
7. **UI**: Die TTS-Seite zeigt automatisch **nur die Regler der gerade gewählten Stimme**, mit
   Klartext-Erklärung und „Zurücksetzen". Keine toten Regler mehr.

## Verifikation
Pro Task: `lint`/`typecheck`/`test`/`widget-check` == 0. Reine Logik (Tuning-Auflösung, Fallback-
Entscheidung) als pure Funktionen testen. Kein echter Netzwerk-Call in Tests.
