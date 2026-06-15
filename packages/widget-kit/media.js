// media.js — eigenes Bild/Video im Overlay.
// Zwei Modi:
//   static  — dauerhaft sichtbar (Logo, Banner, Wasserzeichen, BRB-Screen)
//   trigger — versteckt, spielt bei einer play_media-Aktion ab und blendet
//             sich danach selbst wieder aus (z.B. Begrüßungsvideo bei Superfan)
// props: { mediaId, mediaUrl, kind?, mode, fit, durationMs, loop, muted, frame }
const STYLE_ID = 'bx-media-style';
const CSS = `
.bx-media { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.bx-media-el { width:100%; height:100%; display:block; }
.bx-media.frame .bx-media-el { border-radius: var(--bx-radius); box-shadow: var(--bx-shadow), 0 0 50px -18px var(--bx-accent); }
.bx-media-hidden { opacity:0; pointer-events:none; }
.bx-media-play { animation: bx-media-in 460ms cubic-bezier(.2,1.5,.35,1); }
@keyframes bx-media-in { 0% { opacity:0; transform: scale(.82); } 100% { opacity:1; transform: scale(1); } }
.bx-media-out { animation: bx-media-out 380ms ease forwards; }
@keyframes bx-media-out { to { opacity:0; transform: scale(.96); } }
.bx-media-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; width:100%; height:100%;
  border:2px dashed color-mix(in srgb, var(--bx-accent) 50%, transparent); border-radius: var(--bx-radius);
  background: var(--bx-glass); color: var(--bx-muted); font-family: var(--bx-font-display);
  font-size:14px; letter-spacing:.12em; text-transform:uppercase; text-align:center; padding:12px; }
.bx-media-empty span { font-size:34px; }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
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

    this.el = document.createElement('div');
    this.el.className = 'bx-media' + (props.frame ? ' frame' : '');
    root.appendChild(this.el);

    // URL bauen: bevorzugt fertige mediaUrl (Editor), sonst aus baseUrl+token+id
    this.url = props.mediaUrl || '';
    if (!this.url && props.mediaId && ctx && ctx.baseUrl) {
      this.url = `${ctx.baseUrl}/media/${encodeURIComponent(props.mediaId)}?token=${ctx.token}`;
    }

    if (!this.url) {
      this.el.innerHTML = `<div class="bx-media-empty"><span>🎬</span>Kein Medium gewählt</div>`;
      return;
    }

    this.media = this.buildMedia();
    this.el.appendChild(this.media);

    if (this.mode === 'static') {
      if (this.kind === 'video') this.media.play?.().catch(() => {});
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
    if (this.outTimer) { clearTimeout(this.outTimer); this.outTimer = null; }
    this.el.classList.add('bx-media-out');
    // Ausblend-Timer verfolgen, damit destroy() ihn killt — sonst greift der
    // Callback nach einem schnellen Stream-Wechsel auf bereits entferntes DOM zu.
    this.outTimer = setTimeout(() => {
      this.outTimer = null;
      this.el.classList.add('bx-media-hidden');
      this.el.classList.remove('bx-media-out', 'bx-media-play');
      if (this.kind === 'video') { try { this.media.pause(); this.media.currentTime = 0; } catch { /* noop */ } }
    }, 380);
  }

  destroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    if (this.outTimer) clearTimeout(this.outTimer);
    if (this.media && this.kind === 'video') { try { this.media.pause(); this.media.src = ''; } catch { /* noop */ } }
    this.el.remove();
  }
}
