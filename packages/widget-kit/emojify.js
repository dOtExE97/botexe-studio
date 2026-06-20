// emojify.js — Jedes Emoji, das Zuschauer in den Chat schreiben, fliegt animiert
// über den Bildschirm. Transparent, deckt nichts zu. Cap gegen Chat-Fluten.
// props: { max?, size?, style?: 'float'|'cross'|'fall', accent?, theme? }
const STYLE_ID = 'bx-em-style';
const CSS = `
.bx-em { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
.bx-em-e { position:absolute; line-height:1; opacity:0;
  filter: drop-shadow(0 3px 6px rgba(0,0,0,.45)); }
/* float: vom unteren Rand aufsteigen + seitlich driften (TikTok-Standard) */
.bx-em-e.float { bottom:-10%; animation: bx-em-float var(--dur,5s) ease-out forwards; }
@keyframes bx-em-float {
  0%   { opacity:0; transform: translate(0,0) scale(.4) rotate(0); }
  12%  { opacity:1; transform: translate(calc(var(--drift) * .2), -12vh) scale(var(--scale,1)); }
  100% { opacity:0; transform: translate(var(--drift), -112vh) scale(var(--scale,1)) rotate(var(--rot,0deg)); }
}
/* cross: quer über den Schirm gleiten */
.bx-em-e.cross { animation: bx-em-cross var(--dur,6s) linear forwards; }
@keyframes bx-em-cross {
  0%   { opacity:0; transform: translateX(0) translateY(0) scale(.5) rotate(0); }
  10%  { opacity:1; }
  90%  { opacity:1; }
  100% { opacity:0; transform: translateX(var(--cross,110vw)) translateY(var(--bob,0px)) scale(var(--scale,1)) rotate(var(--rot,0deg)); }
}
/* fall: von oben herabregnen */
.bx-em-e.fall { top:-10%; animation: bx-em-fall var(--dur,5s) ease-in forwards; }
@keyframes bx-em-fall {
  0%   { opacity:0; transform: translate(0,0) scale(.5) rotate(0); }
  10%  { opacity:1; }
  100% { opacity:0; transform: translate(var(--drift), 112vh) scale(var(--scale,1)) rotate(var(--rot,0deg)); }
}
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['float', 'cross', 'fall']);

/** Emojis grapheme-korrekt aus Text ziehen (Hautton/ZWJ/Flaggen bleiben eins). */
export function extractEmojis(text, max = 12) {
  const out = [];
  const s = String(text ?? '');
  if (!s) return out;
  const isEmoji = (seg) => /\p{Extended_Pictographic}/u.test(seg) || /\p{Regional_Indicator}/u.test(seg);
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s)) {
      if (isEmoji(segment)) { out.push(segment); if (out.length >= max) break; }
    }
  } else {
    const m = s.match(/\p{Extended_Pictographic}/gu);
    if (m) for (const e of m) { out.push(e); if (out.length >= max) break; }
  }
  return out;
}

export default class Emojify {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(20, Math.max(1, Number(props.max ?? 6)));
    this.size = Math.min(120, Math.max(20, Number(props.size ?? 52)));
    this.style = STYLES.has(props.style) ? props.style : 'float';
    this.el = document.createElement('div');
    this.el.className = 'bx-em';
    root.appendChild(this.el);
    this.live = 0;
    this.timers = new Set();
  }

  onEvent(event) {
    if (event.type !== 'chat' || !event.text) return;
    const emojis = extractEmojis(event.text, this.max);
    emojis.forEach((emo, i) => {
      const t = setTimeout(() => { this.timers.delete(t); this.spawn(emo); }, i * 110);
      this.timers.add(t);
    });
  }

  spawn(emoji) {
    if (this.live > 80) return; // Chat-Fluten-Cap (TTLS-schonend)
    const e = document.createElement('div');
    e.className = `bx-em-e ${this.style}`;
    e.textContent = emoji;
    const scale = 0.8 + Math.random() * 0.6;
    e.style.fontSize = `${this.size}px`;
    e.style.setProperty('--scale', scale.toFixed(2));
    e.style.setProperty('--rot', `${(Math.random() - 0.5) * 80}deg`);
    e.style.setProperty('--dur', `${4 + Math.random() * 3}s`);
    if (this.style === 'cross') {
      const fromLeft = Math.random() < 0.5;
      e.style.left = fromLeft ? '-10%' : 'auto';
      e.style.right = fromLeft ? 'auto' : '-10%';
      e.style.top = `${10 + Math.random() * 75}%`;
      e.style.setProperty('--cross', `${fromLeft ? 120 : -120}vw`);
      e.style.setProperty('--bob', `${(Math.random() - 0.5) * 120}px`);
    } else if (this.style === 'fall') {
      e.style.left = `${5 + Math.random() * 90}%`;
      e.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    } else {
      e.style.left = `${5 + Math.random() * 90}%`;
      e.style.setProperty('--drift', `${(Math.random() - 0.5) * 220}px`);
    }
    this.el.appendChild(e);
    this.live++;
    const t = setTimeout(() => { this.timers.delete(t); e.remove(); this.live--; }, 7500);
    this.timers.add(t);
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
  }
}
