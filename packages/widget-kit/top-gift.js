// top-gift.js — Highlight des größten Einzel-Gifts der Session. Glas-Karte,
// Gift-Bild + Spender, Bounce bei neuem Rekord. props: { accent?, title? }
const STYLE_ID = 'bx-tg-style';
// --u = „1px bei Standardgröße" (320×320): alle Größen sind Vielfache davon,
// damit Schrift/Gift-Bild mitwachsen, wenn das Widget größer gezogen wird.
// min(cqi, cqh) verhindert Überlauf in schmalen bzw. flachen Boxen.
const CSS = `
.bx-tg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  container-type: size; --u: min(0.3125cqi, 0.3125cqh);
  font-family: var(--bx-font-body); padding: 4.4%; text-align: center; background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); overflow: hidden; }
.bx-tg::before { content:''; position:absolute; inset:0; border-radius:inherit; padding:1.5px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bx-accent) 80%, white), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events:none; }
.bx-tg-kicker { font-family: var(--bx-font-display); font-size: clamp(9px, calc(var(--u) * 12), 40px); letter-spacing: .42em; text-transform: uppercase; color: var(--bx-gold);
  text-shadow: 0 1px 3px rgba(0,0,0,.75); }
.bx-tg-img { height: clamp(28px, calc(var(--u) * 64), 220px); margin: calc(var(--u) * 8) 0 calc(var(--u) * 4); filter: drop-shadow(0 6px 14px rgba(0,0,0,.5)); animation: bx-float 2.8s ease-in-out infinite; }
.bx-tg-svg { width: clamp(26px, calc(var(--u) * 58), 200px); height: clamp(26px, calc(var(--u) * 58), 200px); margin: calc(var(--u) * 6) 0; color: var(--bx-gold);
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--bx-gold) 55%, transparent)) drop-shadow(0 5px 12px rgba(0,0,0,.5));
  animation: bx-float 2.8s ease-in-out infinite; }
.bx-tg-svg svg { width: 100%; height: 100%; display: block; }
.bx-tg-gift { font-family: var(--bx-font-display); font-size: clamp(13px, calc(var(--u) * 22), 76px); text-transform: uppercase; color: var(--bx-text,#fff); text-shadow: 0 2px 8px rgba(0,0,0,.6); }
.bx-tg-by { display: flex; align-items: center; justify-content: center; gap: calc(var(--u) * 7); font-size: clamp(10px, calc(var(--u) * 14), 48px);
  color: #cfd5e6; text-shadow: 0 1px 3px rgba(0,0,0,.8); margin-top: calc(var(--u) * 5); }
.bx-tg-by b { color: var(--bx-accent); font-family: var(--bx-font-display); }
.bx-tg-av { width: calc(var(--u) * 26); height: calc(var(--u) * 26); border-radius: 50%; object-fit: cover;
  border: 2px solid color-mix(in srgb, var(--bx-accent) 70%, transparent); box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.bx-tg-coins { margin-top: calc(var(--u) * 6); font-family: var(--bx-font-mono); font-weight: 700; font-size: clamp(13px, calc(var(--u) * 22), 76px); color: var(--bx-gold);
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-gold) 50%, transparent); }
.bx-tg.bounce { animation: bx-tg-bounce 600ms cubic-bezier(.2,1.6,.4,1); }
@keyframes bx-tg-bounce { 0%,100% { transform: scale(1); } 40% { transform: scale(1.07); } }
.bx-tg-empty { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 12);
  font-size: clamp(10px, calc(var(--u) * 13), 44px); letter-spacing: .2em; color: #c6ccdd; text-shadow: 0 1px 3px rgba(0,0,0,.8); text-transform: uppercase; }
.bx-tg-empty .bx-tg-svg { width: clamp(22px, calc(var(--u) * 46), 160px); height: clamp(22px, calc(var(--u) * 46), 160px); margin: 0; opacity: .6; color: #c6ccdd;
  filter: drop-shadow(0 3px 8px rgba(0,0,0,.4)); animation: none; }
/* — Sticker-Variante (TikFinity-Look): kein Panel, dicke weiße Outline, großes Gift — */
.bx-tg.st-sticker { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-tg.st-sticker::before { display: none; }
.bx-tg.st-sticker .bx-tg-img { height: clamp(40px, calc(var(--u) * 96), 320px); }
.bx-tg.st-sticker .bx-tg-kicker { color: #fff; -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
.bx-tg.st-sticker .bx-tg-gift { color: #fff; font-size: clamp(15px, calc(var(--u) * 27), 92px); -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 3px 6px rgba(0,0,0,.5); }
.bx-tg.st-sticker .bx-tg-coins { font-family: var(--bx-font-display); -webkit-text-stroke: 2.5px #0a0b12; paint-order: stroke fill; }
.bx-tg.st-sticker .bx-tg-by { color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.7); }
.bx-tg.st-sticker .bx-tg-by b { -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }

/* ── PODEST — Siegertreppe im Spotlight: ein Lichtkegel fällt von oben auf das
   Gift, unten trägt ein goldenes Siegerpodest Spender und Coins. Der Kegel
   füllt jede Höhe, das Podest klebt am unteren Rand — dadurch wirken hohe
   Boxen gefüllt statt leer (die zentrierte Karte ließ dort Luft).
   Alle Deko steckt in Pseudo-Elementen der Wurzel, die per overflow:hidden
   ohnehin auf die Box beschnitten ist — nur echte Kinder können überlaufen. */
.bx-tg.bx-tg-podest { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  justify-content: flex-end; padding: calc(var(--u) * 10) 0 0; }
.bx-tg.bx-tg-podest::before { display: none; }
.bx-tg.bx-tg-podest::after { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bx-gold) 46%, transparent), color-mix(in srgb, var(--bx-gold) 8%, transparent) 62%, transparent 88%);
  -webkit-clip-path: polygon(40% 0, 60% 0, 104% 100%, -4% 100%); clip-path: polygon(40% 0, 60% 0, 104% 100%, -4% 100%); }
.bx-tg-podest > * { position: relative; z-index: 1; }
.bx-tg-podest .bx-tg-kicker { margin-bottom: auto; padding: 0 calc(var(--u) * 10); color: #fff;
  -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; }
/* dunkler Saum ums Gift: der Lichtkegel ist auf hellen Szenen fast weiß,
   goldenes Gift darauf hätte kaum Kontrast. */
.bx-tg-podest .bx-tg-svg, .bx-tg-podest .bx-tg-img { filter: drop-shadow(0 0 1.5px rgba(30,18,0,.95)) drop-shadow(0 calc(var(--u) * 6) calc(var(--u) * 9) rgba(0,0,0,.55)) drop-shadow(0 0 18px color-mix(in srgb, var(--bx-gold) 50%, transparent)); }
.bx-tg-podest .bx-tg-gift { padding: 0 calc(var(--u) * 10); color: #fff;
  -webkit-text-stroke: 3px #0a0b12; paint-order: stroke fill; text-shadow: 0 3px 6px rgba(0,0,0,.5); }
/* Deckplatte des Podests: nach unten breiter → Perspektive von schräg oben. */
.bx-tg-podest .bx-tg-by { width: 100%; box-sizing: border-box; margin: calc(var(--u) * 7) 0 0;
  padding: calc(var(--u) * 4) calc(var(--u) * 12); color: #3b2b06; text-shadow: 0 1px 0 rgba(255,255,255,.5);
  background: linear-gradient(180deg, #ffeeb4, #f2c94a);
  -webkit-clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%); clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%); }
.bx-tg-podest .bx-tg-by b { color: #241a02; }
.bx-tg-podest .bx-tg-av { border-color: rgba(60,42,4,.65); }
/* Podestkörper: dunkleres Gold, oben eine Lichtkante, wirft Schatten nach oben. */
.bx-tg-podest .bx-tg-coins { width: 100%; box-sizing: border-box; margin: 0; padding: calc(var(--u) * 5) calc(var(--u) * 6) calc(var(--u) * 7);
  background: linear-gradient(180deg, #edc047, #b8842b 70%, #8d631d);
  color: #2c1f03; text-shadow: 0 1px 0 rgba(255,255,255,.4);
  box-shadow: inset 0 2px 0 rgba(255,255,255,.45), 0 -10px 24px -10px rgba(0,0,0,.65); }
.bx-tg-podest .bx-tg-empty { color: #fff; -webkit-text-stroke: 1.5px #0a0b12; paint-order: stroke fill; margin-bottom: auto; }

/* ── VITRINE — Museumsstück hinter Glas: dunkler Schaukasten mit Messingrahmen,
   Spiegelung auf der Scheibe, unten ein graviertes Messingschild mit Gift,
   Spender und Coins. Bewusst ruhig/edel als Gegenpol zum lauten Sticker;
   das Schild bündelt die drei Textzeilen zu einem Block statt drei losen. */
.bx-tg.bx-tg-vitrine { background: linear-gradient(180deg, rgba(18,20,30,.86), rgba(6,7,12,.94));
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  box-shadow: var(--bx-shadow), inset 0 0 60px -14px rgba(0,0,0,.9); padding: calc(var(--u) * 12) calc(var(--u) * 12) calc(var(--u) * 10); }
.bx-tg.bx-tg-vitrine::before { background: linear-gradient(160deg, #f6dfa6, #8a6a2a 38%, #f0d79b 66%, #6b4f1d); padding: 2.5px; }
.bx-tg.bx-tg-vitrine::after { content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none; border-radius: inherit;
  background: linear-gradient(112deg, transparent 26%, rgba(255,255,255,.16) 34%, rgba(255,255,255,.04) 44%, transparent 50%),
    radial-gradient(120% 46% at 50% 96%, color-mix(in srgb, var(--bx-gold) 26%, transparent), transparent 70%); }
.bx-tg-vitrine > * { position: relative; z-index: 1; }
.bx-tg-vitrine .bx-tg-kicker { color: #e8cf92; letter-spacing: .32em; }
.bx-tg-vitrine .bx-tg-svg { color: #f0d79b; }
/* Messingschild: drei Zeilen, ein Blech — gleiche Grundfläche, keine Nähte. */
.bx-tg-vitrine .bx-tg-svg, .bx-tg-vitrine .bx-tg-img { margin-top: auto; margin-bottom: 0; }
.bx-tg-vitrine .bx-tg-gift, .bx-tg-vitrine .bx-tg-by, .bx-tg-vitrine .bx-tg-coins {
  width: 86%; box-sizing: border-box; margin: 0; background: #d9bd7c; color: #2a2109;
  text-shadow: 0 1px 0 rgba(255,255,255,.5); padding: 0 calc(var(--u) * 6); }
/* margin-top:auto → das Schild sitzt unten am Sockel, das Objekt schwebt darüber. */
.bx-tg-vitrine .bx-tg-gift { margin-top: auto; padding-top: calc(var(--u) * 4); border-radius: 3px 3px 0 0;
  box-shadow: inset 0 2px 0 rgba(255,255,255,.5); letter-spacing: .1em; font-size: clamp(12px, calc(var(--u) * 18), 62px); }
.bx-tg-vitrine .bx-tg-by { color: #4b3a11; }
.bx-tg-vitrine .bx-tg-by b { color: #2a2109; }
.bx-tg-vitrine .bx-tg-av { border-color: rgba(42,33,9,.55); }
.bx-tg-vitrine .bx-tg-coins { padding-bottom: calc(var(--u) * 5); border-radius: 0 0 3px 3px; color: #5d3f07;
  text-shadow: 0 1px 0 rgba(255,255,255,.45); box-shadow: inset 0 -2px 0 rgba(0,0,0,.2);
  font-size: clamp(12px, calc(var(--u) * 18), 62px); }
.bx-tg-vitrine .bx-tg-empty { color: #d6c79c; }

/* ── NEONSCHILD — Leuchtreklame: umlaufende Neonröhre in der Akzentfarbe auf
   dunkler Blende, Schrift mit Röhrenglühen und leichtem Flackern. Die dunkle
   Blende hält die Schrift auch auf hellen Szenen lesbar (Neon allein würde auf
   Weiß verschwinden). */
.bx-tg.bx-tg-neonschild { background: rgba(6,7,14,.62); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  border: 2.5px solid color-mix(in srgb, var(--bx-accent) 85%, white);
  box-shadow: 0 0 26px -4px color-mix(in srgb, var(--bx-accent) 70%, transparent),
    inset 0 0 22px -6px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 14px 30px -16px rgba(0,0,0,.9);
  animation: bx-tg-neon 7s steps(1, end) infinite; }
/* zweite, dünnere Röhre innen — erst die Doppellinie macht daraus ein Schild. */
.bx-tg.bx-tg-neonschild::before { inset: clamp(3px, calc(var(--u) * 7), 18px); padding: 0; background: none;
  -webkit-mask: none; mask: none; border: 1.5px solid color-mix(in srgb, var(--bx-accent) 55%, white);
  border-radius: calc(var(--bx-radius) * .7);
  box-shadow: 0 0 12px -2px color-mix(in srgb, var(--bx-accent) 65%, transparent); opacity: .75; }
@keyframes bx-tg-neon { 0%, 91%, 93%, 95%, 100% { opacity: 1; } 92%, 94% { opacity: .72; } }
.bx-tg-neonschild .bx-tg-kicker { color: color-mix(in srgb, var(--bx-accent) 60%, white);
  text-shadow: 0 0 8px var(--bx-accent), 0 0 18px color-mix(in srgb, var(--bx-accent) 70%, transparent); }
.bx-tg-neonschild .bx-tg-svg { color: color-mix(in srgb, var(--bx-accent) 55%, white);
  filter: drop-shadow(0 0 8px var(--bx-accent)) drop-shadow(0 0 20px color-mix(in srgb, var(--bx-accent) 70%, transparent)); }
.bx-tg-neonschild .bx-tg-gift { color: #fff;
  text-shadow: 0 0 6px #fff, 0 0 14px var(--bx-accent), 0 0 30px color-mix(in srgb, var(--bx-accent) 75%, transparent); }
.bx-tg-neonschild .bx-tg-by { color: #e6e9f5; text-shadow: 0 1px 4px rgba(0,0,0,.9); }
.bx-tg-neonschild .bx-tg-by b { color: color-mix(in srgb, var(--bx-accent) 45%, white); text-shadow: 0 0 10px var(--bx-accent); }
.bx-tg-neonschild .bx-tg-coins { color: #fff9d8;
  text-shadow: 0 0 6px #fff, 0 0 16px var(--bx-gold), 0 0 32px color-mix(in srgb, var(--bx-gold) 70%, transparent); }
.bx-tg-neonschild .bx-tg-empty { color: #dfe3f2; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
// Inline-SVG-Geschenk, eingefärbt via currentColor (Gold-Token + Glow / muted im Empty-State).
const GIFT_SVG = '<span class="bx-tg-svg"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg></span>';

export default class TopGift {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.title = props.title || 'Größtes Gift';
    this.max = 0;
    this.el = document.createElement('div');
    // „glas" (Standard) und „sticker" behalten ihre alten Klassen unverändert,
    // damit bestehende Overlays exakt gleich aussehen. Neue Stile folgen dem
    // Schema der anderen Widgets: bx-tg-<stil>.
    const style = ['glas', 'sticker', 'podest', 'vitrine', 'neonschild'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-tg${style === 'sticker' ? ' st-sticker' : style !== 'glas' ? ` bx-tg-${style}` : ''}`;
    this.el.innerHTML = `<div class="bx-tg-empty">${GIFT_SVG}<span>Noch kein Gift</span></div>`;
    root.appendChild(this.el);
    // Editor-Vorschau: Beispiel-Gift zeigen, damit man Größe/Position beurteilen
    // kann. max bleibt 0 → das erste echte Gift überschreibt die Demo sofort.
    if (ctx && ctx.preview) {
      this.render({ coins: 1000, slug: 'Galaxy', icon: '', nickname: 'Mia', avatar: '' });
      this.max = 0;
    }
  }
  onEvent(event) {
    if (event.type !== 'gift' || !event.gift) return;
    if (event.gift.totalCoins <= this.max) return;
    this.render({
      coins: event.gift.totalCoins,
      slug: event.gift.slug,
      icon: event.gift.icon,
      nickname: event.user?.nickname,
      avatar: event.user?.profilePic,
    });
  }
  // Nach Overlay-Reload aus den Session-Stats wiederherstellen (sonst leer).
  onStats(stats) {
    const t = stats?.topGift;
    if (!t || t.coins <= this.max) return;
    this.render({ coins: t.coins, slug: t.giftSlug, icon: t.giftIcon, nickname: t.nickname, avatar: t.profilePic });
  }
  render({ coins, slug, icon, nickname, avatar }) {
    this.max = coins;
    this.el.innerHTML = `
      <div class="bx-tg-kicker">${escapeHtml(this.title)}</div>
      ${icon ? '<img class="bx-tg-img" alt="" />' : GIFT_SVG}
      <div class="bx-tg-gift"></div>
      <div class="bx-tg-by">${avatar ? '<img class="bx-tg-av" alt="" />' : ''} von <b></b></div>
      <div class="bx-tg-coins">${fmt(coins)} Coins</div>`;
    if (icon) this.el.querySelector('.bx-tg-img').src = icon;
    if (avatar) this.el.querySelector('.bx-tg-av').src = avatar;
    this.el.querySelector('.bx-tg-gift').textContent = slug;
    this.el.querySelector('.bx-tg-by b').textContent = nickname || 'Jemand';
    this.el.classList.remove('bounce'); void this.el.offsetWidth; this.el.classList.add('bounce');
  }
  // Neuer Stream → Rekord zurück auf „leer".
  onReset() { this.max = 0; this.el.innerHTML = `<div class="bx-tg-empty">${GIFT_SVG}<span>Noch kein Gift</span></div>`; }
  destroy() { this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
