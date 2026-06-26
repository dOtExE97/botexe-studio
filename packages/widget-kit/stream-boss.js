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
.bx-boss { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px;
  padding:14px 18px; container-type:size; font-family: var(--bx-font-body);
  background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 50px -14px var(--bx-boss-color, var(--bx-accent));
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  opacity:0; transform: translateY(12px) scale(.97); transition: opacity .4s, transform .4s; pointer-events:none; }
.bx-boss.on { opacity:1; transform:none; }
.bx-boss-head { display:flex; align-items:center; gap:10px; }
.bx-boss-ava { flex:0 0 auto; width: clamp(32px, 14cqmin, 54px); height: clamp(32px, 14cqmin, 54px);
  border-radius:50%; overflow:hidden; display:grid; place-items:center; background: rgba(8,10,18,.55);
  border:2px solid var(--bx-boss-color, var(--bx-accent)); box-shadow: 0 0 16px -2px var(--bx-boss-color, var(--bx-accent)); }
.bx-boss-ava img { width:100%; height:100%; object-fit:cover; }
.bx-boss-ava svg { width:62%; height:62%; color: var(--bx-boss-color, var(--bx-accent)); }
.bx-boss-name { flex:1 1 auto; min-width:0; font-family: var(--bx-font-display);
  font-size: clamp(14px, 5.4cqmin, 28px); letter-spacing:.04em; text-transform:uppercase;
  color: var(--bx-text, #fff); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  text-shadow: 0 0 16px var(--bx-boss-color, var(--bx-accent)); }
.bx-boss-lvl { flex:0 0 auto; font-family: var(--bx-font-display); font-size: clamp(11px, 3.8cqmin, 18px);
  padding: 2px 10px; border-radius: 999px; letter-spacing:.1em; text-transform:uppercase;
  color:#0a0b12; background: var(--bx-boss-color, var(--bx-accent));
  box-shadow: 0 0 14px -2px var(--bx-boss-color, var(--bx-accent)); }
.bx-boss-track { position:relative; height: clamp(16px, 8cqmin, 30px); border-radius: 999px;
  background: rgba(8,10,18,.6); overflow:hidden; border:1px solid rgba(255,255,255,.12); }
.bx-boss-fill { position:absolute; inset:0 auto 0 0; width:100%;
  background: linear-gradient(90deg, color-mix(in srgb, var(--bx-boss-color, var(--bx-accent)) 70%, #000), var(--bx-boss-color, var(--bx-accent)));
  box-shadow: 0 0 18px var(--bx-boss-color, var(--bx-accent)); transition: width .4s cubic-bezier(.2,1,.3,1), background .4s; }
.bx-boss-hptxt { position:absolute; inset:0; display:grid; place-items:center;
  font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:800; font-size: clamp(10px, 4cqmin, 16px);
  color:#fff; -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-boss-dmg { display:flex; flex-direction:column; gap:3px; font-size: clamp(9px, 3cqmin, 14px); }
.bx-boss-dmg-row { display:flex; align-items:center; gap:8px; color: var(--bx-muted); }
.bx-boss-dmg-rank { flex:0 0 auto; width: clamp(14px, 5cqmin, 20px); text-align:center;
  font-family: var(--bx-font-display); color: var(--bx-boss-color, var(--bx-accent)); }
.bx-boss-dmg-name { flex:1 1 auto; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color: var(--bx-text, #fff); }
.bx-boss-dmg-val { flex:0 0 auto; font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:700;
  color: var(--bx-boss-color, var(--bx-accent)); }
.bx-boss.hit .bx-boss-track { animation: bx-boss-shake .35s ease; }
@keyframes bx-boss-shake { 0%,100%{ transform:translateX(0) } 25%{ transform:translateX(-3px) } 75%{ transform:translateX(3px) } }
.bx-boss.defeated { animation: bx-boss-defeat 1.1s ease forwards; }
@keyframes bx-boss-defeat { 0%{ transform:none; filter:none } 20%{ transform:scale(1.04); filter: brightness(1.6) } 100%{ transform:scale(.9) rotate(-1deg); filter: grayscale(1) brightness(.5); opacity:0 } }
.bx-boss-slain { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none;
  font-family: var(--bx-font-display); font-size: clamp(18px, 11cqmin, 56px); letter-spacing:.08em;
  color:#fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 24px var(--bx-boss-color, var(--bx-accent)); opacity:0; }
.bx-boss.defeated .bx-boss-slain { animation: bx-boss-slain-in .9s ease; }
@keyframes bx-boss-slain-in { 0%{ opacity:0; transform:scale(.6) } 30%{ opacity:1; transform:scale(1.1) } 70%{ opacity:1; transform:scale(1) } 100%{ opacity:0 } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(Math.round(n)));
const BOSS_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 9.5 6 5 5l1.5 5L3 13l4 1 1 5 4-2 4 2 1-5 4-1-3.5-3L19 5l-4.5 1L12 2Zm-2 9a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 10 11Zm4 0a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 14 11Z"/></svg>';

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

    this.el = document.createElement('div');
    this.el.className = 'bx-boss';
    this.el.innerHTML = `<div class="bx-boss-head">
        <div class="bx-boss-ava"></div>
        <div class="bx-boss-name"></div>
        <div class="bx-boss-lvl"></div>
      </div>
      <div class="bx-boss-track"><div class="bx-boss-fill"></div><div class="bx-boss-hptxt"></div></div>
      <div class="bx-boss-dmg"></div>
      <div class="bx-boss-slain">BESIEGT!</div>`;
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

    // Avatar nur bei Änderung neu setzen (vermeidet Flackern / Reload).
    const boss = state.currentBoss || {};
    const avatar = boss.profilePic || '';
    if (avatar !== this.lastAvatar) {
      this.lastAvatar = avatar;
      if (avatar) { this.avaEl.innerHTML = '<img alt="" />'; this.avaEl.querySelector('img').src = avatar; }
      else this.avaEl.innerHTML = BOSS_SVG;
    }
    this.nameEl.textContent = boss.nickname || 'Boss';

    const lvl = Math.max(1, Math.floor(Number(state.level) || 1));
    this.lvlEl.textContent = `LVL ${lvl}`;

    const pct = hp / maxHp;
    const color = hpColor(pct);
    this.el.style.setProperty('--bx-boss-color', color);
    this.fillEl.style.width = `${pct * 100}%`;
    this.hpTxtEl.textContent = `${fmt(hp)} / ${fmt(maxHp)}`;

    this.renderDamagers(state.topDamagers);

    // Treffer-Wackler nur, wenn schon aktiv (nicht beim Einblenden).
    if (wasActive) { this.el.classList.remove('hit'); void this.el.offsetWidth; this.el.classList.add('hit'); }
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
    this.active = false;
    this.el.remove();
  }
}
