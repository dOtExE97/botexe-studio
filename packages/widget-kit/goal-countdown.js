// goal-countdown.js — cooler Text-Countdown auf ein Ziel (TikFinity-Style):
// „Noch 50.000 Likes bis zum Ziel!". Pro Metrik (Likes/Follower/Shares/Gifts/
// Coins/Zuschauer). Bei Erreichen: nächstes Ziel (raise) oder stehenbleiben (keep).
// props: { metric?, target?, template?, doneText?, onReach?: 'raise'|'keep',
//          label?, accent?, theme?, fontFamily?, fontScale?, textColor? }
const STYLE_ID = 'bx-gcd-style';
const LABELS = { likes: 'Likes', follows: 'Follower', shares: 'Shares', gifts: 'Geschenke', coins: 'Coins', viewers: 'Zuschauer' };
const METRICS = Object.keys(LABELS);
const CSS = `
.bx-gcd { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center;
  font-family: var(--bx-font-display); container-type:size; padding:6px 12px; }
.bx-gcd-text { font-size: clamp(14px, 11cqmin, 56px); line-height:1.08; color: var(--bx-text,#fff);
  text-transform:uppercase; -webkit-text-stroke: 3px var(--bx-ink,#0a0b12); paint-order: stroke fill;
  text-shadow: 0 3px 0 rgba(0,0,0,.3), 0 0 18px color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-gcd-n { color: var(--bx-accent); }
.bx-gcd.done .bx-gcd-text, .bx-gcd.done .bx-gcd-n { color: var(--bx-teal); }
.bx-gcd.pop { animation: bx-gcd-pop 380ms cubic-bezier(.2,1.5,.35,1); }
@keyframes bx-gcd-pop { 0%{transform:scale(1)} 45%{transform:scale(1.07)} 100%{transform:scale(1)} }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function fmtNum(n) { return Number(n).toLocaleString('de-DE'); }

/** Reine View-Logik: liefert {done, html} für den Countdown-Text. Platzhalter
 *  {n}=verbleibend, {label}=Metrik-Name, {target}=Ziel. Testbar, DOM-frei. */
export function goalCountdownView(cur, target, template, label, doneText) {
  const remaining = Math.max(0, Math.floor(target - cur));
  if (remaining <= 0) return { done: true, html: escapeHtml(doneText) };
  const html = escapeHtml(template)
    .replace('{n}', `<span class="bx-gcd-n">${fmtNum(remaining)}</span>`)
    .replace('{label}', escapeHtml(label))
    .replace('{target}', fmtNum(target));
  return { done: false, html };
}

export default class GoalCountdown {
  constructor(root, props) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.metric = METRICS.includes(props.metric) ? props.metric : 'likes';
    this.step = Math.max(1, Math.floor(Number(props.target ?? 1000))) || 1000;
    this.target = this.step;
    this.label = props.label || LABELS[this.metric];
    this.template = String(props.template || 'Noch {n} {label} bis zum Ziel!');
    this.doneText = String(props.doneText || 'Ziel erreicht! 🎉');
    this.onReach = props.onReach === 'keep' ? 'keep' : 'raise';
    this.cur = 0;

    this.el = document.createElement('div');
    this.el.className = 'bx-gcd';
    this.el.innerHTML = '<div class="bx-gcd-text"></div>';
    this.textEl = this.el.querySelector('.bx-gcd-text');
    root.appendChild(this.el);
    this.render(false);
  }

  onStats(stats) {
    const cur = Number(stats?.totals?.[this.metric] ?? 0);
    if (cur === this.cur) return;
    const grew = cur > this.cur;
    this.cur = cur;
    // Ziel erreicht → bei „raise" auf die nächste Schwelle ziehen (Combo-Sprünge
    // mehrfach), bei „keep" stehenbleiben (zeigt „Ziel erreicht").
    if (this.onReach === 'raise') {
      while (this.cur >= this.target) this.target += this.step;
    }
    this.render(grew);
  }

  render(animate) {
    const v = goalCountdownView(this.cur, this.target, this.template, this.label, this.doneText);
    this.textEl.innerHTML = v.html;
    this.el.classList.toggle('done', v.done);
    if (animate) { this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop'); }
  }

  onReset() { this.cur = 0; this.target = this.step; this.render(false); }
  destroy() { this.el.remove(); }
}
