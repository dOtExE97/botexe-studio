// stream-boss.js — Dauerhafte Boss-HP-Bar (Stream-Raid-Boss). Zeigt oben Boss-Name
// + Avatar, darunter eine große HP-Leiste (hp/maxHp als Prozent-Balken mit Glow;
// Farbe wechselt grün→gelb→rot bei wenig HP), ein Level-Badge und optional die
// Top-3-Damager mit Schadenswerten. Bei hp<=0 / status 'defeated' kurze
// „BESIEGT!"-Animation. Kein Boss aktiv → unsichtbar (idle).
//
// Daten-Eingang: onBoss(state) ODER onGameState({ gameKind:'boss', state }) —
//   beide zeigen auf denselben Render.
// state = { hp, maxHp, level, currentBoss?:{nickname,profilePic?},
//           topDamagers?: Array<{nickname,damage}>, status? }
// props: { accent, showDamagers }
const STYLE_ID = 'bx-boss-style';
const CSS = `
/* --bx-boss-accent = die eingestellte Akzentfarbe (props.accent). Sie faerbt das
   Chrome: Rahmen-Glow, Name, Level-Badge, Damager, Avatar-Ring. --bx-boss-color
   ist die HP-Ampel (gruen/gelb/rot) und gehoert NUR an den Balken — vorher hat
   sie den Akzent ueberall ueberschrieben, dadurch wirkte der Stil akzentblind. */
.bx-boss { position:absolute; inset:0; display:flex; flex-direction:column; gap: clamp(3px, min(2.4cqi, 5cqh), 10px);
  padding: min(3.8cqi, 8cqh) min(4.6cqi, 10cqh); container-type:size; font-family: var(--bx-font-body);
  --bx-boss-accent: var(--bx-accent, #ff5436);
  background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 50px -14px var(--bx-boss-accent);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  opacity:0; transform: translateY(12px) scale(.97); transition: opacity .4s, transform .4s; pointer-events:none; }
.bx-boss.on { opacity:1; transform:none; }
.bx-boss-head { display:flex; align-items:center; gap: clamp(3px, min(2.4cqi, 5cqh), 10px); }
/* Der Avatar ist ein .bx-av (widget-base.css): ohne Bild bleiben Farbton aus dem
   Namen + Initiale sichtbar statt eines leeren schwarzen Kreises. */
.bx-boss-avawrap { position:relative; flex:0 0 auto;
  width: clamp(18px, min(11cqi, 24cqh), 132px); height: clamp(18px, min(11cqi, 24cqh), 132px); }
/* font-size hier ist die Bezugsgröße für die Initiale des .bx-av-Fallbacks
   (widget-base.css zeichnet sie mit 52% der Elementschrift). Bewusst OHNE
   --bx-fs: der Buchstabe sitzt in einem Kreis fester Größe und würde sonst
   herauslaufen — die Textgrößen-Einstellung wirkt auf echte Texte. */
.bx-boss-ava { width:100%; height:100%; border-radius:50%; overflow:hidden;
  font-size: clamp(14px, min(9cqi, 20cqh), 110px);
  border:2px solid var(--bx-boss-accent); box-shadow: 0 0 16px -2px var(--bx-boss-accent); }
.bx-boss-ava img { width:100%; height:100%; object-fit:cover; position:relative; z-index:1; }
/* Boss-Wappen als kleines Eck-Abzeichen — markiert die Scheibe als Boss, ohne
   Gesicht bzw. Initiale zu verdecken. */
.bx-boss-crest { position:absolute; right:-6%; bottom:-6%; width:44%; height:44%;
  display:grid; place-items:center; border-radius:50%; background:#0b0d14;
  box-shadow: 0 0 0 2px var(--bx-boss-accent), 0 2px 6px rgba(0,0,0,.6); }
.bx-boss-crest svg { width:70%; height:70%; color: var(--bx-boss-accent); }
.bx-boss-name { flex:1 1 auto; min-width:0; font-family: var(--bx-font-display);
  font-size: calc(clamp(9px, min(6cqi, 15cqh), 46px) * var(--bx-fs, 1)); letter-spacing:.04em; text-transform:uppercase; line-height:1.1;
  color: var(--bx-text, #fff); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  text-shadow: 0 0 16px var(--bx-boss-accent); }
.bx-boss-lvl { flex:0 0 auto; font-family: var(--bx-font-display); font-size: calc(clamp(7px, min(3.6cqi, 9cqh), 30px) * var(--bx-fs, 1));
  padding: .18em .7em; border-radius: 999px; letter-spacing:.1em; text-transform:uppercase;
  color:#0a0b12; background: var(--bx-boss-accent);
  box-shadow: 0 0 14px -2px var(--bx-boss-accent); }
.bx-boss-track { position:relative; height: clamp(9px, min(5.5cqi, 14cqh), 52px); border-radius: 999px;
  background: rgba(8,10,18,.6); overflow:hidden; border:1px solid rgba(255,255,255,.12); }
.bx-boss-fill { position:absolute; inset:0 auto 0 0; width:100%;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-boss-color, var(--bx-accent)) 70%, #000), var(--bx-boss-color, var(--bx-accent)));
  box-shadow: 0 0 18px var(--bx-boss-color, var(--bx-accent)); transition: width .4s cubic-bezier(.2,1,.3,1), background .4s; }
.bx-boss-hptxt { position:absolute; inset:0; display:grid; place-items:center;
  font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:800; font-size: calc(clamp(7px, min(3.4cqi, 8.5cqh), 26px) * var(--bx-fs, 1));
  color:#fff; -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-boss-dmg { display:flex; flex-direction:column; gap:.25em; font-size: calc(clamp(8px, min(3.4cqi, 8cqh), 28px) * var(--bx-fs, 1)); }
.bx-boss-dmg-row { display:flex; align-items:center; gap:.5em; color: #c3cadd; }
.bx-boss-dmg-rank { flex:0 0 auto; width: 2.4em; text-align:center;
  font-family: var(--bx-font-display); color: var(--bx-boss-accent); }
.bx-boss-dmg-name { flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color: var(--bx-text, #fff); }
.bx-boss-dmg-val { flex:0 0 auto; font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:700;
  color: var(--bx-boss-accent); }
/* In sehr flachen Kästchen passen Kopfzeile, HP-Balken UND Schadensliste nicht
   mehr übereinander — mit hochgedrehter Textgröße erst recht nicht. Dann lieber
   WENIGER zeigen als abschneiden: die Schadensliste fällt weg, Boss und HP
   bleiben. (Die Liste war dort ohnehin nur noch ein 6-px-Strich.) */
@container (max-height: 125px) {
  .bx-boss-dmg { display: none; }
}
.bx-boss.hit .bx-boss-track { animation: bx-boss-shake .35s ease; }
@keyframes bx-boss-shake { 0%,100%{ transform:translateX(0) } 25%{ transform:translateX(-3px) } 75%{ transform:translateX(3px) } }
.bx-boss.defeated { animation: bx-boss-defeat 1.1s ease forwards; }
@keyframes bx-boss-defeat { 0%{ transform:none; filter:none } 20%{ transform:scale(1.04); filter: brightness(1.6) } 100%{ transform:scale(.9) rotate(-1deg); filter: grayscale(1) brightness(.5); opacity:0 } }
.bx-boss-slain { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none;
  font-family: var(--bx-font-display); font-size: calc(clamp(22px, min(9cqi, 22cqh), 96px) * var(--bx-fs, 1)); letter-spacing:.08em;
  color:#fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 24px var(--bx-boss-accent); opacity:0; }
.bx-boss.defeated .bx-boss-slain { animation: bx-boss-slain-in .9s ease; }
@keyframes bx-boss-slain-in { 0%{ opacity:0; transform:scale(.6) } 30%{ opacity:1; transform:scale(1.1) } 70%{ opacity:1; transform:scale(1) } 100%{ opacity:0 } }

/* ── Stil „Arcade" — Retro-Bosskampf: segmentierte LED-HP-Bar, Pixel-Charakter. */
.bx-boss-arcade { background: #101214; border-radius: 6px;
  box-shadow: 0 0 0 3px #2a2c33, 0 0 0 6px #101214, 0 14px 30px -12px rgba(0,0,0,.85);
  -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-boss-arcade .bx-boss-fill { -webkit-mask: repeating-linear-gradient(90deg, #000 0 12px, transparent 12px 15px);
  mask: repeating-linear-gradient(90deg, #000 0 12px, transparent 12px 15px); }
.bx-boss-arcade .bx-boss-name { font-family: var(--bx-font-mono); letter-spacing: .2em; }
.bx-boss-arcade .bx-boss-ava { border-radius: 6px; }

/* ── Stil „Düster" — Dark-Fantasy: schwarz-rotes Glühen, Blut-HP, bedrohliche Aura. */
.bx-boss-duester { background: linear-gradient(170deg, rgba(18,8,10,.96), rgba(8,4,6,.97));
  border: 1px solid rgba(200,30,40,.55); border-radius: 4px;
  box-shadow: 0 0 40px -8px rgba(200,20,30,.55), inset 0 0 50px rgba(120,0,10,.35);
  -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-boss-duester .bx-boss-fill { background: linear-gradient(90deg, #7a0a12, #c81e28 60%, #ff4a3a) !important;
  box-shadow: 0 0 18px #c81e28; }
.bx-boss-duester .bx-boss-name { color: #ffd9d0; text-shadow: 0 0 18px rgba(255,60,50,.8), 0 2px 4px #000; }
.bx-boss-duester { --bx-boss-accent: #c81e28; }
.bx-boss-duester .bx-boss-ava { border-radius: 4px; }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Balken und Level-Chip haben eigene Flächen. Frei auf dem Video stehen der
   Bossname und die Schadensliste — beide weiß bzw. blass und auf heller Szene
   unsichtbar. Kontur deshalb nur dort.
   Bei arcade/duester bleibt der eigene Gehäuse-Schatten stehen: er IST die Form
   des Stils, „Rahmen ausblenden" ist dort gegenstandslos. */
.bx-frameless .bx-boss:not(.bx-boss-arcade):not(.bx-boss-duester) { box-shadow: none; }
/* Der Düster-Stil zeichnet seinen Rahmen als border — die globale
   frameless-Regel hätte ihn ersatzlos gelöscht. */
.bx-frameless .bx-boss-duester { border-color: rgba(200,30,40,.55) !important; }
.bx-frameless .bx-boss-name, .bx-frameless .bx-boss-dmg, .bx-frameless .bx-boss-slain {
  -webkit-text-stroke: max(1.5px, .075em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.6); }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   Zwei Momente, unterschiedlich laut: SCHADEN trifft die HP-Leiste, der TOD
   trifft den Boss selbst.
   1. Schaden: die Leiste wackelt bereits (bx-boss-shake). Diese Regel steht im
      Dokument nach widget-base.css und hätte den Auslöser überschrieben —
      deshalb beides zusammen. Wackeln nutzt transform, Anheben die eigene
      scale-Eigenschaft; die beiden kommen sich nicht ins Gehege. Der Ring läuft
      in der HP-Ampelfarbe: bei wenig HP wird der Treffer rot.
   2. Tod: der Auslöser sitzt auf der Boss-Scheibe. Der Ring folgt der Rundung
      (sonst kastenförmiger Ring um ein rundes Bild), und das Profilbild blitzt
      über die Basisregel für .bx-av mit auf.
   Das Wappen bleibt bewusst ruhig: es ist ein festes Abzeichen, kein Ereignis. */
.bx-premium .bx-boss.hit .bx-boss-track.bx-hit {
  --bx-accent: var(--bx-boss-color, var(--bx-boss-accent));
  animation: bx-boss-shake .35s ease,
    bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1); }
.bx-premium .bx-boss-avawrap.bx-hit { border-radius: 50%; }
/* Arcade und Düster tragen eine eckige Scheibe — dort folgt der Ring der Kante. */
.bx-premium .bx-boss-arcade .bx-boss-avawrap.bx-hit { border-radius: 6px; }
.bx-premium .bx-boss-duester .bx-boss-avawrap.bx-hit { border-radius: 4px; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(Math.round(n)));
const BOSS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 9.5 6 5 5l1.5 5L3 13l4 1 1 5 4-2 4 2 1-5 4-1-3.5-3L19 5l-4.5 1L12 2Zm-2 9a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 10 11Zm4 0a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 14 11Z"/></svg>';

// Premium-Auslöser: Klasse `bx-hit` setzen und nach 900 ms wieder wegnehmen.
// Was daraus wird (Anheben, Ring, Aufblitzen), entscheidet die Premium-Ebene in
// widget-base.css — ohne den Haken „Premium-Effekte" passiert nichts. Bewusst
// lokal dupliziert: die Widgets haben kein gemeinsames JS-Modul.
function bxHit(el, timers) {
  if (!el) return;
  // Ohne die Premium-Ebene gibt es fuer .bx-hit keine einzige CSS-Regel —
  // der erzwungene Reflow unten waere also Arbeit fuer einen unsichtbaren
  // Effekt, bei JEDEM Ereignis und in JEDEM Widget.
  if (!el.closest('.bx-premium')) return;
  el.classList.remove('bx-hit');
  void el.offsetWidth; // Reflow → bei schnellen Folgen springt der Effekt neu an
  el.classList.add('bx-hit');
  const t = setTimeout(() => { timers.delete(t); el.classList.remove('bx-hit'); }, 900);
  timers.add(t);
}

/** Farbton/Initiale für den .bx-av-Fallback (Boss ohne Profilbild).
 *  Bewusst lokal dupliziert — die Widgets haben kein gemeinsames JS-Modul. */
function bxAvHue(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; // streut besser als eine reine Summe
  return h;
}
function bxAvInitial(name) {
  const s = String(name || '').trim();
  return (s ? s[0] : '?').toUpperCase();
}

// HP-Farbe nach Prozent: grün (voll) → gelb → rot (wenig). Reine Logik → testbar.
export function hpColor(pct) {
  if (pct > 0.5) return '#2ee06a';      // grün
  if (pct > 0.25) return '#ffd23e';     // gelb
  return '#ff4d2e';                     // rot
}

export default class StreamBoss {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    props = props || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.showDamagers = props.showDamagers !== false;

    this.active = false;
    this.defeated = false;
    this.timers = new Set(); // Premium-Auslöser → bei destroy clearen

    this.el = document.createElement('div');
    this.style = ['glas', 'arcade', 'duester'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-boss${this.style !== 'glas' ? ` bx-boss-${this.style}` : ''}`;
    this.el.innerHTML = `<div class="bx-boss-head">
        <div class="bx-boss-avawrap"><div class="bx-boss-ava bx-av"></div><span class="bx-boss-crest">${BOSS_SVG}</span></div>
        <div class="bx-boss-name"></div>
        <div class="bx-boss-lvl"></div>
      </div>
      <div class="bx-boss-track"><div class="bx-boss-fill"></div><div class="bx-boss-hptxt"></div></div>
      <div class="bx-boss-dmg"></div>
      <div class="bx-boss-slain">BESIEGT!</div>`;
    this.avaWrapEl = this.el.querySelector('.bx-boss-avawrap');
    this.avaEl = this.el.querySelector('.bx-boss-ava');
    this.nameEl = this.el.querySelector('.bx-boss-name');
    this.lvlEl = this.el.querySelector('.bx-boss-lvl');
    this.fillEl = this.el.querySelector('.bx-boss-fill');
    this.hpTxtEl = this.el.querySelector('.bx-boss-hptxt');
    this.dmgEl = this.el.querySelector('.bx-boss-dmg');
    root.appendChild(this.el);

    this.lastAvatar = '';
    this.lastName = '';

    if (this.ctx.preview) this.demo();
  }

  // Beide Eingänge → derselbe Render.
  onBoss(state) { this.update(state); }
  onGameState(payload) {
    if (!payload || payload.gameKind !== 'boss') return;
    this.update(payload.state);
  }

  update(state) {
    if (!state) { this.hide(); return; }
    const maxHp = Math.max(1, Number(state.maxHp) || 0);
    const hp = Math.max(0, Math.min(maxHp, Number(state.hp) || 0));
    const dead = state.status === 'defeated' || hp <= 0;

    if (dead) { this.kill(); return; }

    const wasActive = this.active;
    this.active = true;
    this.defeated = false;
    this.el.classList.remove('defeated');
    this.el.classList.add('on');

    // Avatar nur bei Änderung neu setzen (vermeidet Flackern / Reload). Der
    // Vergleich muss den NAMEN einschließen: ohne Profilbild ist avatar immer ''
    // und damit gleich dem Startwert — der Kreis blieb dadurch leer (schwarz).
    const boss = state.currentBoss || {};
    const avatar = boss.profilePic || '';
    const name = boss.nickname || 'Boss';
    if (avatar !== this.lastAvatar || name !== this.lastName) {
      this.lastAvatar = avatar;
      this.lastName = name;
      this.avaEl.replaceChildren();
      this.avaEl.classList.toggle('bx-av-img', !!avatar);
      this.avaEl.style.setProperty('--bx-av-h', String(bxAvHue(name)));
      this.avaEl.setAttribute('data-initial', bxAvInitial(name));
      if (avatar) {
        // Bild-URL als DOM-Property (kein innerHTML) → keine XSS-Fläche.
        const img = document.createElement('img');
        img.alt = '';
        img.src = avatar;
        // Kaputte URL → zurück auf Initiale+Farbton statt leerem schwarzem Kreis.
        img.onerror = () => { img.remove(); this.avaEl.classList.remove('bx-av-img'); };
        this.avaEl.appendChild(img);
      }
    }
    this.nameEl.textContent = name;

    const lvl = Math.max(1, Math.floor(Number(state.level) || 1));
    this.lvlEl.textContent = `LVL ${lvl}`;

    const pct = hp / maxHp;
    const color = hpColor(pct);
    this.el.style.setProperty('--bx-boss-color', color);
    this.fillEl.style.width = `${pct * 100}%`;
    this.hpTxtEl.textContent = `${fmt(hp)} / ${fmt(maxHp)}`;

    this.renderDamagers(state.topDamagers);

    // Treffer-Wackler nur, wenn schon aktiv (nicht beim Einblenden).
    if (wasActive) {
      this.el.classList.remove('hit'); void this.el.offsetWidth; this.el.classList.add('hit');
      // Der Moment: Schaden ist angekommen — die HP-Leiste nimmt ihn.
      bxHit(this.el.querySelector('.bx-boss-track'), this.timers);
    }
  }

  renderDamagers(list) {
    this.dmgEl.style.display = this.showDamagers ? '' : 'none';
    if (!this.showDamagers) return;
    const top = Array.isArray(list) ? list.slice(0, 3) : [];
    this.dmgEl.replaceChildren();
    top.forEach((d, i) => {
      const row = document.createElement('div');
      row.className = 'bx-boss-dmg-row';
      const rank = document.createElement('span');
      rank.className = 'bx-boss-dmg-rank';
      rank.textContent = `#${i + 1}`;
      const name = document.createElement('span');
      name.className = 'bx-boss-dmg-name';
      name.textContent = (d && d.nickname) || '???'; // textContent → kein XSS
      const val = document.createElement('span');
      val.className = 'bx-boss-dmg-val';
      val.textContent = fmt(Math.max(0, Number(d && d.damage) || 0));
      row.append(rank, name, val);
      this.dmgEl.appendChild(row);
    });
  }

  // Boss besiegt → kurze „BESIEGT!"-Animation, danach ausblenden.
  kill() {
    if (this.defeated || !this.active) { if (!this.active) this.hide(); return; }
    this.defeated = true;
    this.fillEl.style.width = '0%';
    this.hpTxtEl.textContent = '0 / 0';
    this.el.classList.add('defeated');
    // Der große Moment: der Boss fällt — der Auslöser trifft ihn selbst.
    bxHit(this.avaWrapEl, this.timers);
    if (this.killTimer) clearTimeout(this.killTimer);
    this.killTimer = setTimeout(() => { this.killTimer = null; this.hide(); }, 1100);
  }

  hide() {
    this.active = false;
    this.defeated = false;
    this.el.classList.remove('on', 'defeated', 'hit');
  }

  // Neuer Stream → Boss weg.
  onReset() {
    if (this.killTimer) { clearTimeout(this.killTimer); this.killTimer = null; }
    this.lastAvatar = '';
    this.lastName = '';
    this.hide();
  }

  // Preview-Demo: ein Boss bei ~62% HP mit Top-Damagern.
  demo() {
    this.update({
      hp: 6200, maxHp: 10000, level: 7,
      currentBoss: { nickname: 'Lord Lagswitch' },
      topDamagers: [
        { nickname: 'ExE', damage: 1840 },
        { nickname: 'GiftGremlin', damage: 1230 },
        { nickname: 'comboqueen', damage: 720 },
      ],
    });
  }

  destroy() {
    if (this.killTimer) { clearTimeout(this.killTimer); this.killTimer = null; }
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.active = false;
    this.el.remove();
  }
}
