// leaderboard.js — Top-Liste (Gifter/Liker) mit 3 Stilen.
// props: { source?, limit?, title?, accent?, style?: 'glas'|'neon'|'bars' }
const STYLE_ID = 'bx-lb-style';
const CSS = `
.bx-lb { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body);
  padding: clamp(6px,4.5cqh,26px) clamp(8px,2.2cqi,30px) clamp(5px,3.5cqh,22px); overflow: hidden; container-type: size; }
/* Schrift skaliert mit BEIDEN Achsen: min(cqi,cqh) — cqmin allein macht in
   breiten, flachen Boxen (760x180) winzige Buchstaben. */
.bx-lb-title { position: relative; overflow: hidden; font-family: var(--bx-font-display); font-size: calc((clamp(11px,min(3.6cqi,10cqh),24px)) * var(--bx-fs, 1)); letter-spacing: .3em;
  text-transform: uppercase; color: var(--bx-accent); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 45%, transparent);
  padding-bottom: clamp(3px,2.6cqh,14px); margin-bottom: clamp(3px,2.6cqh,14px); border-bottom: 1px solid color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-lb-title::after { content:''; position:absolute; top:0; bottom:0; left:-60%; width:45%; transform:translateX(0) skewX(-20deg);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent); animation: bx-shimmer 3.6s ease-in-out infinite; }
.bx-lb-list { position: relative; flex: 1; }
/* Zeile ist selbst ein Größen-Container: Badge, Bild und Schrift bemessen sich
   an der ZEILENHÖHE — so wächst alles mit, wenn das Widget größer gezogen wird. */
.bx-lb-row { position: absolute; left:0; right:0; height:46px; display:flex; align-items:center; gap:clamp(4px,2.2cqi,20px); padding:0 clamp(3px,1.2cqi,14px); border-radius:12px;
  container-type: size; transition: transform 520ms cubic-bezier(.25,1,.35,1), opacity 320ms; }
.bx-lb-rank { height:62%; aspect-ratio:1/1; width:auto; flex:none; display:flex; align-items:center; justify-content:center; font-family: var(--bx-font-display); font-size:calc((clamp(9px,34cqh,30px)) * var(--bx-fs, 1)); color:#0a0b10; border-radius:22%; background:#4a5066; }
.bx-lb-row[data-rank="1"] .bx-lb-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold); }
.bx-lb-row[data-rank="2"] .bx-lb-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); }
.bx-lb-row[data-rank="3"] .bx-lb-rank { background: linear-gradient(160deg,#f0b487,#c9763c); }
.bx-lb-row[data-rank="1"]::after { content:url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2018%22%3E%3Cpath%20d%3D%22M2%206.2l3.6%203.1L9.4%203l2.6%204.2L14.6%203l3.8%206.3L22%206.2l-1.7%209.3a1%201%200%200%201-1%20.8H4.7a1%201%200%200%201-1-.8L2%206.2Z%22%20fill%3D%22%23ffd23e%22%20stroke%3D%22rgba%280%2C0%2C0%2C.55%29%22%20stroke-width%3D%22.8%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%222%22%20cy%3D%226.2%22%20r%3D%221.4%22%20fill%3D%22%23ffd23e%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%222.4%22%20r%3D%221.4%22%20fill%3D%22%23ffd23e%22%2F%3E%3Ccircle%20cx%3D%2222%22%20cy%3D%226.2%22%20r%3D%221.4%22%20fill%3D%22%23ffd23e%22%2F%3E%3C%2Fsvg%3E'); position:absolute; left:64cqh; top:-24cqh; width:clamp(11px,40cqh,34px); height:auto; transform:rotate(-18deg); filter:drop-shadow(0 1px 2px rgba(0,0,0,.8)); z-index:2; }
/* Profilbild: eigener Größen-Container, damit der Fallback-Buchstabe (.bx-av::after)
   in cqmin mitwächst statt an einer geerbten Schriftgröße zu kleben. */
.bx-lb-pic { height:78%; aspect-ratio:1/1; width:auto; border-radius:50%; flex:none; container-type:size; box-shadow:0 0 0 2px rgba(255,255,255,.12); }
.bx-lb-pic::after { font-size:52cqmin; }
.bx-lb-name { flex:1; font-family: var(--bx-font-display); font-size:calc((clamp(10px,min(46cqh,5.5cqi),36px)) * var(--bx-fs, 1)); color:var(--bx-text,#fff); text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 2px 4px rgba(0,0,0,.5); }
.bx-lb-val { font-family: var(--bx-font-mono); font-weight:700; font-size:calc((clamp(10px,min(40cqh,4.6cqi),30px)) * var(--bx-fs, 1)); color: var(--bx-gold); text-shadow: 0 0 10px color-mix(in srgb, var(--bx-gold) 40%, transparent); }
.bx-lb-likes .bx-lb-title, .bx-lb-likes .bx-lb-val { color: var(--bx-pink); }
.bx-lb-likes .bx-lb-title { border-bottom-color: color-mix(in srgb, var(--bx-pink) 45%, transparent); }
.bx-lb-empty { display:flex; align-items:center; justify-content:center; height:100%; font-size:calc((clamp(11px,min(3cqi,11cqh),22px)) * var(--bx-fs, 1)); letter-spacing:.2em; color: var(--bx-muted); text-transform:uppercase; }
@keyframes bx-shimmer { 0%,55% { transform:translateX(0) skewX(-20deg); } 100% { transform:translateX(422%) skewX(-20deg); } }

/* — GLAS — */
.bx-st-glas { background: var(--bx-glass); border-radius: var(--bx-radius); box-shadow: var(--bx-shadow);
  -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3); }
.bx-st-glas::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 70%, white), transparent 42%, color-mix(in srgb, var(--bx-accent) 30%, transparent));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-st-glas .bx-lb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-gold) 16%, transparent), transparent 70%); }

/* — NEON — transparenter body, leuchtende outline, ohne panel-füllung (schont sicht) */
.bx-st-neon { background: rgba(8,9,14,.42); border-radius: 12px; border: 1.5px solid color-mix(in srgb, var(--bx-accent) 70%, transparent);
  box-shadow: 0 0 22px -6px var(--bx-accent), 0 0 30px -10px var(--bx-accent) inset; }
.bx-st-neon .bx-lb-name { text-shadow: 0 0 10px rgba(0,0,0,.9); }
.bx-st-neon .bx-lb-row[data-rank="1"] .bx-lb-name { color: var(--bx-gold); text-shadow: 0 0 12px var(--bx-gold); }

/* — BARS — jede zeile ist ein gefüllter balken (kein panel, minimale fläche) */
.bx-st-bars { background: none; box-shadow: none; padding: 6px 4px; }
.bx-st-bars .bx-lb-title { border: none; margin-bottom: 6px; }
.bx-st-bars .bx-lb-row { background: rgba(10,11,16,.55); overflow: hidden; box-shadow: 0 4px 12px -6px rgba(0,0,0,.6); }
.bx-st-bars .bx-lb-row::before { content:''; position:absolute; inset:0; width:var(--bar,0%); border-radius:12px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-accent) 55%, transparent), color-mix(in srgb, var(--bx-accent) 12%, transparent));
  transition: width 600ms cubic-bezier(.25,1,.35,1); z-index:0; }
.bx-st-bars .bx-lb-row > * { position: relative; z-index: 1; }
.bx-st-bars.bx-lb-likes .bx-lb-row::before { background: linear-gradient(90deg, color-mix(in srgb, var(--bx-pink) 55%, transparent), color-mix(in srgb, var(--bx-pink) 12%, transparent)); }

/* — ARCADE (TikFinity-Look) — keine box, große avatare in reihe, kronen, runde fette schrift */
.bx-st-arcade { background: none; box-shadow: none; padding: 2px; }
.bx-st-arcade::before { display: none; }
.bx-st-arcade .bx-lb-title { border: none; margin: 0 0 clamp(2px,3.4cqh,6px); text-align: center; font-size: calc((clamp(8px,9.5cqh,17px)) * var(--bx-fs, 1)); color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 3px 5px rgba(0,0,0,.5); }
.bx-st-arcade .bx-lb-title::after { display: none; }
.bx-st-arcade .bx-lb-list { display: flex; align-items: flex-start; justify-content: center; gap: 3%; flex-wrap: nowrap; }
/* Flex-Layouts haben height:auto → dürfen KEIN Größen-Container sein (würde
   in sich zusammenfallen); sie messen weiter am Widget (cqmin). */
.bx-st-arcade .bx-lb-row { position: static; height: auto; container-type: normal; flex-direction: column; align-items: center; gap: clamp(1px,2.2cqh,4px); padding: 0; transform: none !important; flex: 1 1 0; min-width: 0; max-width: 20%; }
.bx-st-arcade .bx-lb-rank { display: none; }
.bx-st-arcade .bx-lb-pic { width: clamp(15px,22cqmin,78px); height: clamp(15px,22cqmin,78px); box-shadow: 0 0 0 4px #5c9dff, 0 6px 14px rgba(0,0,0,.55); }
.bx-st-arcade .bx-lb-row[data-rank="1"] .bx-lb-pic { width: clamp(18px,26cqmin,92px); height: clamp(18px,26cqmin,92px); box-shadow: 0 0 0 5px #ffd23e, 0 0 26px -2px #ffd23e, 0 6px 14px rgba(0,0,0,.55); }
.bx-st-arcade .bx-lb-row[data-rank="2"] .bx-lb-pic { box-shadow: 0 0 0 4px #d7deec, 0 6px 14px rgba(0,0,0,.55); }
.bx-st-arcade .bx-lb-row[data-rank="3"] .bx-lb-pic { box-shadow: 0 0 0 4px #f0a35a, 0 6px 14px rgba(0,0,0,.55); }
.bx-st-arcade .bx-lb-row::after { content: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2226%22%20height%3D%2220%22%20viewBox%3D%220%200%2024%2018%22%3E%3Cpath%20d%3D%22M2%206.2l3.6%203.1L9.4%203l2.6%204.2L14.6%203l3.8%206.3L22%206.2l-1.7%209.3a1%201%200%200%201-1%20.8H4.7a1%201%200%200%201-1-.8L2%206.2Z%22%20fill%3D%22%23ffd23e%22%20stroke%3D%22rgba%280%2C0%2C0%2C.55%29%22%20stroke-width%3D%22.8%22%20stroke-linejoin%3D%22round%22%2F%3E%3Ccircle%20cx%3D%222%22%20cy%3D%226.2%22%20r%3D%221.4%22%20fill%3D%22%23ffd23e%22%2F%3E%3Ccircle%20cx%3D%2212%22%20cy%3D%222.4%22%20r%3D%221.4%22%20fill%3D%22%23ffd23e%22%2F%3E%3Ccircle%20cx%3D%2222%22%20cy%3D%226.2%22%20r%3D%221.4%22%20fill%3D%22%23ffd23e%22%2F%3E%3C%2Fsvg%3E'); position: static; order: -1; margin-bottom: -8px; z-index: 2;
  transform: rotate(-8deg); filter: drop-shadow(0 2px 3px rgba(0,0,0,.7));
  width: clamp(10px,14cqmin,26px); height: auto; font-size: calc((clamp(6px,20cqh,26px)) * var(--bx-fs, 1)); }
.bx-st-arcade .bx-lb-row[data-rank="1"]::after { font-size: clamp(8px,20cqh,36px); margin-bottom: clamp(-10px,-4cqh,-3px); transform: rotate(0); }
.bx-st-arcade .bx-lb-row[data-rank="4"]::after, .bx-st-arcade .bx-lb-row[data-rank="5"]::after { content: ''; }
.bx-st-arcade .bx-lb-name { flex: none; max-width: 100%; font-size: calc((clamp(7px,8.5cqmin,24px)) * var(--bx-fs, 1)); text-align: center; line-height: 1.05; color: #8dffa0;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-st-arcade .bx-lb-row[data-rank="1"] .bx-lb-name { font-size: calc((clamp(7px,8cqmin,20px)) * var(--bx-fs, 1)); color: #ffd23e; }
.bx-st-arcade .bx-lb-row[data-rank="2"] .bx-lb-name { color: #f0f4ff; }
.bx-st-arcade .bx-lb-row[data-rank="3"] .bx-lb-name { color: #ffb05a; }
.bx-st-arcade .bx-lb-val { font-family: var(--bx-font-display); font-size: calc((clamp(7px,8cqmin,24px)) * var(--bx-fs, 1)); color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-st-arcade .bx-lb-val .arr { color: #59f08a; -webkit-text-stroke: 2px #0a0b12; }
.bx-st-arcade.bx-lb-likes .bx-lb-val { color: #ff8ab0; }

/* ── Stil „Podium" — Siegertreppchen: Platz 2 · 1 · 3 stehen auf Sockeln,
   Avatare obenauf. Nur die Top 3 — das Denkmal für deine Supporter. */
.bx-st-podium { background: none; box-shadow: none; padding: 2px; }
.bx-st-podium::before { display: none; }
.bx-st-podium .bx-lb-title { border: none; margin: 0 0 4px; text-align: center; }
.bx-st-podium .bx-lb-list { display: flex; align-items: flex-end; justify-content: center; gap: 2%; }
.bx-st-podium .bx-lb-row { position: static; height: auto; container-type: normal; flex-direction: column; align-items: center; gap: 5px;
  padding: 0; transform: none !important; flex: 1 1 0; min-width: 0; max-width: 30%; background: none; }
.bx-st-podium .bx-lb-row[data-rank="1"] { order: 2; }
.bx-st-podium .bx-lb-row[data-rank="2"] { order: 1; }
.bx-st-podium .bx-lb-row[data-rank="3"] { order: 3; }
.bx-st-podium .bx-lb-row[data-rank="4"], .bx-st-podium .bx-lb-row[data-rank="5"],
.bx-st-podium .bx-lb-row[data-rank="6"], .bx-st-podium .bx-lb-row[data-rank="7"],
.bx-st-podium .bx-lb-row[data-rank="8"], .bx-st-podium .bx-lb-row[data-rank="9"],
.bx-st-podium .bx-lb-row[data-rank="10"] { display: none; }
.bx-st-podium .bx-lb-pic { width: clamp(34px,20cqmin,72px); height: clamp(34px,20cqmin,72px); }
.bx-st-podium .bx-lb-row[data-rank="1"] .bx-lb-pic { width: clamp(42px,25cqmin,88px); height: clamp(42px,25cqmin,88px);
  box-shadow: 0 0 0 4px var(--bx-gold), 0 0 24px -2px var(--bx-gold); }
.bx-st-podium .bx-lb-row[data-rank="2"] .bx-lb-pic { box-shadow: 0 0 0 3px #d7deec; }
.bx-st-podium .bx-lb-row[data-rank="3"] .bx-lb-pic { box-shadow: 0 0 0 3px #f0a35a; }
.bx-st-podium .bx-lb-name { flex: none; max-width: 100%; font-size: calc((clamp(9px,5.5cqmin,15px)) * var(--bx-fs, 1)); text-align: center; }
.bx-st-podium .bx-lb-val { font-size: calc((clamp(9px,5cqmin,14px)) * var(--bx-fs, 1)); }
/* Der Sockel: der Rang-Badge wird zum Podest-Block unter Name/Wert. */
.bx-st-podium .bx-lb-rank { order: 10; width: 100%; border-radius: 8px 8px 0 0; font-size: calc((clamp(15px,9cqmin,26px)) * var(--bx-fs, 1));
  height: auto; aspect-ratio: auto; box-shadow: inset 0 2px 0 rgba(255,255,255,.35), 0 8px 18px -8px rgba(0,0,0,.7); }
.bx-st-podium .bx-lb-row[data-rank="1"] .bx-lb-rank { padding: clamp(12px,9cqmin,30px) 0; }
.bx-st-podium .bx-lb-row[data-rank="2"] .bx-lb-rank { padding: clamp(7px,5.5cqmin,18px) 0; }
.bx-st-podium .bx-lb-row[data-rank="3"] .bx-lb-rank { padding: clamp(4px,3.5cqmin,12px) 0; }

/* ── Stil „Pills" — satte Akzent-Pillen mit dunkler Schrift (Familien-Look
   zu Gift-Feed „Pills"): knallig, sitzt auch auf hellem Video. */
.bx-st-pills { background: none; box-shadow: none; padding: 6px 4px; }
.bx-st-pills::before { display: none; }
.bx-st-pills .bx-lb-title { border: none; margin-bottom: 6px; }
.bx-st-pills .bx-lb-row { background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2));
  border-radius: 999px; box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--bx-accent) 75%, transparent); }
.bx-st-pills .bx-lb-row[data-rank="1"] { background: linear-gradient(120deg, #ffe88a, var(--bx-gold)); }
.bx-st-pills .bx-lb-name { color: #0c0d14; text-shadow: none; }
.bx-st-pills .bx-lb-val { color: #0c0d14; text-shadow: none; background: rgba(255,255,255,.72); border-radius: 999px; padding: 2px 10px; }
.bx-st-pills .bx-lb-rank { background: rgba(12,13,20,.85); color: #fff; border-radius: 50%; }
.bx-st-pills.bx-lb-likes .bx-lb-row { background: linear-gradient(120deg, var(--bx-pink), color-mix(in srgb, var(--bx-pink) 55%, #fff)); }

/* ── Stil „Royal" — Luxus: tiefdunkler Samt, doppelte Goldkante, Gold-Divider.
   Für edle Talk-/IRL-Overlays, die nach VIP-Lounge aussehen sollen. */
.bx-st-royal { background: linear-gradient(170deg, rgba(16,13,8,.94), rgba(24,18,10,.9));
  border-radius: 6px; border: 1px solid color-mix(in srgb, var(--bx-gold) 65%, transparent);
  outline: 1px solid color-mix(in srgb, var(--bx-gold) 25%, transparent); outline-offset: 3px;
  box-shadow: 0 18px 40px -18px rgba(0,0,0,.85), inset 0 0 60px rgba(0,0,0,.5); }
.bx-st-royal::before { display: none; }
.bx-st-royal .bx-lb-title { color: var(--bx-gold); border-bottom: 1px solid color-mix(in srgb, var(--bx-gold) 45%, transparent);
  letter-spacing: .44em; text-shadow: 0 0 14px color-mix(in srgb, var(--bx-gold) 40%, transparent); }
.bx-st-royal .bx-lb-row { border-radius: 4px; }
.bx-st-royal .bx-lb-row[data-rank="1"] { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-gold) 22%, transparent), transparent 75%); }
.bx-st-royal .bx-lb-rank { border-radius: 4px; background: #2a2418; color: var(--bx-gold); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bx-gold) 50%, transparent); }
.bx-st-royal .bx-lb-row[data-rank="1"] .bx-lb-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); color: #0a0b10; }
.bx-st-royal .bx-lb-pic { box-shadow: 0 0 0 2px color-mix(in srgb, var(--bx-gold) 55%, transparent); border-radius: 4px; }
.bx-st-royal .bx-lb-name { letter-spacing: .08em; }
.bx-st-royal .bx-lb-val { color: var(--bx-gold); }
.bx-st-royal.bx-lb-likes .bx-lb-title, .bx-st-royal.bx-lb-likes .bx-lb-val { color: var(--bx-gold); }

/* ── Stil „Treppe" — jede Platzierung als eingerückter Balken, wie eine nach
   rechts absteigende Treppe. Rang 1 oben in Gold, ganz breit; jede Stufe schmaler. */
.bx-st-treppe { background: none; box-shadow: none; padding: 4px 2px; }
.bx-st-treppe::before { display: none; }
.bx-st-treppe .bx-lb-title { border: none; margin-bottom: 6px; }
.bx-st-treppe .bx-lb-row { border-radius: 8px 12px 12px 8px;
  background: linear-gradient(100deg, color-mix(in srgb, var(--bx-accent) 82%, transparent), color-mix(in srgb, var(--bx-accent) 26%, transparent));
  box-shadow: 0 6px 16px -8px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.18); }
.bx-st-treppe .bx-lb-row[data-rank="1"] { background: linear-gradient(100deg, #ffe88a, var(--bx-gold)); }
.bx-st-treppe .bx-lb-name { color: #0c0d14; text-shadow: none; font-weight: 800; }
.bx-st-treppe .bx-lb-val { color: #0c0d14; text-shadow: none; background: rgba(255,255,255,.7); border-radius: 999px; padding: 2px 10px; }
.bx-st-treppe .bx-lb-rank { background: rgba(12,13,20,.82); color: #fff; }
.bx-st-treppe.bx-lb-likes .bx-lb-row { background: linear-gradient(100deg, color-mix(in srgb, var(--bx-pink) 82%, transparent), color-mix(in srgb, var(--bx-pink) 26%, transparent)); }
.bx-st-treppe.bx-lb-likes .bx-lb-row[data-rank="1"] { background: linear-gradient(100deg, #ffd0e8, var(--bx-pink)); }

/* ── Stil „Nummern" — reduziert & typografisch: riesige Rang-Ziffer, Name, Wert.
   Kein Panel, sitzt luftig auf jedem Hintergrund. */
.bx-st-nummern { background: none; box-shadow: none; }
.bx-st-nummern::before { display: none; }
.bx-st-nummern .bx-lb-title { border: none; }
.bx-st-nummern .bx-lb-row { background: none; box-shadow: none; gap: 14px; }
/* Rang-Ziffer statt Badge: Medaillen-Hintergründe (höhere Spezifität) hier
   ausdrücklich abschalten, sonst klebt ein Goldklotz hinter der Ziffer. */
.bx-st-nummern .bx-lb-row .bx-lb-rank { background: none !important; box-shadow: none !important; width: auto; height: auto; aspect-ratio: auto; min-width: 1.2em; line-height: 1;
  color: color-mix(in srgb, var(--bx-text, #fff) 40%, transparent);
  font-family: var(--bx-font-num, var(--bx-font-display)); font-size: calc((clamp(16px, 66cqh, 52px)) * var(--bx-fs, 1)); font-weight: 900; }
.bx-st-nummern .bx-lb-row[data-rank="1"] .bx-lb-rank { color: var(--bx-gold); }
.bx-st-nummern .bx-lb-name { font-weight: 800; }
.bx-st-nummern .bx-lb-val { font-family: var(--bx-font-num, var(--bx-font-display)); font-weight: 800; }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur — außer bei den Stilen mit dunkler Schrift auf heller Pille.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-lb-title { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-lb:not(.bx-st-pills):not(.bx-st-treppe) .bx-lb-name { -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-lb:not(.bx-st-pills):not(.bx-st-treppe) .bx-lb-val { -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium, widget-base.css) ─────────────────────────
   Der Auslöser sitzt auf der ZEILE: sie bekommt bx-hit, wenn dieser Zuschauer
   neu in der Liste steht oder sich verbessert hat.

   KOLLISION, absichtlich entschärft: die Basis-Choreografie hebt das Element
   über die Einzel-Eigenschaft „scale“ an. Die Zeilen sind absolut positioniert
   und werden per „transform: translateY(…)“ an ihren Platz geschoben — und
   „scale“ wird VOR „transform“ verrechnet, skaliert die Verschiebung also mit.
   Eine Zeile bei 200 px wäre beim Anheben um gut 10 px nach unten gesprungen.
   Darum hier nur Ring (box-shadow) und das Aufblitzen des Profilbildes aus der
   Basis — beide bewegen die Zeile nicht. */
.bx-premium .bx-lb-row.bx-hit { animation: bx-premium-ring 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
/* Arcade und Podium stellen jede Person als freistehende SPALTE dar — dort
   zeichnete der Rechteck-Ring der Basis einen Rahmen um eine Karte, die es gar
   nicht gibt (im Bild geprüft). Diese beiden Stile bekommen deshalb einen
   Schein über „filter", der die tatsächliche Silhouette aus Profilbild, Name
   und Wert umfasst — plus das Anheben, das hier ohne Ortswechsel funktioniert,
   weil die Spalten per Flexbox und nicht per transform sitzen. */
.bx-premium .bx-st-arcade .bx-lb-row.bx-hit, .bx-premium .bx-st-podium .bx-lb-row.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(0.2, 1.5, 0.35, 1),
    bx-lb-hit-schein 900ms cubic-bezier(0.2, 0.9, 0.3, 1); }
@keyframes bx-lb-hit-schein {
  0% { filter: drop-shadow(0 0 0 color-mix(in srgb, var(--bx-gold) 95%, white)); }
  22% { filter: drop-shadow(0 0 .5em color-mix(in srgb, var(--bx-gold) 90%, white)); }
  100% { filter: drop-shadow(0 0 0 transparent); }
}
/* Mehr Tiefe: die Zahl ist die Nachricht — im Premium-Fall trägt sie einen
   satteren Schein, ohne dass sich an Maßen etwas ändert. */
.bx-premium .bx-lb-val { text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-gold) 55%, transparent), 0 .06em .12em rgba(0,0,0,.75); }
.bx-premium .bx-lb-likes .bx-lb-val { text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-pink) 55%, transparent), 0 .06em .12em rgba(0,0,0,.75); }
/* Pills/Treppe tragen dunkle Schrift auf heller Fläche — dort wäre ein Glow Matsch. */
.bx-premium .bx-st-pills .bx-lb-val, .bx-premium .bx-st-treppe .bx-lb-val { text-shadow: none; }
`;
/** Text nur setzen, wenn er sich geaendert hat.
 *
 *  `textContent = x` ersetzt laut Spezifikation IMMER die Kindknoten — auch
 *  wenn derselbe Text schon dasteht. Bei vier Zustellungen pro Sekunde ist der
 *  Vergleich also billiger als das blinde Schreiben, und das Bild bleibt
 *  identisch. */
function setzeText(el, wert) {
  if (el && el.textContent !== wert) el.textContent = wert;
}

function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const STYLES = new Set(['glas', 'neon', 'bars', 'arcade', 'podium', 'pills', 'royal', 'treppe', 'nummern']);

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }

/* ── Avatar-Fallback (bewusst in jedem Widget dupliziert — die Widgets werden
   einzeln geladen und haben kein gemeinsames JS-Modul) ────────────────────
   Ohne Bild (oder wenn das Laden scheitert) steht der Anfangsbuchstabe auf
   einem aus dem Namen abgeleiteten Farbton statt eines schwarzen Kreises. */
function avHue(name) { const s = String(name || ''); let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return h % 360; }
function avSet(el, name, url) {
  if (!el) return;
  const s = String(name || '').trim();
  el.classList.add('bx-av');
  el.dataset.initial = (s[0] || '?').toUpperCase();
  el.style.setProperty('--bx-av-h', String(avHue(s)));
  if (el.dataset.avUrl === (url || '')) return; // schon behandelt
  el.dataset.avUrl = url || '';
  el.classList.remove('bx-av-img');
  el.style.backgroundImage = '';
  if (!url) return;
  // Erst vorladen: kaputte/geblockte CDN-URLs lassen den Buchstaben stehen.
  const img = new Image();
  img.onload = () => { if (el.dataset.avUrl === url) { el.style.backgroundImage = `url("${cssUrl(url)}")`; el.classList.add('bx-av-img'); } };
  img.src = url;
}
/** Demo-Daten für die Editor-Vorschau — sonst steht dort nur „Noch keine Gifts". */
const DEMO = {
  topGifters: [{ id: 'd1', nickname: 'BigBen', coins: 8400 }, { id: 'd2', nickname: 'Mia', coins: 5200 }, { id: 'd3', nickname: 'LeonGG', coins: 3100 }, { id: 'd4', nickname: 'Nova', coins: 1800 }, { id: 'd5', nickname: 'Sara_99', coins: 940 }, { id: 'd6', nickname: 'ExE', coins: 610 }, { id: 'd7', nickname: 'Kaan', coins: 320 }, { id: 'd8', nickname: 'Pia', coins: 150 }, { id: 'd9', nickname: 'Tom', coins: 90 }, { id: 'd10', nickname: 'Lu', coins: 40 }],
  topLikers: [{ id: 'd1', nickname: 'Mia', likes: 3200 }, { id: 'd2', nickname: 'Nova', likes: 1450 }, { id: 'd3', nickname: 'LeonGG', likes: 900 }, { id: 'd4', nickname: 'BigBen', likes: 420 }, { id: 'd5', nickname: 'Sara_99', likes: 260 }, { id: 'd6', nickname: 'ExE', likes: 180 }, { id: 'd7', nickname: 'Kaan', likes: 95 }, { id: 'd8', nickname: 'Pia', likes: 60 }, { id: 'd9', nickname: 'Tom', likes: 30 }, { id: 'd10', nickname: 'Lu', likes: 12 }],
};
export default class Leaderboard {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.source = props.source === 'likes' ? 'likes' : 'gifts';
    this.style = STYLES.has(props.style) ? props.style : 'glas';
    this.limit = Math.min(10, Math.max(1, Number(props.limit ?? 5)));
    this.showPic = props.showPic !== false;
    this.el = document.createElement('div');
    this.el.className = `bx-lb bx-st-${this.style}${this.source === 'likes' ? ' bx-lb-likes' : ''}`;
    const empty = this.source === 'likes' ? 'Noch keine Likes' : 'Noch keine Gifts';
    this.el.innerHTML = `<div class="bx-lb-title"></div><div class="bx-lb-list"><div class="bx-lb-empty">${empty}</div></div>`;
    this.el.querySelector('.bx-lb-title').textContent = props.title || (this.source === 'likes' ? 'Top Likes' : 'Top Gifter');
    root.appendChild(this.el);
    this.rows = new Map();
    // Letzter bekannter Platz je Zuschauer — daraus leitet sich ab, ob jemand
    // NEU dazugekommen ist oder sich verbessert hat (Führungswechsel).
    this.ranks = new Map();
    this.timers = new Set();
    if (ctx?.preview) this.onStats(DEMO);
  }
  /** Premium-Auslöser: markiert kurz den Moment, in dem etwas passiert.
   *  Die Klasse wirkt NUR mit aktiver Premium-Ebene (widget-base.css) — sie
   *  wird hier trotzdem immer gesetzt, damit die Widget-Logik einfach bleibt.
   *  Bei schnellen Folgen (Combo) muss der Effekt neu anspringen: Klasse weg,
   *  Reflow erzwingen, Klasse neu. */
  hit(el) {
    if (!el) return;
    // Ohne Premium-Ebene gibt es fuer .bx-hit KEINE einzige CSS-Regel (alle 81
    // haengen an .bx-premium) — der Effekt waere also unsichtbar. Das
    // `void el.offsetWidth` unten erzwingt aber trotzdem ein vollstaendiges
    // Layout des Dokuments, bei JEDEM Ereignis und in JEDEM Widget. Bei 17
    // Widgets im Layout sind das 17 erzwungene Layouts pro Geschenk, fuer
    // nichts. Deshalb hier raus, bevor es teuer wird.
    // Bewusst bei jedem Aufruf pruefen statt einmal zu merken: Die Klasse
    // haengt an der Ebene und kann sich im Editor jederzeit aendern.
    if (!el.closest('.bx-premium')) return;
    el.classList.remove('bx-hit');
    void el.offsetWidth;
    el.classList.add('bx-hit');
    const t = setTimeout(() => { this.timers.delete(t); el.classList.remove('bx-hit'); }, 900);
    this.timers.add(t);
  }
  onStats(stats) {
    const src = this.source === 'likes' ? stats?.topLikers : stats?.topGifters;
    const items = (src ?? []).slice(0, this.limit);
    const list = this.el.querySelector('.bx-lb-list');
    const empty = list.querySelector('.bx-lb-empty');
    if (empty && items.length > 0) empty.remove();
    const maxVal = Math.max(1, ...items.map((g) => (this.source === 'likes' ? g.likes : g.coins)));
    // Zeilenhöhe aus der tatsächlichen Box ableiten (statt fix 48px) → beim
    // Verkleinern werden die Zeilen enger statt unten abgeschnitten.
    // arcade + podium layouten per Flexbox (height:auto) — Fixhöhe würde die
    // Podest-Spalten abschneiden.
    const flexStyle = this.style === 'arcade' || this.style === 'podium';
    const rowH = !flexStyle
      ? Math.max(22, (list.clientHeight || this.limit * 48) / this.limit)
      : 0;
    const seen = new Set();
    items.forEach((g, i) => {
      seen.add(g.id);
      let row = this.rows.get(g.id);
      let fresh = false;
      if (!row) {
        fresh = true;
        row = document.createElement('div'); row.className = 'bx-lb-row'; row.style.opacity = '0';
        row.innerHTML = `<div class="bx-lb-rank"></div>${this.showPic ? '<div class="bx-lb-pic"></div>' : ''}<div class="bx-lb-name"></div><div class="bx-lb-val"></div>`;
        list.appendChild(row); this.rows.set(g.id, row);
        requestAnimationFrame(() => { row.style.opacity = '1'; });
      }
      const val = this.source === 'likes' ? g.likes : g.coins;
      // Bemerkenswerter Moment: neu in der Liste oder nach oben geklettert.
      const prevRank = this.ranks.get(g.id);
      if (fresh || (prevRank != null && i + 1 < prevRank)) this.hit(row);
      this.ranks.set(g.id, i + 1);
      // NUR schreiben, wenn sich wirklich etwas geaendert hat.
      //
      // Die Stats kommen viermal pro Sekunde. Vorher wurde bei JEDER
      // Zustellung jede Zeile neu beschrieben — auch wenn seit dem letzten Mal
      // niemand ein Geschenk geschickt hat. Ein `textContent`-Setter wirft laut
      // Spezifikation IMMER den Textknoten weg und legt einen neuen an, und
      // jedes `style`-Schreiben macht die Zeile fuer den Browser wieder
      // schmutzig. Bei 5 Zeilen sind das 20 nutzlose Schreibvorgaenge pro
      // Sekunde, und zwar dauerhaft — auch im ruhigsten Moment des Streams.
      //
      // Der Vergleich kostet fast nichts (Zeichenkette gegen Zeichenkette) und
      // aendert am Ergebnis GAR NICHTS: Steht derselbe Wert schon da, sieht man
      // keinen Unterschied — nur der Browser hat weniger zu tun.
      const rang = String(i + 1);
      if (row.dataset.rank !== rang) row.dataset.rank = rang;
      if (!flexStyle) {
        const h = `${rowH}px`; const t = `translateY(${i * rowH}px)`;
        if (row.style.height !== h) row.style.height = h;
        if (row.style.transform !== t) row.style.transform = t;
      }
      if (this.style === 'bars') row.style.setProperty('--bar', `${Math.max(8, (val / maxVal) * 100)}%`);
      // Treppe: jede Stufe weiter eingerückt + schmaler → absteigende Treppe.
      if (this.style === 'treppe') {
        const ind = Math.min(54, i * 9); // % Einrückung pro Platz (gedeckelt)
        row.style.left = `${ind}%`; row.style.right = 'auto'; row.style.width = `${100 - ind}%`;
      }
      setzeText(row.querySelector('.bx-lb-rank'), rang);
      setzeText(row.querySelector('.bx-lb-name'), g.nickname);
      const valEl = row.querySelector('.bx-lb-val');
      if (this.style === 'arcade') {
        valEl.innerHTML = `<span class="arr">▲</span> ${fmt(val)}${this.source === 'likes' ? ' ❤' : ''}`;
      } else {
        setzeText(valEl, this.source === 'likes' ? `${fmt(val)} ❤` : fmt(val));
      }
      avSet(row.querySelector('.bx-lb-pic'), g.nickname, g.profilePic);
    });
    for (const [id, row] of this.rows) { if (!seen.has(id)) { row.remove(); this.rows.delete(id); this.ranks.delete(id); } }
    // Liste wieder leer (z.B. Session-Reset ohne Rebuild) → Platzhalter zurückholen,
    // sonst bleibt ein komplett leeres Panel stehen.
    if (items.length === 0 && !list.querySelector('.bx-lb-empty')) {
      const ph = document.createElement('div');
      ph.className = 'bx-lb-empty';
      ph.textContent = this.source === 'likes' ? 'Noch keine Likes' : 'Noch keine Gifts';
      list.appendChild(ph);
    }
    if (this.style === 'arcade') {
      // DOM-reihenfolge = rang-reihenfolge (flexbox legt nebeneinander)
      items.forEach((g) => { const r = this.rows.get(g.id); if (r) list.appendChild(r); });
    }
  }
  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
