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
  .bx-as-av-wrap { position:relative; flex:none; }
  .bx-as-av { width:3.2em; height:3.2em; border-radius:50%; object-fit:cover; display:block; background:#0004;
    border:2.5px solid var(--bx-as-accent); box-shadow:0 0 18px color-mix(in srgb,var(--bx-as-accent) 55%,transparent), 0 2px 8px #0009; }
  .bx-as-av-wrap.noimg .bx-as-av { visibility:hidden; }
  .bx-as-av-wrap.noimg::after { content:attr(data-badge); position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:1.6em; border-radius:50%; background:color-mix(in srgb,var(--bx-as-accent) 25%,#000); }
  .bx-as-av-badge { position:absolute; bottom:-3px; right:-5px; font-size:1.25em; line-height:1;
    filter:drop-shadow(0 1px 3px #000); pointer-events:none; }
  .bx-as-badge { flex:none; width:3.2em; height:3.2em; border-radius:.7em; display:flex; align-items:center; justify-content:center;
    font-size:1.7em; background:color-mix(in srgb,var(--bx-as-accent) 22%, #000); box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--bx-as-accent) 40%,transparent); }
  .bx-as-ttl { font-weight:800; font-size:1.15em; line-height:1.05; text-shadow:0 2px 8px rgba(0,0,0,.6); }
  .bx-as-sub { font-size:.82em; color:#ffffffcc; line-height:1.1; }
  .bx-as-lvl { font-size:.95em; font-weight:800; color:var(--bx-as-accent); }
  .bx-as-stats { display:flex; flex-wrap:wrap; gap:.32em; margin-top:.15em; }
  .bx-as-chip { display:inline-flex; align-items:center; gap:.28em; padding:.2em .5em; border-radius:.55em;
    background:color-mix(in srgb, var(--bx-as-accent) 16%, #0006); font-size:.72em; line-height:1; white-space:nowrap; }
  .bx-as-chip .ic { font-size:1.05em; }
  .bx-as-chip b { color:#fff; font-weight:800; font-variant-numeric:tabular-nums; }
  .bx-as-chip span:last-child { color:#fff8; }
  /* Animations-Varianten */
  .bx-as-card.anim-pop.show { animation:bx-as-pop .5s cubic-bezier(.2,1.5,.35,1); }
  @keyframes bx-as-pop { 0%{transform:scale(.7)} 60%{transform:scale(1.06)} 100%{transform:scale(1)} }
  .bx-as-card.anim-flip.show { animation:bx-as-flip .55s ease; }
  @keyframes bx-as-flip { 0%{transform:rotateX(80deg);opacity:0} 100%{transform:none;opacity:1} }
  /* Skins */
  /* Premium Gold — edler Verlauf, goldener Akzent + Schimmer */
  .skin-premium .bx-as-card { --bx-as-accent:#ffce54; background:linear-gradient(160deg,#2a2418,#16130c 60%,#0c0a06);
    border:1px solid #ffce5466; box-shadow:0 12px 44px #000a, 0 0 40px #ffce5430, inset 0 1px 0 #ffffff22; }
  .skin-premium .bx-as-ttl { background:linear-gradient(90deg,#fff,#ffe7a8); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
  /* Arcade XP — Retro, harte Kanten, Neon-Doppelrahmen, Großbuchstaben */
  .skin-arcade .bx-as-card { --bx-as-accent:#34e2ff; background:linear-gradient(160deg,#1a0f3d,#0d0820); border-radius:.25em;
    font-family:var(--bx-font-display,monospace); text-transform:uppercase; letter-spacing:.02em;
    border:2px solid #34e2ff; box-shadow:0 0 0 2px #ff2e9a inset, 0 10px 36px #000a, 0 0 26px #34e2ff66; }
  .skin-arcade .bx-as-ttl { color:#34e2ff; text-shadow:0 0 8px #34e2ffaa; }
  /* Clean Stream — hell, minimalistisch, dezent */
  .skin-clean .bx-as-card { background:rgba(255,255,255,.97); color:#15151c; border:1px solid #0001; border-radius:.9em; box-shadow:0 10px 34px #00000028; }
  .skin-clean .bx-as-sub { color:#15151c99; } .skin-clean .bx-as-ttl { text-shadow:none; }
  .skin-clean .bx-as-chip { background:#15151c0d; } .skin-clean .bx-as-chip b { color:#15151c; } .skin-clean .bx-as-chip span:last-child { color:#15151c80; }
  /* Cute Pop — rosa Verlauf, rund, verspielt */
  .skin-cute .bx-as-card { --bx-as-accent:#ff4d97; background:linear-gradient(160deg,#ff8fc7,#ffd1e8); color:#5a1e3e; border:0; border-radius:1.5em; box-shadow:0 12px 34px #ff4d9740; }
  .skin-cute .bx-as-ttl { text-shadow:0 1px 0 #fff6; } .skin-cute .bx-as-sub { color:#5a1e3ecc; }
  .skin-cute .bx-as-chip { background:#ffffff80; } .skin-cute .bx-as-chip b { color:#5a1e3e; } .skin-cute .bx-as-chip span:last-child { color:#5a1e3eaa; }
  /* Dark Pro Neon — tiefdunkel, kräftiger Neon-Glow */
  .skin-dark-pro .bx-as-card { --bx-as-accent:#7c5cff; background:radial-gradient(120% 120% at 0 0, #14132a, #07070d); border:1px solid #7c5cff55;
    box-shadow:0 12px 44px #000c, 0 0 34px #7c5cff44; }
  .skin-dark-pro .bx-as-ttl { color:#cfc6ff; text-shadow:0 0 10px #7c5cff88; }
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

// Icons pro Stat-Label (für die hübschen Chips auf VIP-/Moment-Karten).
const STAT_ICON = {
  Besuche: '🔁', Coins: '🪙', Likes: '👍', Kommentare: '💬', Punkte: '⭐',
  Gifts: '🎁', Wins: '🏆', Schaden: '⚔️',
};
// Große Zahlen kompakt: 1337 → „1.337", 12500 → „12,5k", 1_200_000 → „1,2M".
function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return n.toLocaleString('de-DE');
}

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
      this._previewT = setTimeout(() => this.onMoment({
        id: 'demo', channel: 'vip', type: 'vip-welcome', priority: 70, durationMs: 4000,
        title: 'Willkommen, ExE! 👑', subtitle: 'VIP des Streams',
        user: { id: '1', nickname: 'ExE', profilePic: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a4d"/><stop offset="1" stop-color="#ff2e63"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="64" font-size="48" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="white">E</text></svg>') },
        stats: { Besuche: 42, Coins: 13700, Likes: 2840, Kommentare: 512 },
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

    if (this.queue.length >= this.maxQueue) {
      // Backpressure: niedrigste Priorität rauswerfen, wenn der Neue höher ist.
      let lowIdx = 0;
      for (let i = 1; i < this.queue.length; i++) if ((this.queue[i].priority ?? 0) < (this.queue[lowIdx].priority ?? 0)) lowIdx = i;
      if ((m.priority ?? 0) > (this.queue[lowIdx].priority ?? 0)) this.queue.splice(lowIdx, 1); else return;
    }
    this.queue.push(m);
    // Dedupe-Marker ERST nach erfolgreicher Einreihung setzen (sonst „vergiftet"
    // ein verworfener Moment den Schlüssel) + abgelaufene Einträge prunen (Leak).
    this.recent.set(key, now);
    if (this.dedupeMs) for (const [k, ts] of this.recent) if (now - ts > this.dedupeMs) this.recent.delete(k);
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
    const badge = BADGE[m.type] || '✨';
    const showAv = this.p.showAvatar !== false && m.user?.profilePic;
    if (showAv) {
      // Profilbild groß mit Anlass-Icon (👑/🏆/💀…) als Ecken-Badge. src als
      // DOM-Property (kein innerHTML) → keine XSS-Fläche über die Bild-URL.
      const wrap = document.createElement('div');
      wrap.className = 'bx-as-av-wrap';
      const img = document.createElement('img');
      img.className = 'bx-as-av';
      img.src = m.user.profilePic;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { wrap.classList.add('noimg'); wrap.setAttribute('data-badge', badge); };
      const bdg = document.createElement('span');
      bdg.className = 'bx-as-av-badge';
      bdg.textContent = badge;
      wrap.append(img, bdg);
      head.appendChild(wrap);
    } else {
      const b = document.createElement('div');
      b.className = 'bx-as-badge';
      b.textContent = badge;
      head.appendChild(b);
    }
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
      for (const [k, v] of Object.entries(m.stats)) {
        const chip = document.createElement('span');
        chip.className = 'bx-as-chip';
        const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = STAT_ICON[k] || '•';
        const val = document.createElement('b'); val.textContent = fmtNum(v);
        const lbl = document.createElement('span'); lbl.textContent = k;
        chip.append(ic, val, lbl);
        st.appendChild(chip);
      }
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

  destroy() { clearTimeout(this._t); clearTimeout(this._previewT); this.queue = []; this.recent.clear(); }
}
