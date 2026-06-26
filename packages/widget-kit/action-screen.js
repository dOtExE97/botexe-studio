// action-screen.js — unsichtbares „Moment"-Widget. Spielt kurze Premium-
// Einblender ab (VIP-Welcome, Level-Up, Game-Win, Boss-Kill, Loot, …) und ist
// danach wieder unsichtbar. Mehrere Action-Screens können per channel/types
// filtern (Mini links oben, Big mittig, Game-Feed …). Queue mit Priorität +
// Dedupe + Backpressure-Limits. TikTok-Hochkant-tauglich (kompakte Karten).
// props: { channels, types, sizeMode, queueMode, maxQueue, minPriority, dedupeMs,
//          defaultSkin, animation, showAvatar, showStats, soundMode, soundId, accent }

let styled = false;
function ensureStyle() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `
  .bx-as { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
  .bx-as-card { --bx-as-accent: var(--bx-accent,#ff5436); opacity:0; transform:translateY(14px) scale(.96);
    display:flex; flex-direction:column; gap:.35em; padding:1em 1.2em; border-radius:1em; max-width:96%;
    background:linear-gradient(160deg, rgba(20,20,28,.96), rgba(12,12,18,.96)); color:#fff;
    border:1px solid color-mix(in srgb, var(--bx-as-accent) 55%, transparent);
    box-shadow:0 10px 40px rgba(0,0,0,.5), 0 0 36px color-mix(in srgb, var(--bx-as-accent) 35%, transparent);
    font-family:var(--bx-font-display, inherit); will-change:opacity,transform; }
  .bx-as-card.show { opacity:1; transform:none; transition:opacity .32s ease, transform .42s cubic-bezier(.2,1.3,.35,1); }
  .bx-as-card.out { opacity:0; transform:translateY(-10px) scale(.97); transition:opacity .3s ease, transform .3s ease; }
  .bx-as-head { display:flex; align-items:center; gap:.6em; }
  .bx-as-av { width:2.4em; height:2.4em; border-radius:50%; object-fit:cover; flex:none;
    border:2px solid var(--bx-as-accent); box-shadow:0 0 12px color-mix(in srgb,var(--bx-as-accent) 50%,transparent); }
  .bx-as-badge { flex:none; width:2.4em; height:2.4em; border-radius:.6em; display:flex; align-items:center; justify-content:center;
    font-size:1.3em; background:color-mix(in srgb,var(--bx-as-accent) 22%, #000); }
  .bx-as-ttl { font-weight:800; font-size:1.15em; line-height:1.05; text-shadow:0 2px 8px rgba(0,0,0,.6); }
  .bx-as-sub { font-size:.82em; color:#ffffffcc; line-height:1.1; }
  .bx-as-lvl { font-size:.95em; font-weight:800; color:var(--bx-as-accent); }
  .bx-as-stats { display:flex; flex-wrap:wrap; gap:.3em .7em; font-size:.74em; color:#fff9; }
  .bx-as-stats b { color:#fff; }
  /* Animations-Varianten */
  .bx-as-card.anim-pop.show { animation:bx-as-pop .5s cubic-bezier(.2,1.5,.35,1); }
  @keyframes bx-as-pop { 0%{transform:scale(.7)} 60%{transform:scale(1.06)} 100%{transform:scale(1)} }
  .bx-as-card.anim-flip.show { animation:bx-as-flip .55s ease; }
  @keyframes bx-as-flip { 0%{transform:rotateX(80deg);opacity:0} 100%{transform:none;opacity:1} }
  /* Skins */
  .skin-arcade .bx-as-card { background:linear-gradient(160deg,#1a0f3d,#0d0820); border-radius:.3em; font-family:var(--bx-font-display,monospace); text-transform:uppercase; }
  .skin-clean .bx-as-card { background:rgba(255,255,255,.96); color:#15151c; box-shadow:0 8px 30px rgba(0,0,0,.25); }
  .skin-clean .bx-as-sub,.skin-clean .bx-as-stats { color:#15151c99; } .skin-clean .bx-as-stats b{color:#15151c;}
  .skin-cute .bx-as-card { background:linear-gradient(160deg,#ff8fc7,#ffd1e8); color:#5a1e3e; border-radius:1.4em; }
  .skin-dark-pro .bx-as-card { background:rgba(8,9,14,.97); border-width:1px; }
  `;
  document.head.appendChild(s);
}

const SIZE = {
  compact: { w: 360, h: 134, font: 15 }, standard: { w: 400, h: 210, font: 17 },
  full: { w: 460, h: 460, font: 20 }, auto: { w: 400, h: 210, font: 17 },
};
const BADGE = {
  'vip-welcome': '👑', 'returning-viewer': '💜', 'game-level-up': '⭐', 'game-winner': '🏆',
  'quiz-reveal': '🧠', 'boss-damage': '⚔️', 'boss-kill': '💀', 'loot-drop': '🎁',
  'card-drop': '🃏', 'clip-marker': '🎬', 'manual-card': '✨',
};
const csv = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export default class ActionScreen {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.p = props || {};
    if (this.p.accent) root.style.setProperty('--bx-accent', this.p.accent);
    this.channels = csv(this.p.channels);          // leer = alle
    this.types = csv(this.p.types);                 // leer = alle
    this.minPriority = Number(this.p.minPriority ?? 0) || 0;
    this.maxQueue = Math.max(1, Number(this.p.maxQueue ?? 6) || 6);
    this.dedupeMs = Number(this.p.dedupeMs ?? 1500) || 0;
    this.queueMode = this.p.queueMode === 'fifo' ? 'fifo' : 'priority';
    this.anim = ['slide', 'pop', 'flip', 'sweep', 'fade', 'none'].includes(this.p.animation) ? this.p.animation : 'pop';
    this.skin = this.p.defaultSkin || 'premium';
    this.queue = [];
    this.recent = new Map();   // dedupe-Schlüssel → ts
    this.busy = false;

    this.el = document.createElement('div');
    this.el.className = `bx-as skin-${this.skin}`;
    this.el.style.display = 'none';
    root.appendChild(this.el);

    // Editor-Schaufenster: einen Demo-Moment zeigen.
    if (this.ctx.preview) {
      setTimeout(() => this.onMoment({
        id: 'demo', channel: 'vip', type: 'vip-welcome', priority: 70, durationMs: 4000,
        title: 'Willkommen, ExE! 👑', subtitle: 'VIP des Streams', user: { id: '1', nickname: 'ExE' },
        stats: { Besuche: 42, Coins: 1337 },
      }), 600);
    }
  }

  onMoment(m) {
    if (!m || typeof m !== 'object') return;
    if (this.channels.length && !this.channels.includes(m.channel)) return;
    if (this.types.length && !this.types.includes(m.type)) return;
    if ((m.priority ?? 0) < this.minPriority) return;
    // Dedupe gleicher Moment (Typ+User) in kurzem Fenster.
    const key = `${m.type}:${m.user?.id ?? m.title}`;
    const now = Date.now();
    if (this.dedupeMs && (now - (this.recent.get(key) ?? 0)) < this.dedupeMs) return;
    this.recent.set(key, now);

    if (this.queue.length >= this.maxQueue) {
      // Backpressure: niedrigste Priorität rauswerfen, wenn der Neue höher ist.
      let lowIdx = 0;
      for (let i = 1; i < this.queue.length; i++) if ((this.queue[i].priority ?? 0) < (this.queue[lowIdx].priority ?? 0)) lowIdx = i;
      if ((m.priority ?? 0) > (this.queue[lowIdx].priority ?? 0)) this.queue.splice(lowIdx, 1); else return;
    }
    this.queue.push(m);
    if (this.queueMode === 'priority') this.queue.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    this.pump();
  }

  pump() {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    const m = this.queue.shift();
    this.show(m);
  }

  show(m) {
    const size = SIZE[this.p.sizeMode] || SIZE.standard;
    this.el.style.display = 'flex';
    const skin = m.visual?.skin || this.skin;
    this.el.className = `bx-as skin-${skin}`;
    if (m.visual?.accent) this.el.style.setProperty('--bx-accent', m.visual.accent);

    const card = document.createElement('div');
    card.className = `bx-as-card anim-${this.anim}`;
    card.style.width = `${size.w}px`;
    card.style.fontSize = `${(size.font * (Number(this.p.fontScale) || 1))}px`;
    if (this.p.textColor) card.style.color = this.p.textColor;

    const head = document.createElement('div');
    head.className = 'bx-as-head';
    const showAv = this.p.showAvatar !== false && m.user?.profilePic;
    head.innerHTML = showAv
      ? `<img class="bx-as-av" src="${m.user.profilePic}" alt="">`
      : `<div class="bx-as-badge">${BADGE[m.type] || '✨'}</div>`;
    const txt = document.createElement('div');
    txt.innerHTML = `<div class="bx-as-ttl"></div>${m.subtitle ? '<div class="bx-as-sub"></div>' : ''}`;
    txt.querySelector('.bx-as-ttl').textContent = m.title || '';
    if (m.subtitle) txt.querySelector('.bx-as-sub').textContent = m.subtitle;
    head.appendChild(txt);
    card.appendChild(head);

    if (m.level) {
      const lvl = document.createElement('div');
      lvl.className = 'bx-as-lvl';
      lvl.textContent = `Level ${m.level.value} · ${m.level.title}${m.level.nextWins ? ` (${m.level.currentWins}/${m.level.nextWins})` : ''}`;
      card.appendChild(lvl);
    }
    if (this.p.showStats !== false && m.stats && Object.keys(m.stats).length) {
      const st = document.createElement('div');
      st.className = 'bx-as-stats';
      st.innerHTML = Object.entries(m.stats).map(([k, v]) => `<span>${k}: <b>${v}</b></span>`).join('');
      card.appendChild(st);
    }
    this.el.appendChild(card);
    requestAnimationFrame(() => card.classList.add('show'));

    // Sound
    const sound = this.p.soundMode === 'off' ? null : (this.p.soundMode === 'custom' ? this.p.soundId : m.soundId);
    if (sound && this.ctx.playSound) this.ctx.playSound(sound);

    const dur = Math.max(1200, Number(m.durationMs) || 4000);
    this._t = setTimeout(() => {
      card.classList.remove('show'); card.classList.add('out');
      setTimeout(() => {
        card.remove();
        if (!this.queue.length) this.el.style.display = 'none';
        this.busy = false;
        this.pump();
      }, 320);
    }, dur);
  }

  destroy() { clearTimeout(this._t); this.queue = []; }
}
