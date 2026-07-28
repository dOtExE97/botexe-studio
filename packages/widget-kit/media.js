// media.js — eigenes Bild/Video im Overlay.
// Zwei Modi:
//   static  — dauerhaft sichtbar (Logo, Banner, Wasserzeichen, BRB-Screen)
//   trigger — versteckt, spielt bei einer play_media-Aktion ab und blendet
//             sich danach selbst wieder aus (z.B. Begrüßungsvideo bei Superfan)
// props: { mediaId, mediaUrl, kind?, mode, fit, durationMs, loop, muted, frame }
const STYLE_ID = 'bx-media-style';
const CSS = `
.bx-media { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden;
  container-type:size; }
.bx-media-el { width:100%; height:100%; display:block; }
.bx-media.frame .bx-media-el { border-radius: var(--bx-radius); box-shadow: var(--bx-shadow), 0 0 50px -18px var(--bx-accent); }
.bx-media-hidden { opacity:0; pointer-events:none; }
.bx-media-play { animation: bx-media-in var(--bx-media-in-ms, 460ms) cubic-bezier(.2,1.5,.35,1); }
@keyframes bx-media-in { 0% { opacity:0; transform: scale(.82); } 100% { opacity:1; transform: scale(1); } }
.bx-media-out { animation: bx-media-out var(--bx-media-out-ms, 380ms) ease forwards; }
@keyframes bx-media-out { to { opacity:0; transform: scale(.96); } }
/* Sanft: nur Deckkraft, kein Zoom — ruhiger, wenn oft etwas eingeblendet wird. */
.bx-media.ein-sanft .bx-media-play { animation: bx-media-in-sanft var(--bx-media-in-ms, 460ms) ease; }
@keyframes bx-media-in-sanft { from { opacity:0; } to { opacity:1; } }
.bx-media.ein-sanft .bx-media-out { animation: bx-media-out-sanft var(--bx-media-out-ms, 380ms) ease forwards; }
@keyframes bx-media-out-sanft { to { opacity:0; } }
/* Hart: gar keine Animation — erscheint und verschwindet sofort. */
.bx-media.ein-hart .bx-media-play,
.bx-media.ein-hart .bx-media-out { animation: none; }
/* Platzhalter skaliert mit der Box mit (vorher feste 14px/34px → in einem
   großen Media-Rahmen kaum zu sehen). */
/* box-sizing ist Pflicht: 100% + gestrichelter Rahmen + Innenabstand ragten
   sonst in JEDER Boxgröße um Rahmen+Padding über das Kästchen hinaus. */
.bx-media-empty { box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.55em; width:100%; height:100%;
  border:max(2px,.14em) dashed color-mix(in srgb, var(--bx-accent) 50%, transparent); border-radius: var(--bx-radius);
  background: var(--bx-glass); color: var(--bx-muted); font-family: var(--bx-font-display);
  font-size: clamp(11px, 4.4cqmin, 46px); letter-spacing:.12em; text-transform:uppercase; text-align:center; padding:.85em; }
.bx-media-empty span { font-size:2.4em; }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   AUSGENOMMEN: das Medium selbst. Die Basis legt jedem Bild einen farbigen
   Schein in der Akzentfarbe unter — bei einem Gift-Bild ist das schön, bei
   einem formatfüllenden Logo, Banner oder Video ist es ein farbiger Nebel rund
   um das Kästchen. Das eigene Bild bleibt deshalb, wie der Nutzer es hochgeladen
   hat. Wer einen Rahmen will, hat dafür die Einstellung „Rahmen" — die wird
   unter Premium etwas tiefer.
   Der Auslöser ist das Einblenden. Er hebt das Medium an; ein Ring läuft nur im
   Rahmen-Modus mit, sonst zöge er eine Kante um ein freigestelltes Bild. */
.bx-premium .bx-media-el { filter: none; }
.bx-premium .bx-media.frame .bx-media-el {
  box-shadow: var(--bx-shadow), 0 24px 50px -18px rgba(0, 0, 0, .85),
    0 0 50px -18px var(--bx-accent); }
.bx-premium .bx-media-el.bx-hit { animation: bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1); }
.bx-premium .bx-media.frame .bx-media-el.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1); }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

// Premium-Auslöser: Klasse `bx-hit` setzen und nach 900 ms wieder wegnehmen.
// Was daraus wird, entscheidet die Premium-Ebene in widget-base.css bzw. die
// eigene Fassung oben — ohne den Haken „Premium-Effekte" passiert nichts.
// Bewusst lokal dupliziert: die Widgets haben kein gemeinsames JS-Modul.
function bxHit(el, timers) {
  if (!el) return;
  el.classList.remove('bx-hit');
  void el.offsetWidth; // Reflow → bei schnellen Folgen springt der Effekt neu an
  el.classList.add('bx-hit');
  const t = setTimeout(() => { timers.delete(t); el.classList.remove('bx-hit'); }, 900);
  timers.add(t);
}

function kindFor(props) {
  if (props.kind === 'image' || props.kind === 'video') return props.kind;
  const src = String(props.mediaId || props.mediaUrl || '').toLowerCase();
  return /\.(mp4|webm)(\?|$)/.test(src) ? 'video' : 'image';
}

export default class MediaWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.props = props || {};
    this.mode = props.mode === 'static' ? 'static' : 'trigger';
    this.kind = kindFor(props);
    this.durationMs = Number(props.durationMs) || 6000;
    this.hideTimer = null;
    this.timers = new Set(); // Premium-Auslöser → bei destroy clearen

    this.el = document.createElement('div');
    // Ein-/Ausblenden: Art + Dauer einstellbar. „schwung" ist das bisherige
    // Verhalten (leichter Zoom), „sanft" nur Deckkraft, „hart" ohne Animation.
    const art = props.fadeStyle === 'sanft' || props.fadeStyle === 'hart' ? props.fadeStyle : 'schwung';
    this.el.className = 'bx-media' + (props.frame ? ' frame' : '')
      + (art === 'sanft' ? ' ein-sanft' : art === 'hart' ? ' ein-hart' : '');
    const einMs = Math.max(0, Math.min(4000, Number(props.fadeInMs ?? 460) || 0));
    const ausMs = Math.max(0, Math.min(4000, Number(props.fadeOutMs ?? 380) || 0));
    this.el.style.setProperty('--bx-media-in-ms', `${einMs}ms`);
    this.el.style.setProperty('--bx-media-out-ms', `${ausMs}ms`);
    this.fadeOutMs = ausMs;
    root.appendChild(this.el);

    // Vorschau-Kennung früh setzen — die leere-Medium-Behandlung unten braucht sie.
    this.preview = !!(ctx && ctx.preview);

    // URL bauen: bevorzugt fertige mediaUrl (Editor), sonst aus baseUrl+token+id
    this.url = props.mediaUrl || '';
    if (!this.url && props.mediaId && ctx && ctx.baseUrl) {
      this.url = `${ctx.baseUrl}/media/${encodeURIComponent(props.mediaId)}?token=${ctx.token}`;
    }

    if (!this.url) {
      // Kein festes Medium gewählt. Im EDITOR den Platzhalter zeigen, damit man
      // das Widget sieht und platzieren kann — im echten Overlay aber NICHTS.
      //
      // Sonst stünde bei jedem Intro-Widget dauerhaft „Kein Medium gewählt" im
      // Stream: Für persönliche Intros ist genau das der Normalfall, denn das
      // Medium kommt erst mit der Aktion (je Zuschauer ein anderes).
      if (this.preview) {
        this.el.innerHTML = `<div class="bx-media-empty"><span>🎬</span>Kein Medium gewählt</div>`;
      } else {
        this.el.classList.add('bx-media-hidden');
      }
      return;
    }

    this.media = this.buildMedia();
    this.el.appendChild(this.media);

    // Editor-Schaufenster: ein Trigger-Medium ist im Overlay zurecht unsichtbar,
    // im Editor wäre es aber eine leere Box — man könnte es weder sehen noch
    // platzieren. Deshalb in der Vorschau dauerhaft zeigen (Video stumm in
    // Schleife), im echten Overlay bleibt alles wie gehabt.
    this.preview = !!(ctx && ctx.preview);
    if (this.mode === 'static' || this.preview) {
      if (this.kind === 'video') {
        if (this.preview) { this.media.loop = true; this.media.muted = true; }
        this.media.play?.().catch(() => {});
      }
    } else {
      this.el.classList.add('bx-media-hidden'); // wartet auf play_media
    }
  }

  buildMedia() {
    const fit = this.props.fit === 'cover' ? 'cover' : 'contain';
    if (this.kind === 'video') {
      const v = document.createElement('video');
      v.className = 'bx-media-el';
      v.src = this.url;
      v.style.objectFit = fit;
      v.muted = this.props.muted !== false; // default stumm (Audio läuft sonst doppelt)
      v.playsInline = true;
      v.loop = this.mode === 'static' && this.props.loop !== false;
      v.autoplay = this.mode === 'static';
      v.preload = 'auto';
      if (this.mode === 'trigger') {
        v.addEventListener('ended', () => { if (!v.loop) this.hide(); });
      }
      return v;
    }
    const img = document.createElement('img');
    img.className = 'bx-media-el';
    img.alt = '';
    img.src = this.url;
    img.style.objectFit = fit;
    return img;
  }

  // play_media-Aktion → einblenden + abspielen. Mit params.mediaUrl wird ein
  // anderes Medium gespielt (z.B. das Begrüßungsvideo eines bestimmten Zuschauers).
  onAction(action) {
    if (!action || action.kind !== 'play_media' || !this.media) return;
    const p = action.params || {};
    if (p.mediaUrl && p.mediaUrl !== this.url) {
      this.url = String(p.mediaUrl);
      if (p.kind === 'video' || p.kind === 'image') this.kind = p.kind;
      const next = this.buildMedia();
      this.media.replaceWith(next);
      this.media = next;
    }
    this.show();
  }

  show() {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    this.el.classList.remove('bx-media-hidden', 'bx-media-out');
    this.el.classList.remove('bx-media-play'); void this.el.offsetWidth; this.el.classList.add('bx-media-play');
    // Der Moment dieses Widgets: das Medium kommt ins Bild.
    bxHit(this.media, this.timers);
    if (this.kind === 'video') {
      try { this.media.currentTime = 0; } catch { /* noop */ }
      this.media.play?.().catch(() => {});
      // Sicherheitsnetz, falls 'ended' nie feuert (Stream/Decoder-Hänger).
      // duration kann NaN/Infinity sein (Live-Quelle) → nur endliche Werte nutzen.
      const dur = this.media.duration;
      const vidMs = Number.isFinite(dur) ? dur * 1000 + 800 : 0;
      this.hideTimer = setTimeout(() => this.hide(), Math.max(this.durationMs, vidMs));
    } else {
      this.hideTimer = setTimeout(() => this.hide(), this.durationMs);
    }
  }

  hide() {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; }
    if (this.preview) return; // im Editor sichtbar lassen
    if (this.outTimer) { clearTimeout(this.outTimer); this.outTimer = null; }
    this.el.classList.add('bx-media-out');
    // Ausblend-Timer verfolgen, damit destroy() ihn killt — sonst greift der
    // Callback nach einem schnellen Stream-Wechsel auf bereits entferntes DOM zu.
    this.outTimer = setTimeout(() => {
      this.outTimer = null;
      this.el.classList.add('bx-media-hidden');
      this.el.classList.remove('bx-media-out', 'bx-media-play');
      if (this.kind === 'video') { try { this.media.pause(); this.media.currentTime = 0; } catch { /* noop */ } }
    }, this.fadeOutMs ?? 380);   // an die eingestellte Ausblend-Dauer gekoppelt
  }

  destroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.outTimer) clearTimeout(this.outTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.media && this.kind === 'video') { try { this.media.pause(); this.media.src = ''; } catch { /* noop */ } }
    this.el.remove();
  }
}
