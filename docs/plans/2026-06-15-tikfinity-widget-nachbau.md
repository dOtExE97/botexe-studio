# TikFinity-Widget-Nachbau (Vorlagen aus Alex' Beispiel-Videos)

**Stand 15.06.2026.** Quelle: 16 Videos + 3 Bilder von Alex (ZimaOS
`/media/sdb1/downloads/Tikfinity Beispiele`), per 5 Agenten Frame-für-Frame
analysiert. Ziel: TikFinitys Premium-Widgets nachbauen — **so schön oder besser**,
alles UI-einstellbar, jedes Widget mit **mehreren durchwählbaren Design-Varianten**
(wie TikFinitys „Styles 1/N") + unseren 17 Themes + Akzentfarbe.

## Was die Videos zeigten (Mapping)
| TikFinity-Feature | Video | botexe-studio |
|---|---|---|
| Geschenke-Kanone (Avatar-Bälle, Physik) | 3465 | 🆕 **gebaut** `gift-cannon.js` |
| Social-Media-Rotator (Follow-Pille) | 3478/79 | 🆕 **gebaut** `social-rotator.js` |
| Emojify (Chat-Emojis fliegen) | 3478/79 | 🆕 **gebaut** `emojify.js` |
| Sound-/Befehl-Karussell | 3469 | 🆕 **gebaut** `command-carousel.js` |
| Webcam-Rahmen + Footer-Banner | 3474/75 | ⏳ später (eigene große Kategorie) |
| Sport-Ticker (GOAL-Lauftext + grüner Tor-Glow) | 3462/63 | ✅ `sport-ticker` → Variante offen |
| Coin-Glas (3D-Glas + Füll-Physik + Donation-Toasts) | 3464 | ✅ `gift-jar` → Variante offen |
| Feuerwerk (Rakete + Neon-Name + Burst) | 3467/68 | ✅ `gift-fireworks` → Neon-Name offen |
| Glücksrad (Trigger-Banner + Lichter-Rand) | 3477 | ✅ `wheel` → Variante offen |
| Goal-Bars / Top-Gift / Top-Streak / Geschenkzähler | 3471/72/73 | ✅ vorhanden → Politur offen |
| (3459 Makro-Statuszeile, 3470 Übergang, 3476 Zimmerdecke) | — | irrelevant |

## Batch 1 — Neue Widgets ✅ (15.06., 206 Tests grün)
- **`social-rotator.js`** — rotierende Follow-Pille, echtes Marken-Branding (TikTok/
  Instagram/YouTube/Discord/Twitch/X/Kick/Snapchat/Facebook als Inline-SVG),
  Slide+Fade-Rotation. Styles: pill (TikFinity-Look) / glas / neon. `parseChannels`
  TDD (6 Tests). Kanäle als „plattform:Name | …".
- **`emojify.js`** — Chat-Emojis fliegen über den Schirm. `extractEmojis` grapheme-
  korrekt (Hautton/ZWJ/Flaggen via Intl.Segmenter), TDD (6 Tests). Styles: float /
  cross / fall. Cap gegen Chat-Fluten (80 live).
- **`gift-cannon.js`** — Canvas-Physik: Avatar-Bälle (rund maskiert + Gift-Icon) in
  Wurfparabel, Gravitation, Boden-Sammeln + Ausfaden. Combo → mehrere Bälle (nutzt
  `comboPlan`). Styles: cannon (schräg, mit Rohr+Mündungsblitz) / fountain / rain.
  scheduleFrame-Anti-Throttle, Ball-Cap, idle = keine CPU.
- **`command-carousel.js`** — durchlaufende Sticker-Leiste der Befehle/Sounds
  (TikTok-Sticker-Look: bunte Kacheln, weiße Outline). `parseItems` TDD (4 Tests).
  Styles: sticker / glas / neon.
- Alle in OverlayPage registriert (Kategorie + Style-Dropdown + Felder), in der
  Editor-Vorschau live (Demo-Daten).

## Batch 2 — TikFinity-Design-Varianten für bestehende Widgets (offen)
Als zusätzliche wählbare „Styles", nicht ersetzend:
- **sport-ticker**: durchlaufender Marquee-Modus + großer „GOOOAAALLL"-Lauftext +
  grüner Tor-Glow-Zustandswechsel (statt nur Aufblitzen).
- **wheel**: Trigger-Banner („X hat mit 🌹 gedreht") vor dem Spin + Marquee-
  Glühbirnen-Rand + Casino-Look-Variante.
- **gift-fireworks**: Neon-Script-Username im Explosionszentrum.
- **gift-jar**: realistischeres 3D-Glas + Donation-Toast-Variante.
- **counter**: animiertes Gift-Icon (Puls + rotierender Glow-Ring) + Abstimmungsmodus
  (mehrere Counter, Reset bei Zielerreichung).
- **top-gift / top-streak**: Sticker-Outline-Variante (dicke weiße Kontur, TikTok-Look).

## Batch 3 — Webcam-Rahmen + Footer (später, eigene Kategorie)
Animierte Cam-Rahmen-Galerie: Neon-Flow / Pixel-Art / Sakura-Partikel / Gold-Champion
/ Glitch-eSport, je mit mehreren Styles, Greenscreen- + Blank-Varianten, passende
Footer-Banner als Set. Reines CSS/SVG-Overlay für OBS Browser-Source.

## Offen / Rückfragen
- Alex' echte **Social-Kanäle** (Handles) für sinnvolle Rotator-Defaults.
- Frames der Analyse liegen temporär unter `/tmp/tikframes` (lokal, nicht im Repo).
