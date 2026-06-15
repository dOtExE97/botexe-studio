// social-rotator.js — rotierende „Follow"-Pille, die nacheinander deine Social-
// Kanäle bewirbt (TikTok/Instagram/YouTube/Discord/Twitch/X/Kick …). Jeder Kanal
// mit echtem Marken-Icon + Markenfarbe. Slide-/Fade-Rotation.
// props: { channels?, intervalMs?, follow?, style?: 'pill'|'glas'|'neon', accent?, theme? }
//   channels: "tiktok:dotexe_97 | instagram:@exe | discord:Link in Bio"

const STYLE_ID = 'bx-sr-style';

// Marken-Defs: Farbe (Button/Akzent), Textfarbe auf farbigem Button, SVG-Icon.
// Icons sind vereinfachte, erkennbare Glyphen (lokal, keine CDNs).
const PLATFORMS = {
  tiktok: { label: 'TikTok', color: '#111', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#010101"/><path d="M14.3 5.5c.3 1.7 1.5 3 3.2 3.2v2.3c-1.1 0-2.2-.3-3.1-.9v4.3a3.9 3.9 0 1 1-3.9-3.9c.2 0 .5 0 .7.1v2.4a1.6 1.6 0 1 0 1.1 1.5V5.5h2z" fill="#fff"/><path d="M13 5.5c.3 1.7 1.5 3 3.2 3.2" fill="none" stroke="#25f4ee" stroke-width="0"/>` },
  instagram: { label: 'Instagram', color: '#e1306c', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="url(#bxig)"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.3" fill="#fff"/><defs><linearGradient id="bxig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f9ce34"/><stop offset=".5" stop-color="#ee2a7b"/><stop offset="1" stop-color="#6228d7"/></linearGradient></defs>` },
  youtube: { label: 'YouTube', color: '#ff0000', fg: '#fff',
    icon: `<rect x="2" y="5.5" width="20" height="13" rx="4" fill="#ff0000"/><polygon points="10,9 16,12 10,15" fill="#fff"/>` },
  discord: { label: 'Discord', color: '#5865f2', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#5865f2"/><ellipse cx="9.2" cy="13" rx="1.4" ry="1.7" fill="#fff"/><ellipse cx="14.8" cy="13" rx="1.4" ry="1.7" fill="#fff"/><path d="M7 9.5c3.3-1.5 6.7-1.5 10 0" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>` },
  twitch: { label: 'Twitch', color: '#9146ff', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#9146ff"/><path d="M7 6h10v6.5l-3 3h-2.5l-2 2V15.5H7z" fill="#fff"/><rect x="11.3" y="8.3" width="1.5" height="3.4" fill="#9146ff"/><rect x="14.2" y="8.3" width="1.5" height="3.4" fill="#9146ff"/>` },
  x: { label: 'X', color: '#000', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#000"/><path d="M7 6.5l4.2 5.3L7.2 17.5h1.7l3.1-3.9 3 3.9H17l-4.4-5.7L16.5 6.5h-1.7l-2.7 3.4-2.6-3.4z" fill="#fff"/>` },
  kick: { label: 'Kick', color: '#53fc18', fg: '#0a0b10',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#53fc18"/><path d="M8 6h2.4v3.3L13 6h2.9l-3.4 4.1 3.6 4.4H13l-2.6-3.4V18H8z" fill="#0a0b10"/>` },
  snapchat: { label: 'Snapchat', color: '#fffc00', fg: '#0a0b10',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#fffc00"/><path d="M12 5.5c2.1 0 3.3 1.6 3.3 3.7 0 .8 0 1.3.2 1.6.2.3.7.3 1.1.5.3.1.5.3.5.6 0 .5-.9.7-1.5.9-.3.6.2 1.5-.7 1.6-.6 0-.9-.4-1.6-.2-.6.2-1 1.1-2.5 1.1s-1.9-.9-2.5-1.1c-.7-.2-1 .2-1.6.2-.9-.1-.4-1-.7-1.6-.6-.2-1.5-.4-1.5-.9 0-.3.2-.5.5-.6.4-.2.9-.2 1.1-.5.2-.3.2-.8.2-1.6 0-2.1 1.2-3.7 3.3-3.7z" fill="#0a0b10"/>` },
  facebook: { label: 'Facebook', color: '#1877f2', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="#1877f2"/><path d="M13.4 19v-6h2l.3-2.4h-2.3V9c0-.7.2-1.2 1.2-1.2h1.2V5.6c-.6-.1-1.3-.1-2-.1-2 0-3.3 1.2-3.3 3.4v1.7H8.4V13h2.1v6z" fill="#fff"/>` },
  link: { label: 'Link', color: 'var(--bx-accent,#ff5436)', fg: '#fff',
    icon: `<rect x="2" y="2" width="20" height="20" rx="6" fill="var(--bx-accent,#ff5436)"/><path d="M10 14a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.8.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.8-.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` },
};

const CSS = `
.bx-sr { position:absolute; inset:0; display:flex; align-items:center; justify-content:flex-start; font-family: var(--bx-font-body); overflow:hidden; }
.bx-sr-pill { display:flex; align-items:center; gap:12px; padding:8px 8px 8px 10px; border-radius:999px; max-width:100%;
  opacity:0; transform: translateX(-24px) scale(.92); }
.bx-sr.show .bx-sr-pill { animation: bx-sr-in 520ms cubic-bezier(.2,1.3,.35,1) forwards; }
.bx-sr.hide .bx-sr-pill { animation: bx-sr-out 420ms cubic-bezier(.5,0,.7,0) forwards; }
@keyframes bx-sr-in { 0%{opacity:0; transform:translateX(-24px) scale(.92)} 100%{opacity:1; transform:none} }
@keyframes bx-sr-out { 0%{opacity:1; transform:none} 100%{opacity:0; transform:translateX(24px) scale(.92)} }
.bx-sr-ico { width: clamp(34px,12cqmin,52px); height: clamp(34px,12cqmin,52px); flex:none; }
.bx-sr-ico svg { width:100%; height:100%; display:block; border-radius:28%; box-shadow:0 3px 8px rgba(0,0,0,.35); }
.bx-sr-txt { display:flex; flex-direction:column; min-width:0; }
.bx-sr-plat { font-family: var(--bx-font-display); font-size: clamp(10px,3.4cqmin,14px); letter-spacing:.12em; text-transform:uppercase; opacity:.7; }
.bx-sr-name { font-family: var(--bx-font-display); font-size: clamp(15px,5.4cqmin,26px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.05; }
.bx-sr-btn { margin-left:6px; flex:none; display:flex; align-items:center; gap:5px; padding:7px 15px; border-radius:999px;
  font-family: var(--bx-font-display); font-size: clamp(12px,4cqmin,17px); white-space:nowrap; }
.bx-sr-btn svg { width:1em; height:1em; }
/* — Style: pill (TikFinity-Look: helle Pille, Marken-Follow-Button) — */
.bx-st-pill .bx-sr-pill { background:#fff; box-shadow:0 10px 30px -8px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.05); }
.bx-st-pill .bx-sr-plat { color:#8a8f9c; }
.bx-st-pill .bx-sr-name { color:#15171f; }
.bx-st-pill .bx-sr-btn { color:#fff; }
/* — Style: glas (unser Glas-Look) — */
.bx-st-glas .bx-sr-pill { background: var(--bx-glass); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  box-shadow: var(--bx-shadow), 0 0 30px -12px var(--bx-accent); }
.bx-st-glas .bx-sr-plat { color: var(--bx-muted); }
.bx-st-glas .bx-sr-name { color: var(--bx-text,#fff); }
.bx-st-glas .bx-sr-btn { color:#fff; }
/* — Style: neon (transparent + Akzent-Glow) — */
.bx-st-neon .bx-sr-pill { background: rgba(8,9,14,.55); border:1.5px solid var(--bx-accent); box-shadow:0 0 22px -4px var(--bx-accent); }
.bx-st-neon .bx-sr-plat { color: var(--bx-muted); }
.bx-st-neon .bx-sr-name { color:#fff; text-shadow:0 0 10px var(--bx-accent); }
.bx-st-neon .bx-sr-btn { color:#fff; }
`;

function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['pill', 'glas', 'neon']);
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/** "tiktok:dotexe_97 | instagram:@exe" → [{platform,text}]. Unbekannt → 'link'. */
export function parseChannels(raw) {
  return String(raw || '')
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const i = part.indexOf(':');
      if (i === -1) return { platform: 'link', text: part };
      const key = part.slice(0, i).trim().toLowerCase();
      const text = part.slice(i + 1).trim();
      return { platform: PLATFORMS[key] ? key : 'link', text: text || part };
    });
}

const HEART = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.6-9.4-8.6C1 9.5 2.4 6 5.7 6c2 0 3.2 1.2 3.8 2.2C10.1 7.2 11.3 6 13.3 6c3.3 0 4.7 3.5 3.1 6.4C19 16.4 12 21 12 21z"/></svg>';

export default class SocialRotator {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.channels = parseChannels(props.channels ?? 'tiktok:dein_name | instagram:dein_name | discord:Link in Bio');
    if (!this.channels.length) this.channels = [{ platform: 'link', text: 'Link in Bio' }];
    this.intervalMs = Math.max(2000, Number(props.intervalMs ?? 6000));
    this.followLabel = props.follow ?? 'Folgen';
    const style = STYLES.has(props.style) ? props.style : 'pill';
    this.idx = -1;

    this.el = document.createElement('div');
    this.el.className = `bx-sr bx-st-${style}`;
    this.el.innerHTML = `<div class="bx-sr-pill">
      <div class="bx-sr-ico"></div>
      <div class="bx-sr-txt"><span class="bx-sr-plat"></span><span class="bx-sr-name"></span></div>
      <div class="bx-sr-btn"></div></div>`;
    this.pill = this.el.querySelector('.bx-sr-pill');
    root.appendChild(this.el);
    this.cycle = this.cycle.bind(this);
    this.cycle();
  }

  render(ch) {
    const def = PLATFORMS[ch.platform] || PLATFORMS.link;
    this.el.querySelector('.bx-sr-ico').innerHTML = `<svg viewBox="0 0 24 24">${def.icon}</svg>`;
    this.el.querySelector('.bx-sr-plat').textContent = def.label;
    this.el.querySelector('.bx-sr-name').textContent = ch.text;
    const btn = this.el.querySelector('.bx-sr-btn');
    btn.innerHTML = `${HEART}<span>${escapeHtml(this.followLabel)}</span>`;
    btn.style.background = def.color;
    btn.style.color = def.fg;
  }

  cycle() {
    this.idx = (this.idx + 1) % this.channels.length;
    this.render(this.channels[this.idx]);
    this.el.classList.remove('hide');
    void this.pill.offsetWidth; // reflow → Animation neu starten
    this.el.classList.add('show');
    // anzeigen, dann ausblenden, dann nächster
    this.showT = setTimeout(() => {
      this.el.classList.remove('show');
      this.el.classList.add('hide');
      this.nextT = setTimeout(this.cycle, 440);
    }, this.intervalMs);
  }

  destroy() { clearTimeout(this.showT); clearTimeout(this.nextT); this.el.remove(); }
}
