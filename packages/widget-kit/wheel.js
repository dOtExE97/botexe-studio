// wheel.js — Profi-Glücksrad: Rad auf Standfuß, klickender Zeiger,
// Anlauf-Animation (kurz zurück → beschleunigen → smooth ausrollen),
// Gewinn-Popup. Blendet sich beim Spin automatisch ein und nach dem
// Ergebnis wieder aus (props.autoShow). props: { segments, accent, spinMs,
//   autoShow?, title? }. rAF nur während der Show (TTLS-schonend).
import { orderedGiftEntries } from './gift-rules.js';

const STYLE_ID = 'bx-wh-style';
const CSS = `
/* container-type: size → alle Schriftgrößen unten dürfen mit cq* rechnen und
   wachsen so mit der Fenstergröße mit (statt in festen px zu kleben). */
.bx-wh { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  container-type: size;
  font-family: var(--bx-font-display); transition: opacity .45s ease, transform .45s cubic-bezier(.2,1.3,.3,1); }
.bx-wh.hidden { opacity: 0; transform: scale(.8) translateY(20px); pointer-events: none; }
.bx-wh canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.bx-wh-title { position: absolute; left: 0; right: 0; top: 1%; text-align: center; font-size: calc(clamp(14px, min(5cqi, 5cqh), 44px) * var(--bx-fs, 1));
  letter-spacing: .08em; text-transform: uppercase; color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 3px 5px rgba(0,0,0,.5); }
.bx-wh-result { position: absolute; left: 50%; top: 44%; transform: translate(-50%,-50%) scale(.5); opacity: 0;
  padding: min(3.4cqi, 3.4cqh) min(7cqi, 7cqh); border-radius: 18px; text-align: center; pointer-events: none; z-index: 4;
  background: var(--bx-glass); box-shadow: var(--bx-shadow), 0 0 60px -10px var(--bx-accent);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); }
.bx-wh-result.show { animation: bx-wh-pop 3s cubic-bezier(.2,1.5,.3,1) forwards; }
.bx-wh-result .k { font-size: calc(clamp(10px, min(3cqi, 3cqh), 26px) * var(--bx-fs, 1)); letter-spacing: .34em; color: var(--bx-gold); text-transform: uppercase; }
.bx-wh-result .v { font-size: calc(clamp(20px, min(7.2cqi, 7.2cqh), 66px) * var(--bx-fs, 1)); color: #fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; margin-top: 5px; }
.bx-wh-result .w { font-size: calc(clamp(11px, min(3.2cqi, 3.2cqh), 30px) * var(--bx-fs, 1)); color: var(--bx-teal); margin-top: 4px; }
@keyframes bx-wh-pop { 0% { opacity: 0; transform: translate(-50%,-50%) scale(.45); } 12% { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }
  26% { transform: translate(-50%,-50%) scale(1); } 82% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%,-50%) scale(.92); } }
/* Trigger-Banner (TikFinity-Style): zeigt beim Dreh-Start, wer ausgelöst hat. */
.bx-wh-trigger { position: absolute; left: 0; right: 0; top: 7.5%; text-align: center; pointer-events: none; z-index: 5;
  font-family: var(--bx-font-display); opacity: 0; }
.bx-wh-trigger.show { animation: bx-wh-trig 2.6s ease forwards; }
@keyframes bx-wh-trig { 0% { opacity: 0; transform: translateY(-12px) scale(.9); } 12% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; } }
.bx-wh-trigger .who { display: inline-block; padding: 1.5cqh 3.4cqh; border-radius: 999px; font-size: calc(clamp(12px, min(3.6cqi, 3.6cqh), 32px) * var(--bx-fs, 1)); color: #fff;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  box-shadow: 0 0 24px -6px var(--bx-accent); -webkit-text-stroke: 0; }
.bx-wh-trigger .who b { color: var(--bx-gold); }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Das Rad selbst ist Canvas und bleibt unberührt. Frei auf dem Video stehen
   danach das Gewinn-Fenster und das „wer hat gedreht"-Band — beide bezogen ihre
   Fläche aus --bx-glass und waren dann heller Text auf hellem Video. */
.bx-frameless .bx-wh-result, .bx-frameless .bx-wh-trigger .who { box-shadow: none; }
.bx-frameless .bx-wh-result .k, .bx-frameless .bx-wh-result .v,
.bx-frameless .bx-wh-result .w, .bx-frameless .bx-wh-trigger .who {
  -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.6); }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   Das Rad ist ein Canvas — CSS erreicht es nicht. Der Auslöser sitzt deshalb
   auf dem GEWINNTEXT im Ergebnis-Fenster: er nennt genau das Feld, auf dem das
   Rad stehengeblieben ist. Die Kapsel selbst bleibt unangetastet, ihre
   .show-Animation (bx-wh-pop, forwards) darf nicht überschrieben werden — sie
   ist es, die das Fenster überhaupt sichtbar macht. */
.bx-premium .bx-wh-result .v.bx-hit { --bx-accent: var(--bx-gold, #ffd23e); }
`;
const COLORS = ['#ff5436','#ffd23e','#28e0c4','#5c9dff','#c45cff','#ff5e8a','#7dff8a','#ff8a3d'];

// Reiner Helper (kein DOM) — die Radfelder aus den Trigger-Regeln ableiten.
// Setzt auf itemsFromRules (gift-menu.js) auf: dort steckt schon die Logik,
// welche Regel einen sprechenden Text liefert.
export function segmentsFromRules(rules) {
  return orderedGiftEntries(rules).map((it) => it.text);
}
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

// Premium-Auslöser: Klasse `bx-hit` setzen und nach 900 ms wieder wegnehmen.
// Was daraus wird (Anheben, Ring, Aufblitzen), entscheidet die Premium-Ebene in
// widget-base.css — ohne den Haken „Premium-Effekte" passiert nichts. Bewusst
// lokal dupliziert: die Widgets haben kein gemeinsames JS-Modul.
function bxHit(el, timers) {
  if (!el) return;
  el.classList.remove('bx-hit');
  void el.offsetWidth; // Reflow → bei schnellen Folgen springt der Effekt neu an
  el.classList.add('bx-hit');
  const t = setTimeout(() => { timers.delete(t); el.classList.remove('bx-hit'); }, 900);
  timers.add(t);
}

// Anti-Throttle: der TTLS-Browser drosselt rAF auf ~1/s — Fallback-Timer springt
// ein, wenn rAF nicht feuert. (War zuvor undefiniert → Spin warf ReferenceError.)
function scheduleFrame(cb) {
  const raf = requestAnimationFrame(cb);
  const timer = setTimeout(() => { cancelAnimationFrame(raf); cb(performance.now()); }, 55);
  return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
}

export default class Wheel {
  constructor(root, props, ctx) {
    ensureStyle();
    // Achtung Namenskollision: `this.ctx` ist unten schon der Canvas-2D-Context
    // (this.ctx = this.canvas.getContext('2d')) — der App-Kontext (baseUrl,
    // token, preview) heißt hier deshalb bewusst `this.host`.
    this.host = ctx || {};
    this.accent = props.accent || '#ff5436';
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.segments = String(props.segments || '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech')
      .split('|').map((x) => x.trim()).filter(Boolean);
    if (this.segments.length < 2) this.segments = ['Gewinn', 'Niete'];
    // Quelle der Radfelder: manuelle Liste (Standard) oder automatisch aus den
    // Geschenk-Triggern des Nutzers (Muster: gift-menu.js loadRules).
    this.source = props.source === 'trigger' ? 'trigger' : 'liste';
    this.segmentRules = []; // Index = Segment-Index — Grundlage für spätere Aufgaben (Auto-Auslösen)
    // Default 5000 MUSS mit WIDGET_TIMING_DEFAULTS.WHEEL_SPIN_MS
    // (apps/desktop/src/shared/constants.ts) übereinstimmen — reines Browser-
    // JS kann diese TS-Konstante nicht importieren, darum hier lokal
    // kopiert; wheel-gift.ts/widget-sounds.ts/widget-types.ts lesen sie von
    // dort. Ändert sich der Wert dort, MUSS er hier von Hand mitgezogen
    // werden (sonst driftet Client-Optik vom Server-Timing).
    this.spinMs = Math.max(2000, Number(props.spinMs ?? 5000));
    this.autoShow = props.autoShow !== false;
    this.showTrigger = props.showTrigger !== false; // Banner „wer hat gedreht" (TikFinity-Style)
    this.title = props.title || 'Glücksrad';
    // Rad-Look: klassisch bunt · Casino (Gold) · Neon-Arcade (freistehend, Glow).
    this.style = ['classic', 'casino', 'neon'].includes(props.style) ? props.style : 'classic';
    this.angle = 0; this.spinning = false; this.pointerDefl = 0; this.lastAngle = 0;
    this.timers = new Set(); // Premium-Auslöser → bei destroy clearen
    this.el = document.createElement('div');
    // Editor-Vorschau: nie versteckt starten — sonst ist die Box im Editor leer
    // und man kann Größe/Position des Rades nicht beurteilen.
    this.preview = !!this.host.preview;
    this.el.className = 'bx-wh' + (this.autoShow && !this.preview ? ' hidden' : '');
    this.el.innerHTML = `<canvas></canvas><div class="bx-wh-title"></div><div class="bx-wh-trigger"><span class="who"></span></div><div class="bx-wh-result"><div class="k">Gewinn</div><div class="v"></div><div class="w"></div></div>`;
    this.el.querySelector('.bx-wh-title').textContent = this.title;
    root.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.resize = this.resize.bind(this); this.frame = this.frame.bind(this);
    this.observer = new ResizeObserver(this.resize); this.observer.observe(root);
    this.resize();
    // …und im Editor von selbst drehen, damit man Anlauf, Zeiger und Gewinn-Popup sieht.
    if (this.preview) {
      const demo = () => this.onAction({ kind: 'spin_wheel', params: { name: 'Mia', gift: 'Rose' } });
      this.demoT = setTimeout(demo, 600);
      this.demoInterval = setInterval(demo, Math.max(9000, this.spinMs + 5000));
    }
    // Quelle „trigger": Radfelder aus den Geschenk-Triggern nachladen. Nicht in
    // der Editor-Vorschau (dort gibt es keinen Server, der die Route bedient).
    if (this.source === 'trigger' && this.host.baseUrl && !this.host.preview) void this.loadRules();
  }

  /** Radfelder aus den Trigger-Regeln des Nutzers ableiten (Quelle „trigger").
   *  Schlägt das fehl (Route noch nicht da, Netzwerkfehler), bleibt die
   *  manuelle Liste stehen — Muster: gift-menu.js loadRules(). */
  async loadRules() {
    try {
      const res = await fetch(`${this.host.baseUrl}/trigger-rules?token=${this.host.token}`);
      if (!res.ok) return;
      const data = await res.json();
      const rules = Array.isArray(data) ? data : (data && Array.isArray(data.rules) ? data.rules : []);
      // orderedGiftEntries() (gift-rules.js) — segmentRules und segments
      // müssen aus DERSELBEN gefilterten, geordneten Liste kommen wie
      // orderedGiftKeys() (Server) und gift-menu.js'/slot-machine.js'
      // loadRules(); ein eigener/vergessener Filter hier ließe Index i bei
      // segments auf ein anderes Gift zeigen als bei segmentRules (Rad-
      // Bindung Task 1 hatte genau das: segmentRules unfiltered, segments
      // schon gefiltert).
      const items = orderedGiftEntries(rules);
      if (!items.length) return;
      this.segmentRules = items;
      this.segments = items.map((it) => it.text);
      this.draw();
    } catch { /* Route (noch) nicht da — manuelle Liste bleibt */ }
  }
  resize() {
    const r = this.el.getBoundingClientRect(); if (r.width===0) return;
    const dpr = Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=r.width*dpr; this.canvas.height=r.height*dpr; this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.w=r.width; this.h=r.height;
    // Textgrößen-Einstellung: die Segment-Beschriftung liegt im Canvas, dort
    // greift kein CSS. Deshalb den Faktor --bx-fs von der Box abholen und in
    // draw() in die Schriftgröße rechnen (sonst wäre das Rad das einzige
    // Element des Widgets, das der Regler nicht erreicht).
    this.fs = Number(getComputedStyle(this.el).getPropertyValue('--bx-fs')) || 1;
    // Rad oben, Standfuß darunter — Neon hat keinen Fuß → mittig + größer.
    if (this.style === 'neon') {
      this.radius = Math.min(r.width*0.42, r.height*0.4);
      this.cx = r.width/2; this.cy = r.height*0.52;
    } else {
      this.radius = Math.min(r.width*0.42, r.height*0.34);
      this.cx = r.width/2; this.cy = this.radius*1.18 + r.height*0.06;
    }
    this.draw();
  }
  onAction(action) {
    if (action.kind !== 'spin_wheel' || this.spinning) return;
    const n = this.segments.length, seg = (Math.PI*2)/n;
    // Gewinner: fester segmentIndex > Server-roll (gleich auf allen Quellen) >
    // lokaler Zufall (nur Fallback, z.B. Editor-Vorschau ohne Server-roll).
    const winner = typeof action.segmentIndex === 'number' ? ((action.segmentIndex%n)+n)%n
      : typeof action.roll === 'number' ? Math.floor(Math.min(0.999999, Math.max(0, action.roll)) * n)
      : Math.floor(Math.random()*n);
    const targetMid = winner*seg + seg/2;
    const base = (-Math.PI/2) - targetMid;
    const turns = 6 + Math.floor(Math.random()*3);
    this.fromAngle = this.angle % (Math.PI*2);
    this.toAngle = base + turns*Math.PI*2;
    this.winner = winner; this.winnerName = action.params && action.params.name ? String(action.params.name) : '';
    this.startT = 0; this.spinning = true;
    const res = this.el.querySelector('.bx-wh-result'); res.classList.remove('show');
    if (this.autoShow) this.el.classList.remove('hidden'); // einblenden
    // Trigger-Banner: zeigt, wer (womit) gedreht hat.
    if (this.showTrigger && this.winnerName) {
      const trig = this.el.querySelector('.bx-wh-trigger');
      const gift = action.params && action.params.gift ? ` mit ${escapeHtml(String(action.params.gift))}` : '';
      trig.querySelector('.who').innerHTML = `🎡 <b>${escapeHtml(this.winnerName)}</b> dreht${gift}!`;
      trig.classList.remove('show'); void trig.offsetWidth; trig.classList.add('show');
    }
    this.cancelFrame = scheduleFrame(this.frame);
  }
  frame(now) {
    now = now || performance.now();
    if (!this.startT) { this.startT = now; this.lastAngle = this.fromAngle; }
    // max(0,…): rAF und der Fallback-Timer aus scheduleFrame liefern Zeitstempel
    // aus verschiedenen Quellen — ohne die Schranke könnte t negativ werden und
    // das Rad einen Sprung rückwärts machen.
    const t = Math.max(0, Math.min(1, (now-this.startT)/this.spinMs));
    // Anlauf: erst kurz zurück (anticipation), dann beschleunigen, dann ease-out
    let p;
    if (t < 0.12) { p = -0.04 * Math.sin((t/0.12)*Math.PI); } // wind-up rückwärts
    else { const tt = (t-0.12)/0.88; p = 1 - Math.pow(1-tt, 3); } // ease-out cubic
    this.angle = this.fromAngle + (this.toAngle-this.fromAngle)*p;
    // Zeiger-Klick: lenkt aus, wenn eine Segment-Grenze unter ihm durchläuft
    const n = this.segments.length, seg = (Math.PI*2)/n;
    const speed = Math.abs(this.angle - this.lastAngle); this.lastAngle = this.angle;
    const phase = ((-Math.PI/2 - this.angle) % seg + seg) % seg / seg; // 0..1 innerhalb segment
    const nearEdge = Math.min(phase, 1-phase);
    this.pointerDefl = nearEdge < 0.12 ? Math.min(0.5, speed*6) * (phase < 0.5 ? -1 : 1) : this.pointerDefl*0.7;
    this.draw();
    if (this.cancelFrame) this.cancelFrame();
    if (t < 1) this.cancelFrame = scheduleFrame(this.frame);
    else { this.spinning = false; this.pointerDefl = 0; this.draw(); this.showResult(); }
  }
  showResult() {
    const res = this.el.querySelector('.bx-wh-result');
    res.querySelector('.v').textContent = this.segments[this.winner];
    res.querySelector('.w').textContent = this.winnerName ? `🎉 ${this.winnerName}` : '';
    res.classList.remove('show'); void res.offsetWidth; res.classList.add('show');
    // Das Rad steht — der Moment des Widgets. Der Auslöser sitzt auf dem
    // Gewinntext (Canvas erreicht CSS nicht, siehe Kommentar im Stylesheet).
    bxHit(res.querySelector('.v'), this.timers);
    // nach dem ergebnis wieder ausblenden
    clearTimeout(this.hideT);
    if (this.autoShow && !this.preview) this.hideT = setTimeout(() => this.el.classList.add('hidden'), 3200);
  }
  draw() {
    const ctx = this.ctx, n = this.segments.length, seg = (Math.PI*2)/n, R = this.radius;
    ctx.clearRect(0,0,this.w,this.h);
    const casino = this.style === 'casino', neon = this.style === 'neon';
    // ── Standfuß (hinter dem Rad) — Neon: freistehend, kein Fuß ──
    if (!neon) {
    const baseY = this.cy + R + (this.h - (this.cy+R))*0.5;
    const footW = R*1.1, footH = (this.h-(this.cy+R))*0.34;
    const ng = ctx.createLinearGradient(0, this.cy, 0, baseY+footH);
    if (casino) { ng.addColorStop(0,'#8a6a20'); ng.addColorStop(1,'#4a3810'); }
    else { ng.addColorStop(0,'#3a4055'); ng.addColorStop(1,'#1a1d28'); }
    ctx.fillStyle = ng;
    // post
    ctx.beginPath(); ctx.moveTo(this.cx-R*0.1, this.cy+R*0.5); ctx.lineTo(this.cx-R*0.16, baseY);
    ctx.lineTo(this.cx+R*0.16, baseY); ctx.lineTo(this.cx+R*0.1, this.cy+R*0.5); ctx.closePath(); ctx.fill();
    // base (trapez)
    ctx.beginPath(); ctx.moveTo(this.cx-footW/2, baseY+footH); ctx.lineTo(this.cx-footW*0.32, baseY);
    ctx.lineTo(this.cx+footW*0.32, baseY); ctx.lineTo(this.cx+footW/2, baseY+footH); ctx.closePath();
    ctx.fill(); ctx.strokeStyle='rgba(255,255,255,.12)'; ctx.lineWidth=2; ctx.stroke();
    }
    // ── Rad ──
    ctx.save(); ctx.translate(this.cx, this.cy); ctx.rotate(this.angle);
    for (let i=0;i<n;i++) {
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,R, i*seg, (i+1)*seg); ctx.closePath();
      if (neon) { ctx.fillStyle = i % 2 === 0 ? 'rgba(14,16,26,.92)' : 'rgba(24,26,40,.92)'; }
      else if (casino) { ctx.fillStyle = i % 2 === 0 ? '#a3131f' : '#14161f'; }
      else { ctx.fillStyle = COLORS[i%COLORS.length]; }
      ctx.fill();
      if (neon) { ctx.strokeStyle = this.accent; ctx.lineWidth = 2.5; ctx.shadowColor = this.accent; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0; }
      else if (casino) { ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2.5; ctx.stroke(); }
      else { ctx.strokeStyle='rgba(10,11,18,.55)'; ctx.lineWidth=2; ctx.stroke(); }
      // Segment-Beschriftung. Der Text läuft vom Rand zur Nabe; auf der linken
      // Radhälfte (Segmentwinkel 90°–270°) stünde er dadurch auf dem Kopf. Dort
      // das Label um 180° nachdrehen und die Ausrichtung spiegeln (rechtsbündig
      // am Rand → linksbündig am gespiegelten Rand), dann liest es sich überall.
      const mid = i*seg + seg/2;
      const deg = ((mid * 180 / Math.PI) % 360 + 360) % 360;
      const flip = deg > 90 && deg < 270;
      ctx.save(); ctx.rotate(mid);
      if (flip) { ctx.rotate(Math.PI); ctx.textAlign = 'left'; } else { ctx.textAlign = 'right'; }
      ctx.textBaseline = 'middle';
      ctx.fillStyle = neon ? '#eafffb' : casino ? '#ffe9b0' : '#0a0b12';
      // Deckel seg*R*0.42: so hoch ist ein Segment auf halbem Radius. Ohne den
      // Deckel würden bei vielen Segmenten die Labels ineinanderlaufen, sobald
      // der Nutzer die Textgröße hochdreht.
      ctx.font = `${Math.max(12, Math.min(R*0.115*(this.fs||1), seg*R*0.42))}px 'Lilita One', sans-serif`;
      const txt = this.segments[i].length>13 ? this.segments[i].slice(0,12)+'…' : this.segments[i];
      ctx.fillText(txt, flip ? -R*0.9 : R*0.9, 0); ctx.restore();
    }
    ctx.restore();
    // Rand
    if (casino) {
      const rim = ctx.createLinearGradient(this.cx-R, this.cy-R, this.cx+R, this.cy+R);
      rim.addColorStop(0,'#ffe88a'); rim.addColorStop(.5,'#c9962c'); rim.addColorStop(1,'#ffe88a');
      ctx.beginPath(); ctx.arc(this.cx,this.cy,R+2,0,Math.PI*2); ctx.lineWidth=12; ctx.strokeStyle=rim; ctx.stroke();
      ctx.beginPath(); ctx.arc(this.cx,this.cy,R-6,0,Math.PI*2); ctx.lineWidth=2; ctx.strokeStyle='rgba(255,232,138,.8)'; ctx.stroke();
    } else if (neon) {
      ctx.beginPath(); ctx.arc(this.cx,this.cy,R+1,0,Math.PI*2); ctx.lineWidth=5; ctx.strokeStyle=this.accent;
      ctx.shadowColor=this.accent; ctx.shadowBlur=22; ctx.stroke(); ctx.shadowBlur=0;
    } else {
      ctx.beginPath(); ctx.arc(this.cx,this.cy,R,0,Math.PI*2); ctx.lineWidth=7; ctx.strokeStyle='rgba(255,255,255,.42)'; ctx.stroke();
      ctx.lineWidth=3; ctx.strokeStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(this.cx,this.cy,R-4,0,Math.PI*2); ctx.stroke();
    }
    // Glühbirnen-Kette am Rand (fest, rotiert NICHT mit) — Casino/Jahrmarkt-Look.
    // Läuft während des Spins (Phase aus der Zeit), idle = schön alternierend.
    const bulbs = neon ? 0 : 24;
    const phase = this.spinning ? Math.floor(performance.now() / 90) : 0;
    for (let i = 0; i < bulbs; i++) {
      const a = (i / bulbs) * Math.PI * 2 - Math.PI / 2;
      const px = this.cx + Math.cos(a) * (R + 3), py = this.cy + Math.sin(a) * (R + 3);
      const on = (i + phase) % 2 === 0;
      ctx.beginPath(); ctx.arc(px, py, on ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#ffe27a' : '#fff6cf';
      ctx.shadowColor = on ? '#ffd23e' : 'transparent'; ctx.shadowBlur = on ? 10 : 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    // Nabe
    ctx.beginPath(); ctx.arc(this.cx,this.cy,R*0.14,0,Math.PI*2);
    const hg=ctx.createRadialGradient(this.cx-4,this.cy-4,2,this.cx,this.cy,R*0.14);
    if (casino) { hg.addColorStop(0,'#ffe88a'); hg.addColorStop(1,'#a97c1e'); }
    else if (neon) { hg.addColorStop(0,'#232636'); hg.addColorStop(1,'#0c0d16'); }
    else { hg.addColorStop(0,'#454d68'); hg.addColorStop(1,'#14161f'); }
    ctx.fillStyle=hg; ctx.fill(); ctx.lineWidth=4;
    ctx.strokeStyle = casino ? '#8a6a20' : neon ? this.accent : 'rgba(255,255,255,.5)';
    ctx.stroke();
    if (casino) { // Riffelung der Gold-Nabe
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(120,90,20,.6)';
      for (let k = 0; k < 8; k++) { const a2 = (k/8)*Math.PI*2; ctx.beginPath();
        ctx.moveTo(this.cx+Math.cos(a2)*R*0.05, this.cy+Math.sin(a2)*R*0.05);
        ctx.lineTo(this.cx+Math.cos(a2)*R*0.12, this.cy+Math.sin(a2)*R*0.12); ctx.stroke(); }
    }
    // ── Zeiger (klick-flap am oberen Rand) ──
    ctx.save(); ctx.translate(this.cx, this.cy - R - 2); ctx.rotate(this.pointerDefl);
    ctx.beginPath(); ctx.moveTo(-13,-14); ctx.lineTo(13,-14); ctx.lineTo(0,10); ctx.closePath();
    ctx.fillStyle = this.accent; ctx.fill(); ctx.strokeStyle='#0a0b12'; ctx.lineWidth=2.5; ctx.stroke();
    ctx.restore();
  }
  destroy() { if (this.cancelFrame) this.cancelFrame(); clearTimeout(this.hideT); clearTimeout(this.demoT); clearInterval(this.demoInterval);
    for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.observer.disconnect(); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
