// goal-countdown.js — cooler Text-Countdown auf ein Ziel (TikFinity-Style):
// „Noch 50.000 Likes bis zum Ziel!". Pro Metrik (Likes/Follower/Shares/Gifts/
// Coins/Zuschauer). Bei Erreichen: nächstes Ziel (raise) oder stehenbleiben (keep).
// props: { metric?, target?, template?, doneText?, onReach?: 'raise'|'keep',
//          label?, accent?, theme?, fontFamily?, fontScale?, textColor? }
const STYLE_ID = 'bx-gcd-style';
const LABELS = { likes: 'Likes', follows: 'Follower', shares: 'Shares', gifts: 'Geschenke', coins: 'Coins', viewers: 'Zuschauer', uniqueViewers: 'Zuschauer gesamt' };
const METRICS = Object.keys(LABELS);
const CSS = `
/* --u = „1px bei Standardgröße" (760×130). Vorher stand hier cqmin — das misst
   die KURZE Seite, in einer 760×130-Box also die Höhe: 11cqmin waren ~14px und
   die Zeile verlor sich in der Fläche. Jetzt bestimmt die Breite die Größe
   (cqi), gedeckelt durch die Höhe (cqh), damit nichts überläuft. */
.bx-gcd { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center;
  font-family: var(--bx-font-display); container-type:size; --u: calc((min(0.1316cqi, 0.769cqh)) * var(--bx-fs, 1));
  padding: 0.8% 1.6%; }
.bx-gcd-text { font-size: clamp(12px, calc(var(--u) * 46), 200px); line-height:1.08; color: var(--bx-text,#fff);
  overflow-wrap: anywhere;
  text-transform:uppercase; -webkit-text-stroke: 3px var(--bx-ink,#0a0b12); paint-order: stroke fill;
  text-shadow: 0 3px 0 rgba(0,0,0,.3), 0 0 18px color-mix(in srgb, var(--bx-accent) 45%, transparent); }
.bx-gcd-n { color: var(--bx-accent); }
.bx-gcd.done .bx-gcd-text, .bx-gcd.done .bx-gcd-n { color: var(--bx-teal); }
.bx-gcd.pop { animation: bx-gcd-pop 380ms cubic-bezier(.2,1.5,.35,1); }
@keyframes bx-gcd-pop { 0%{transform:scale(1)} 45%{transform:scale(1.07)} 100%{transform:scale(1)} }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   der Text hat bereits eine Kontur — hier reicht ein kräftigerer Schatten.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-gcd-text { text-shadow: 0 3px 10px rgba(0,0,0,.6); }
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
    // Sicherheitsnetz zur CSS-Skalierung: sehr lange Vorlagen dürfen die Box
    // nicht sprengen. Nach jedem Render und bei jeder Größenänderung anpassen.
    try {
      this.observer = new ResizeObserver(() => this.fit());
      this.observer.observe(root);
    } catch { /* alte Engine ohne ResizeObserver → CSS reicht */ }
    this.render(false);
  }

  /** Verkleinert die Schrift so lange, bis der Text in die Höhe passt
   *  (Umbruch fängt die Breite bereits ab). Vergrößern macht das CSS. */
  fit() {
    const t = this.textEl;
    if (!t) return;
    t.style.fontSize = '';
    const maxH = this.el.clientHeight - 4;
    if (maxH <= 0) return;
    let size = parseFloat(getComputedStyle(t).fontSize) || 0;
    for (let i = 0; i < 16 && size > 8 && t.scrollHeight > maxH; i++) {
      size *= 0.9;
      t.style.fontSize = `${size}px`;
    }
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
    this.fit();
    if (animate) { this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop'); }
  }

  onReset() { this.cur = 0; this.target = this.step; this.render(false); }
  destroy() { if (this.observer) { this.observer.disconnect(); this.observer = null; } this.el.remove(); }
}
