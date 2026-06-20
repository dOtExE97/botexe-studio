// fps-cap.js — globaler requestAnimationFrame-Drossel.
//
// Warum: Ohne VSync-Kopplung (Editor-Vorschau in Electron) ODER mit hoher
// Monitor-Refreshrate (echtes Overlay lief mit 174fps) rennt rAF viel zu
// schnell und frisst CPU/GPU — genau die, die der Streamer fürs Spiel braucht.
// Für ein Overlay reichen ~60fps; alle Animationen hier sind zeitbasiert (dt),
// sehen also bei 60 identisch aus wie bei 174, nur mit Bruchteil der Last.
//
// Bewusst als reines Modul OHNE window-Zugriff → in node testbar (fps-cap.test).

/**
 * Erzeugt einen Drossel, der alle angemeldeten Callbacks GEMEINSAM pro
 * freigegebenem Frame ausführt (geteiltes Zeitfenster, kein gegenseitiges
 * Ausspielen einzelner Widgets).
 *
 * @param {(cb: (t:number)=>void) => number} nativeRaf  echtes requestAnimationFrame
 * @param {(id: number) => void} nativeCaf               echtes cancelAnimationFrame
 * @param {number} minMs   minimaler Abstand zwischen Renders (1000/Ziel-fps)
 * @param {number} [tol]   Toleranz in ms gegen VSync-Jitter (Default 0.5)
 */
export function createRafThrottle(nativeRaf, nativeCaf, minMs, tol = 0.5) {
  let queue = []; // { id, cb } — diesen Frame angemeldete Callbacks
  let seq = 0;
  let scheduled = false; // läuft schon ein nativer Frame, der die Queue abarbeitet?
  let last = -Infinity; // idealer Zeitpunkt des letzten Renders (Akkumulator)
  let nativeId = 0;

  const tick = (t) => {
    scheduled = false;
    if (t - last >= minMs - tol) {
      // Akkumulator statt `last = t`: hält den idealen Takt, sonst quantisiert
      // man bei 144Hz auf 48 statt 60. Nach einer langen Pause (Tab-Stall)
      // hart resyncen, damit kein Nachhol-Burst entsteht.
      last = t - last > minMs * 2 ? t : last + minMs;
      const cbs = queue;
      queue = [];
      for (const e of cbs) e.cb(t);
    } else if (queue.length) {
      // Noch zu früh — nächsten NATIVEN Frame abwarten (kein setTimeout, das
      // würde den Frame an den übernächsten VSync verschieben → Halbierung).
      scheduled = true;
      nativeId = nativeRaf(tick);
    }
  };

  return {
    request(cb) {
      const id = ++seq;
      queue.push({ id, cb });
      if (!scheduled) {
        scheduled = true;
        nativeId = nativeRaf(tick);
      }
      return id;
    },
    cancel(id) {
      queue = queue.filter((e) => e.id !== id);
      if (!queue.length && scheduled) {
        scheduled = false;
        nativeCaf(nativeId);
      }
    },
  };
}

/**
 * Installiert den Drossel auf window. Ersetzt requestAnimationFrame/
 * cancelAnimationFrame durch die gedeckelte Variante.
 *
 * @param {Window} win        Zielfenster
 * @param {number} targetFps  Ziel-Framerate (Default 60)
 */
export function installFpsCap(win, targetFps = 60) {
  if (typeof win.requestAnimationFrame !== 'function') return;
  const nativeRaf = win.requestAnimationFrame.bind(win);
  const nativeCaf = (win.cancelAnimationFrame || (() => {})).bind(win);
  const minMs = 1000 / (targetFps + 1); // +1 → kleine Toleranz unter dem Ziel
  const thr = createRafThrottle(nativeRaf, nativeCaf, minMs);
  win.requestAnimationFrame = (cb) => thr.request(cb);
  win.cancelAnimationFrame = (id) => thr.cancel(id);
}
