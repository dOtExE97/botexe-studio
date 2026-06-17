// command-carousel.js — durchlaufende Sticker-Leiste, die den Zuschauern zeigt,
// welche GESCHENKE welche Aktion auslösen (TikTok-Sticker-Look: bunte Kacheln mit
// echtem Gift-Bild + dicker weißer Outline-Schrift). Reines Anzeige-Widget.
// props: { items?, speed?, style?: 'sticker'|'glas'|'neon', accent?, theme? }
//   items: "rose::!feuer | heart::Liebe | gg::GG"  (Gift-Slug :: Text, mit | getrennt)
//   Legacy (weiter unterstützt): "🔥 !feuer | 🎵 Musik"  (führendes Emoji + Text)
const STYLE_ID = 'bx-cc-style';
const CSS = `
.bx-cc { position:absolute; inset:0; display:flex; align-items:center; overflow:hidden; font-family: var(--bx-font-body); }
.bx-cc-track { display:inline-flex; align-items:center; gap:14px; white-space:nowrap; will-change:transform;
  animation: bx-cc-scroll var(--dur,22s) linear infinite; padding:0 7px; }
@keyframes bx-cc-scroll { to { transform: translateX(-50%); } }
.bx-cc-chip { display:inline-flex; align-items:center; gap:9px; padding:9px 18px; border-radius:16px;
  font-family: var(--bx-font-display); font-size: clamp(15px,6cqmin,26px); text-transform:uppercase; letter-spacing:.02em; flex:none; }
.bx-cc-emo { font-size:1.25em; line-height:1; -webkit-text-stroke:0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.4)); }
.bx-cc-gift { width:1.5em; height:1.5em; object-fit:contain; flex:none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
/* Gift-Bild kommt async aus dem Katalog — bis dahin (oder wenn unbekannt) nicht anzeigen. */
.bx-cc-gift:not([src]) { display:none; }
/* — sticker: bunte 3D-Kachel + dicke weiße Outline (TikFinity-Look) — */
.bx-st-sticker .bx-cc-chip { color:#fff; -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill;
  box-shadow: 0 6px 0 rgba(0,0,0,.25), 0 8px 18px -6px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.35);
  border: 2px solid rgba(255,255,255,.5); }
.bx-st-glas .bx-cc-chip { color: var(--bx-text,#fff); background: var(--bx-glass);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border:1px solid color-mix(in srgb, var(--bx-accent) 35%, transparent); box-shadow: var(--bx-shadow); }
.bx-st-neon .bx-cc-chip { color:#fff; background: rgba(8,9,14,.55); border:1.5px solid var(--bx-accent);
  box-shadow: 0 0 16px -3px var(--bx-accent); text-shadow:0 0 10px var(--bx-accent); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['sticker', 'glas', 'neon']);
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

const GRADIENTS = [
  'linear-gradient(160deg,#ff6a3d,#ff2e63)',
  'linear-gradient(160deg,#7c5cff,#4f8cff)',
  'linear-gradient(160deg,#21d4a8,#0fb5d6)',
  'linear-gradient(160deg,#ffd23e,#ff9d2e)',
  'linear-gradient(160deg,#ff5e8a,#c44bff)',
  'linear-gradient(160deg,#3ddc84,#1aa3a3)',
];

/** "rose::!feuer | 🔥 Legacy" → [{slug, emoji, label}].
 *  Neues Format: "slug::Text". Legacy: führendes Emoji + Text. Sonst: nur Text. */
export function parseItems(raw) {
  return String(raw || '')
    .split('|').map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      const sep = s.indexOf('::');
      if (sep >= 0) return { slug: s.slice(0, sep).trim(), emoji: '', label: s.slice(sep + 2).trim() };
      const m = /^(\p{Extended_Pictographic}(?:️)?)\s*(.*)$/u.exec(s);
      if (m && m[2]) return { slug: '', emoji: m[1], label: m[2] };
      return { slug: '', emoji: '', label: s };
    });
}

export default class CommandCarousel {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.icons = {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    const items = parseItems(props.items ?? 'rose::!feuer | heart::Liebe | gg::GG');
    const list = items.length ? items : [{ slug: '', emoji: '⭐', label: 'Befehle' }];
    const style = STYLES.has(props.style) ? props.style : 'sticker';
    const speed = Math.max(6, Number(props.speed ?? 26));

    this.el = document.createElement('div');
    this.el.className = `bx-cc bx-st-${style}`;
    const chip = (it, i) => {
      const grad = style === 'sticker' ? ` style="background:${GRADIENTS[i % GRADIENTS.length]}"` : '';
      let lead = '';
      if (it.slug) lead = `<img class="bx-cc-gift" data-slug="${escapeHtml(it.slug.toLowerCase())}" alt="">`;
      else if (it.emoji) lead = `<span class="bx-cc-emo">${it.emoji}</span>`;
      const lbl = it.label ? `<span>${escapeHtml(it.label)}</span>` : '';
      return `<span class="bx-cc-chip"${grad}>${lead}${lbl}</span>`;
    };
    const seq = list.map(chip).join('');
    this.el.innerHTML = `<div class="bx-cc-track" style="--dur:${speed}s">${seq}${seq}</div>`;
    root.appendChild(this.el);

    // Gift-Bilder async aus dem App-Katalog nachladen (wie bingo.js).
    if (this.ctx.baseUrl && list.some((it) => it.slug)) {
      fetch(`${this.ctx.baseUrl}/gift-catalog?token=${this.ctx.token}`)
        .then((r) => r.json())
        .then((cat) => {
          for (const [slug, e] of Object.entries(cat || {})) if (e && e.icon) this.icons[String(slug).toLowerCase()] = e.icon;
          this.applyIcons();
        })
        .catch(() => {});
    }
  }

  applyIcons() {
    for (const img of this.el.querySelectorAll('img.bx-cc-gift')) {
      const url = this.icons[img.dataset.slug];
      if (url) img.src = url;
    }
  }

  destroy() { this.el.remove(); }
}
