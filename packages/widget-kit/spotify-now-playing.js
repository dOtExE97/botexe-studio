// spotify-now-playing.js — zeigt den gerade laufenden Spotify-Song (Cover, Titel,
// Künstler, Fortschrittsbalken). Bekommt den Stand über onSpotify(state) vom
// Runtime. Zwischen den Polls läuft der Balken lokal sekündlich weiter (smooth).
// props: { accent?, theme? }
const STYLE_ID = 'bx-spo-style';
const CSS = `
.bx-spo { position:absolute; inset:0; display:flex; align-items:center; gap:3cqmin; padding:3cqmin 4cqmin;
  font-family: var(--bx-font-body); container-type:size; overflow:hidden;
  font-size: clamp(10px, min(24cqh, 5cqi), 96px);
  background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  transition: opacity .4s; }
.bx-spo.empty { opacity:0; }
/* Ohne Cover-URL stand hier bisher ein leeres graues Quadrat — dasselbe Loch
   wie bei den fehlenden Profilbildern in den Listen. Spotify liefert das Cover
   nicht immer sofort mit, deshalb ein gezeichneter Platzhalter (Note auf
   Verlauf), der verschwindet, sobald ein echtes Bild da ist. */
.bx-spo-art { position:relative; width:min(76cqh, 26cqi); aspect-ratio:1/1; height:auto; flex:none; border-radius:.28em;
  background:linear-gradient(150deg,#2a2f45,#171a28) center/cover no-repeat;
  box-shadow: 0 6px 16px -6px rgba(0,0,0,.65); }
.bx-spo-art::after { content:'♪'; position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:min(42cqh, 14cqi); line-height:1; color:rgba(255,255,255,.5); }
.bx-spo-art.has-art { background-color:#1a1c28; }
.bx-spo-art.has-art::after { content:none; }
.bx-spo-body { min-width:0; flex:1; display:flex; flex-direction:column; gap:1.5cqmin; }
.bx-spo-row { display:flex; align-items:center; gap:.24em; min-width:0; }
.bx-spo-eq { display:inline-flex; gap:2px; align-items:flex-end; height:.9em; flex:none; }
/* scaleY statt height: GPU-compositet (kein Layout-Reflow pro Frame). */
.bx-spo-eq i { width:max(2px,.09em); height:100%; transform:scaleY(.35); transform-origin:bottom;
  background: var(--bx-accent,#1db954); border-radius:2px; animation: bx-spo-eq .9s ease-in-out infinite; }
.bx-spo-eq i:nth-child(2){ animation-delay:.25s } .bx-spo-eq i:nth-child(3){ animation-delay:.5s }
@keyframes bx-spo-eq { 0%,100%{ transform:scaleY(.35) } 50%{ transform:scaleY(1) } }
.bx-spo.paused .bx-spo-eq i { animation-play-state: paused; opacity:.4; }
/* Kein Song → Widget unsichtbar: EQ-Animation anhalten (spart Dauer-Compositing). */
.bx-spo.empty .bx-spo-eq i { animation-play-state: paused; }
.bx-spo-title { font-family: var(--bx-font-display); font-size:1em; color: var(--bx-text,#fff);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-spo-artist { font-size:.62em; color: var(--bx-muted,#aab0c4);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-spo-bar { height:max(4px,.16em); border-radius:99px; background: rgba(255,255,255,.28); overflow:hidden; margin-top:1cqmin; }
.bx-spo-fill { height:100%; width:0%; border-radius:99px; background: var(--bx-accent,#1db954); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class SpotifyNowPlaying {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    root.style.setProperty('--bx-accent', (props.accent && String(props.accent).trim()) || '#1db954');
    this.el = document.createElement('div');
    this.el.className = 'bx-spo empty';
    this.el.innerHTML = `<div class="bx-spo-art"></div><div class="bx-spo-body">
      <div class="bx-spo-row"><span class="bx-spo-eq"><i></i><i></i><i></i></span><div class="bx-spo-title">—</div></div>
      <div class="bx-spo-artist"></div>
      <div class="bx-spo-bar"><div class="bx-spo-fill"></div></div></div>`;
    this.art = this.el.querySelector('.bx-spo-art');
    this.titleEl = this.el.querySelector('.bx-spo-title');
    this.artistEl = this.el.querySelector('.bx-spo-artist');
    this.fill = this.el.querySelector('.bx-spo-fill');
    root.appendChild(this.el);
    this.dur = 0; this.prog = 0; this.playing = false; this.trackId = '';
    this.tick = setInterval(() => this.advance(), 1000);
    // Editor-Vorschau: Demo-Song zeigen — sonst ist die Karte im Editor komplett
    // unsichtbar (im echten Overlay ist „leer = unsichtbar" richtig, im Editor
    // kann man das Widget dann aber weder sehen noch platzieren).
    if (this.ctx.preview) {
      this.onSpotify({ trackId: 'demo', title: 'Blinding Lights', artist: 'The Weeknd', durationMs: 200000, progressMs: 74000, isPlaying: true });
    }
  }

  onSpotify(s) {
    if (!s || !s.title) { this.el.classList.add('empty'); this.playing = false; return; }
    this.el.classList.remove('empty');
    this.el.classList.toggle('paused', !s.isPlaying);
    if (s.trackId !== this.trackId) {
      this.trackId = s.trackId;
      this.titleEl.textContent = s.title;
      this.artistEl.textContent = s.artist || '';
      const art = s.albumArt ? String(s.albumArt).replace(/["\\]/g, '') : '';
      this.art.style.backgroundImage = art ? `url("${art}")` : 'none';
      this.art.classList.toggle('has-art', !!art);
    }
    this.dur = Number(s.durationMs) || 0;
    this.prog = Number(s.progressMs) || 0;
    this.playing = !!s.isPlaying;
    this.render();
  }

  advance() {
    if (this.playing && this.prog < this.dur) { this.prog = Math.min(this.dur, this.prog + 1000); this.render(); }
  }
  render() { this.fill.style.width = this.dur > 0 ? `${Math.min(100, (this.prog / this.dur) * 100)}%` : '0%'; }
  destroy() { clearInterval(this.tick); this.el.remove(); }
}
