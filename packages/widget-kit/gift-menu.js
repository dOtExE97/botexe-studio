// gift-menu.js — die Geschenke-Tafel: zeigt den Zuschauern, WELCHES GESCHENK
// WAS auslöst („Rose → Konfetti", „Galaxy → Songwunsch"). Reines Anzeige-Widget.
//
// Zwei Darstellungsarten (props.mode):
//   'rotation' — ein Geschenk nach dem anderen groß eingeblendet (sanfter Übergang)
//   'leiste'   — alle Einträge laufen als endloses Band durch (wie command-carousel)
//
// props: {
//   mode?: 'rotation'|'leiste', items?, style?: 'karte'|'tafel'|'neon',
//   title?, intervalMs?, speed?, showCoins?, showTitle?, source?: 'liste'|'trigger',
//   accent?, theme?
// }
//   items: "rose::Konfetti-Regen | galaxy::Songwunsch"  (Gift-Slug :: Text, mit | getrennt)
//          — exakt das Format des GiftCommandListEditor (Feldtyp 'gift-command-list').
//
// Gift-Bilder kommen AUSSCHLIESSLICH aus dem App-Katalog (/gift-catalog →
// offizielle TikTok-Bilder bzw. deren lokale Kopie unter /gift-img). Es wird
// nichts mitgeliefert. Fehlt ein Bild (Normalfall, solange das Gift noch nie
// gesehen wurde), steht das generische Geschenk-SVG da.
const STYLE_ID = 'bx-gm-style';

const CSS = `
/* container-type ist Pflicht: sonst messen die cq-Einheiten in DIESER Regel
   gegen den Viewport statt gegen die Widget-Box. Die Regel hier wird gegen den
   Eltern-Container (die Widget-Box aus runtime.js) ausgewertet — ein Element
   kann seinen EIGENEN container-type nicht abfragen. Genau so gewollt. */
.bx-gm { position:absolute; inset:0; overflow:hidden; container-type:size; box-sizing:border-box;
  font-family: var(--bx-font-body); color: var(--bx-text,#fff);
  font-size: clamp(9px, min(6cqi, 5.2cqh), 34px); }

/* ── Rotation ─────────────────────────────────────────────────────────── */
.bx-gm-rot { position:absolute; inset:0; display:flex; flex-direction:column; align-items:stretch;
  gap:.3em; padding:.55em .6em; box-sizing:border-box; }
.bx-gm-title { flex:none; font-family: var(--bx-font-display); font-size:.72em; letter-spacing:.14em;
  text-transform:uppercase; text-align:center; opacity:.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  /* Der Titel steht frei über dem Stream-Bild — ohne Schatten verschwindet er auf hellem Hintergrund. */
  text-shadow: 0 .08em .3em rgba(0,0,0,.8), 0 0 .12em rgba(0,0,0,.5); }
.bx-gm-stage { position:relative; flex:1 1 auto; min-height:0; overflow:hidden; }
/* Die Karte legt sich um den INHALT (nicht um die ganze Box) und sitzt mittig —
   so sieht sie in jeder Boxgröße wie eine Karte aus und nicht wie ein leerer
   Rahmen. max-height/overflow halten sie in sehr flachen Boxen im Rahmen. */
.bx-gm-card { position:absolute; top:50%; left:0; right:0; max-height:100%; box-sizing:border-box;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.3em; padding:.75em .7em; text-align:center; overflow:hidden;
  opacity:0; transform:translateY(-50%) scale(.9); transition:opacity .45s ease, transform .55s cubic-bezier(.2,.85,.3,1); }
.bx-gm-card.is-in { opacity:1; transform:translateY(-50%) scale(1); }
.bx-gm-ic { flex:none; display:grid; place-items:center; width:clamp(18px, min(34cqi, 28cqh), 260px);
  height:clamp(18px, min(34cqi, 28cqh), 260px); }
.bx-gm-ic img, .bx-gm-ic .bx-gm-ph { width:100%; height:100%; object-fit:contain; display:block;
  filter: drop-shadow(0 .12em .22em rgba(0,0,0,.55)); }
.bx-gm-ic img { display:none; }
.bx-gm-ic.has-img img { display:block; }
.bx-gm-ic.has-img .bx-gm-ph { display:none; }
.bx-gm-ph { color: var(--bx-accent, #ff5e8a); opacity:.85; }
.bx-gm-name { flex:none; max-width:100%; font-family: var(--bx-font-display); font-size:1.05em; line-height:1.15;
  text-transform:uppercase; letter-spacing:.02em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bx-gm-coins { flex:none; display:inline-flex; align-items:center; gap:.25em; font-size:.62em; line-height:1;
  padding:.3em .55em; border-radius:99em; background: rgba(255,255,255,.1);
  color: var(--bx-gold,#ffd23e); white-space:nowrap; }
.bx-gm-act { flex:none; max-width:100%; font-size:.82em; line-height:1.25; opacity:.95;
  display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; line-clamp:3; overflow:hidden;
  overflow-wrap:anywhere; }
.bx-gm-act b { font-family: var(--bx-font-display); font-weight:400; color: var(--bx-accent,#ff5e8a); }
.bx-gm-dots { flex:none; display:flex; justify-content:center; align-items:center; gap:.3em; height:.42em; overflow:hidden; }
.bx-gm-dot { width:.28em; height:.28em; border-radius:99em; background: currentColor; opacity:.28; flex:none;
  transition: opacity .3s ease, transform .3s ease; }
.bx-gm-dot.is-on { opacity:1; transform:scale(1.5); color: var(--bx-accent,#ff5e8a); }
.bx-gm-bar { flex:none; height:.14em; border-radius:99em; background: rgba(255,255,255,.14); overflow:hidden; }
.bx-gm-bar i { display:block; height:100%; width:0; background: var(--bx-accent,#ff5e8a); border-radius:99em; }
.bx-gm-bar.run i { animation: bx-gm-fill var(--dwell,6s) linear forwards; }
@keyframes bx-gm-fill { from { width:0 } to { width:100% } }

/* ── Laufband ─────────────────────────────────────────────────────────── */
/* Ein Band ist BREIT: die Chip-Größe hängt an der HÖHE (cqh), cqi deckelt sie
   in schmalen Boxen zusätzlich. */
.bx-gm-band { position:absolute; inset:0; display:flex; align-items:center; overflow:hidden;
  font-size: clamp(10px, min(23cqh, 5.5cqi), 90px); }
.bx-gm-track { display:inline-flex; align-items:center; gap:.45em; white-space:nowrap; will-change:transform;
  padding:0 .22em; animation: bx-gm-scroll var(--dur,26s) linear infinite; }
@keyframes bx-gm-scroll { to { transform: translateX(-50%); } }
.bx-gm-chip { display:inline-flex; align-items:center; gap:.34em; flex:none; padding:.3em .6em; border-radius:.55em; }
.bx-gm-chip .bx-gm-ic { width:1.7em; height:1.7em; }
.bx-gm-chip .bx-gm-name { font-size:.9em; }
.bx-gm-chip .bx-gm-act { font-size:.9em; -webkit-line-clamp:1; line-clamp:1; }
.bx-gm-chip .bx-gm-coins { font-size:.55em; }
.bx-gm-arr { flex:none; opacity:.55; font-size:.85em; }

/* ── Stile ────────────────────────────────────────────────────────────── */
.bx-st-karte .bx-gm-card, .bx-st-karte .bx-gm-chip { background: var(--bx-glass, rgba(18,20,32,.6));
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-radius:.6em;
  border: max(1px,.04em) solid color-mix(in srgb, var(--bx-accent,#ff5e8a) 34%, transparent);
  box-shadow: var(--bx-shadow, 0 .4em 1.2em -.5em rgba(0,0,0,.7)); }
.bx-st-tafel .bx-gm-card, .bx-st-tafel .bx-gm-chip { color:#fff; border-radius:.55em;
  background: linear-gradient(165deg, color-mix(in srgb, var(--bx-accent,#ff5e8a) 82%, #12131c), color-mix(in srgb, var(--bx-accent,#ff5e8a) 30%, #12131c));
  border: max(1.5px,.06em) solid rgba(255,255,255,.5);
  box-shadow: 0 .2em 0 rgba(0,0,0,.28), 0 .35em .7em -.2em rgba(0,0,0,.5), inset 0 .07em 0 rgba(255,255,255,.35); }
.bx-st-tafel .bx-gm-name { -webkit-text-stroke: max(1.5px,.05em) #0a0b12; paint-order: stroke fill; }
.bx-st-tafel .bx-gm-act b { color:#fff; }
.bx-st-tafel .bx-gm-coins { background: rgba(0,0,0,.3); color:#ffe89a; }
.bx-st-neon .bx-gm-card, .bx-st-neon .bx-gm-chip { background: rgba(8,9,14,.62); border-radius:.5em;
  border: max(1.5px,.06em) solid var(--bx-accent,#ff5e8a); box-shadow: 0 0 1.1em -.25em var(--bx-accent,#ff5e8a); }
.bx-st-neon .bx-gm-name { color: var(--bx-accent,#ff5e8a); text-shadow: 0 0 .5em var(--bx-accent,#ff5e8a); }
.bx-st-neon .bx-gm-title { color: var(--bx-accent,#ff5e8a); }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

// Generisches Geschenk-SVG (identisch zu gift-alert.js) — Platzhalter, solange
// das echte Bild fehlt. Hier der REGELFALL, nicht die Ausnahme.
const GIFT_SVG = `<svg class="bx-gm-ph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" fill="rgba(255,255,255,.08)"/><path d="M2 7h20v5H2z" fill="rgba(255,255,255,.12)"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>`;

const MODES = new Set(['rotation', 'leiste']);
const STYLES = new Set(['karte', 'tafel', 'neon']);

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Toleranter Gift-Schlüssel (nur Buchstaben/Ziffern, klein) — wie in der
 *  Trigger-Engine, damit Apostroph/Leerzeichen/Schreibweise egal sind. */
export function giftKey(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "rose::Konfetti | galaxy::Songwunsch" → [{slug, text}]. Ohne :: gilt der
 *  ganze Eintrag als Gift-Name ohne Aktionstext. */
export function parseItems(raw) {
  return String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('::');
      if (i >= 0) return { slug: s.slice(0, i).trim(), text: s.slice(i + 2).trim() };
      return { slug: s, text: '' };
    })
    .filter((it) => it.slug || it.text);
}

/** Aktions-Art → verständlicher deutscher Text für die Tafel. */
export function actionLabel(action) {
  if (!action || typeof action !== 'object') return '';
  switch (action.kind) {
    case 'play_sound': return 'Sound';
    case 'fire_alert': return 'Alarm';
    case 'show_layer': return 'Einblendung';
    case 'hide_layer': return '';
    case 'speak': return 'Ansage';
    case 'spin_wheel': return 'Glücksrad';
    case 'play_media': return 'Video/Bild';
    case 'counter_add': return `Zähler ${Number(action.delta) >= 0 ? '+' : ''}${Number(action.delta) || 0}`;
    case 'obs_scene': return `Szene: ${action.scene || ''}`.trim();
    case 'obs_visibility': return 'Quelle ein/aus';
    case 'send_chat': return 'Chat-Nachricht';
    case 'streamerbot_action': return String(action.action || 'Streamer.bot');
    case 'giveaway_draw': return 'Verlosung';
    case 'giveaway_reset': return '';
    case 'spotify_control': return 'Musik';
    case 'spotify_request': return 'Songwunsch';
    default: return '';
  }
}

/** Trigger-Regeln → Tafel-Einträge. Nur aktive Gift-Regeln mit einer
 *  Gift-Bedingung (gift_slug_is / gift_id_is). Der Text kommt aus dem
 *  Regel-Namen, sofern er selbst gewählt ist; sonst aus den Aktionen. */
export function itemsFromRules(rules) {
  const out = [];
  const seen = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.enabled === false || rule.event !== 'gift') continue;
    const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
    const slugCond = conds.find((c) => c && c.kind === 'gift_slug_is');
    const idCond = conds.find((c) => c && c.kind === 'gift_id_is');
    if (!slugCond && !idCond) continue;
    const slug = slugCond ? String(slugCond.value || '') : '';
    const giftId = idCond ? Number(idCond.value) || 0 : 0;
    const key = slug ? giftKey(slug) : `#${giftId}`;
    if (!key || seen.has(key)) continue;
    // Von der Geschenke-Galerie erzeugte Regeln heißen „Gift: <slug>" — das ist
    // kein sprechender Text, dann lieber die Aktionen beschreiben.
    const name = String(rule.name || '').trim();
    const generic = /^gift:/i.test(name);
    const fromActions = (Array.isArray(rule.actions) ? rule.actions : [])
      .map(actionLabel).filter(Boolean);
    const uniq = [...new Set(fromActions)];
    const text = (!generic && name) ? name : uniq.join(' + ');
    if (!slug && !giftId) continue;
    seen.add(key);
    out.push({ slug, giftId, text });
  }
  return out;
}

const DEMO = 'Rose::Konfetti-Regen | Finger Heart::Danke-Sound | Galaxy::Songwunsch | TikTok::Glücksrad drehen | Doughnut::Tode +1';
const DEMO_COINS = { rose: 1, fingerheart: 5, galaxy: 1000, tiktok: 1, doughnut: 30 };

export default class GiftMenu {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.props = props || {};
    this.timers = new Set();
    this.rotTimer = null;
    this.icons = {};      // giftKey → Bild-URL
    this.iconsById = {};  // giftId  → Bild-URL
    this.meta = {};       // giftKey → { name, coins }
    this.metaById = {};   // giftId  → { name, coins, key }
    this.index = 0;

    if (props.accent) root.style.setProperty('--bx-accent', String(props.accent));
    this.mode = MODES.has(props.mode) ? props.mode : 'rotation';
    this.style = STYLES.has(props.style) ? props.style : 'karte';
    this.showCoins = props.showCoins !== false;
    this.showTitle = props.showTitle !== false;
    this.title = String(props.title ?? 'Geschenke & was sie auslösen');
    this.dwell = Math.max(1200, Number(props.intervalMs ?? 6000) || 6000);
    this.speed = Math.max(6, Number(props.speed ?? 26) || 26);

    this.el = document.createElement('div');
    this.el.className = `bx-gm bx-st-${this.style}`;
    root.appendChild(this.el);

    this.items = parseItems(props.items);
    // Vorschau/Editor: ohne Einträge wäre nur eine leere Box zu sehen.
    if (!this.items.length && this.ctx.preview) {
      this.items = parseItems(DEMO);
      this.demo = true;
    }
    this.build();

    // Bilder + Coin-Preise aus dem App-Katalog (offizielle Quelle) nachladen.
    if (this.ctx.baseUrl) void this.loadCatalog();
    // Aktionen automatisch aus den Trigger-Regeln des Nutzers ziehen.
    if (String(props.source || 'liste') === 'trigger' && this.ctx.baseUrl) void this.loadRules();
  }

  // ── Aufbau ──────────────────────────────────────────────────────────────
  build() {
    if (this.rotTimer) { clearInterval(this.rotTimer); this.rotTimer = null; }
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.index = 0;
    const list = this.items.length ? this.items : [{ slug: '', text: 'Noch keine Geschenke eingetragen' }];
    if (this.mode === 'leiste') this.buildBand(list);
    else this.buildRotation(list);
  }

  /** Bild-Platzhalter + (später) echtes Bild für einen Eintrag. */
  iconHtml(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const gid = Number(it.giftId) || 0;
    return `<span class="bx-gm-ic" data-key="${escapeHtml(k)}" data-gid="${gid}">${GIFT_SVG}<img alt="" /></span>`;
  }

  displayName(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const m = (k && this.meta[k]) || (it.giftId && this.metaById[it.giftId]) || null;
    return (m && m.name) || it.slug || (it.giftId ? `Gift #${it.giftId}` : '');
  }

  coinsOf(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const m = (k && this.meta[k]) || (it.giftId && this.metaById[it.giftId]) || null;
    const c = m ? Number(m.coins) || 0 : (this.demo ? Number(DEMO_COINS[k]) || 0 : 0);
    return c;
  }

  coinsHtml(it) {
    if (!this.showCoins) return '';
    const c = this.coinsOf(it);
    if (!c) return '';
    return `<span class="bx-gm-coins" data-key="${escapeHtml(it.slug ? giftKey(it.slug) : '')}">🪙 ${c.toLocaleString('de-DE')}</span>`;
  }

  buildRotation(list) {
    const cards = list.map((it) => {
      const name = this.displayName(it);
      const act = it.text ? `<div class="bx-gm-act"><b>→</b> ${escapeHtml(it.text)}</div>` : '';
      return `<div class="bx-gm-card">${this.iconHtml(it)}`
        + `${name ? `<div class="bx-gm-name">${escapeHtml(name)}</div>` : ''}`
        + `${this.coinsHtml(it)}${act}</div>`;
    }).join('');
    const dots = list.length > 1 && list.length <= 10
      ? `<div class="bx-gm-dots">${list.map(() => '<i class="bx-gm-dot"></i>').join('')}</div>` : '';
    const bar = list.length > 1 ? '<div class="bx-gm-bar"><i></i></div>' : '';
    this.el.innerHTML = `<div class="bx-gm-rot">`
      + `${this.showTitle && this.title ? `<div class="bx-gm-title">${escapeHtml(this.title)}</div>` : ''}`
      + `<div class="bx-gm-stage">${cards}</div>${dots}${bar}</div>`;
    this.cards = [...this.el.querySelectorAll('.bx-gm-card')];
    this.dots = [...this.el.querySelectorAll('.bx-gm-dot')];
    this.barEl = this.el.querySelector('.bx-gm-bar');
    this.el.style.setProperty('--dwell', `${this.dwell}ms`);
    this.show(0);
    if (list.length > 1) {
      this.rotTimer = setInterval(() => this.show((this.index + 1) % this.cards.length), this.dwell);
    }
  }

  show(i) {
    this.index = i;
    this.cards.forEach((c, j) => c.classList.toggle('is-in', j === i));
    this.dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
    if (!this.barEl) return;
    // Balken-Animation neu starten (Reflow erzwingen, sonst läuft sie weiter).
    this.barEl.classList.remove('run');
    void this.barEl.offsetWidth;
    this.barEl.classList.add('run');
  }

  buildBand(list) {
    const chip = (it) => {
      const name = this.displayName(it);
      return `<span class="bx-gm-chip">${this.iconHtml(it)}`
        + `${name ? `<span class="bx-gm-name">${escapeHtml(name)}</span>` : ''}`
        + `${this.coinsHtml(it)}`
        + `${it.text ? `<span class="bx-gm-arr">→</span><span class="bx-gm-act">${escapeHtml(it.text)}</span>` : ''}`
        + `</span>`;
    };
    // Doppelte Sequenz: -50% Verschiebung = exakt eine Sequenz → nahtlose Schleife.
    const seq = list.map(chip).join('');
    this.el.innerHTML = `<div class="bx-gm-band"><div class="bx-gm-track" style="--dur:${this.speed}s">${seq}${seq}</div></div>`;
    this.cards = [];
    this.dots = [];
    this.barEl = null;
  }

  // ── Daten ───────────────────────────────────────────────────────────────
  /** Gift-Bilder/Namen/Coins aus dem App-Katalog (nur offizielle Quelle:
   *  lokale Kopie unter /gift-img, sonst die TikTok-CDN-URL). */
  async loadCatalog() {
    try {
      const res = await fetch(`${this.ctx.baseUrl}/gift-catalog?token=${this.ctx.token}`);
      const cat = await res.json();
      for (const [slug, e] of Object.entries(cat || {})) {
        if (!e) continue;
        const key = giftKey(e.slug || slug);
        const url = e.iconFile
          ? `${this.ctx.baseUrl}/gift-img/${encodeURIComponent(e.iconFile)}?token=${this.ctx.token}`
          : (e.icon || '');
        if (url) this.icons[key] = url;
        this.meta[key] = { name: e.customName || e.slug || slug, coins: Number(e.coins) || 0 };
        const gid = Number(e.giftId) || 0;
        if (gid) {
          if (url) this.iconsById[gid] = url;
          this.metaById[gid] = { ...this.meta[key], key };
        }
      }
      // Namen/Coins können sich jetzt erst ergeben → neu aufbauen, dann Bilder.
      this.build();
      this.applyIcons();
    } catch { /* offline/alte App — Slug + Platzhalter reichen */ }
  }

  applyIcons() {
    for (const ic of this.el.querySelectorAll('.bx-gm-ic')) {
      const gid = Number(ic.dataset.gid) || 0;
      const url = this.icons[ic.dataset.key || ''] || (gid ? this.iconsById[gid] : '');
      if (!url) continue;
      const img = ic.querySelector('img');
      if (!img || img.getAttribute('src')) continue;
      img.onload = () => ic.classList.add('has-img');
      img.src = url;
    }
  }

  /** Einträge aus den Trigger-Regeln des Nutzers ableiten (falls die App die
   *  Regeln ausliefert). Schlägt das fehl, bleibt die manuelle Liste stehen. */
  async loadRules() {
    try {
      const res = await fetch(`${this.ctx.baseUrl}/trigger-rules?token=${this.ctx.token}`);
      if (!res.ok) return;
      const data = await res.json();
      const rules = Array.isArray(data) ? data : (data && Array.isArray(data.rules) ? data.rules : []);
      const items = itemsFromRules(rules);
      if (!items.length) return;
      this.items = items;
      this.demo = false;
      this.build();
      this.applyIcons();
    } catch { /* Route (noch) nicht vorhanden — manuelle Liste bleibt */ }
  }

  destroy() {
    if (this.rotTimer) clearInterval(this.rotTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
  }
}
