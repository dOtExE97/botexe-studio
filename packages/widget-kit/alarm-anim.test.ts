// alarm-anim.test.ts — Live-Renderer der Alarm-Animationen, geprüft gegen einen
// Fake-Canvas-Kontext (kein Browser nötig).
//
// Der Fake schluckt jeden Aufruf, zählt NaN/Infinity in Argumenten und
// Zuweisungen und wirft dort, wo ein echter Browser-Canvas auch wirft
// (negativer Radius bei arc/ellipse/roundRect/createRadialGradient, nicht
// endliche Werte bei den Verläufen, addColorStop außerhalb 0…1). Genau diese
// Würfe sind im Overlay unsichtbar: Sie passieren im requestAnimationFrame,
// an allen try/catch der Runtime vorbei.
import { test } from 'node:test';
import assert from 'node:assert/strict';

type Zaehler = { aufrufe: number; nan: number; log: string[] };

function fakeGradient(z: Zaehler) {
  return {
    addColorStop(o: number, farbe: string) {
      z.aufrufe++;
      if (!Number.isFinite(o)) { z.nan++; throw new TypeError('addColorStop: Offset nicht endlich'); }
      if (o < 0 || o > 1) throw new RangeError('addColorStop: Offset außerhalb 0…1');
      if (typeof farbe !== 'string' || /NaN|undefined/.test(farbe)) z.nan++;
    },
  };
}

function fakeKontext(z: Zaehler, mitLog = false): any {
  const zustand: Record<string, unknown> = {};
  const pruefe = (name: string, args: unknown[]) => {
    for (const a of args) {
      if (typeof a === 'number' && !Number.isFinite(a)) z.nan++;
      // „NaN"/„undefined" als sichtbarer Text (fillText) ist derselbe Fehler.
      if (typeof a === 'string' && /\bNaN\b|undefined|Infinity/.test(a)) z.nan++;
    }
    if (mitLog) z.log.push(name + '(' + args.map((a) => (typeof a === 'number' ? a.toFixed(3) : typeof a === 'string' ? a : typeof a)).join(',') + ')');
  };
  const methoden: Record<string, (...a: any[]) => unknown> = {
    arc: (_x, _y, r) => { if (r < 0) throw new RangeError('arc: negativer Radius'); },
    ellipse: (_x, _y, rx, ry) => { if (rx < 0 || ry < 0) throw new RangeError('ellipse: negativer Radius'); },
    roundRect: (_x, _y, _w, _h, r) => { if (typeof r === 'number' && r < 0) throw new RangeError('roundRect: negativer Radius'); },
    createLinearGradient: (...a) => { if (a.some((v) => !Number.isFinite(v))) throw new TypeError('createLinearGradient: nicht endlich'); return fakeGradient(z); },
    createRadialGradient: (...a) => {
      if (a.some((v) => !Number.isFinite(v))) throw new TypeError('createRadialGradient: nicht endlich');
      if (a[2] < 0 || a[5] < 0) throw new RangeError('createRadialGradient: negativer Radius');
      return fakeGradient(z);
    },
    createConicGradient: (...a) => { if (a.some((v) => !Number.isFinite(v))) throw new TypeError('createConicGradient: nicht endlich'); return fakeGradient(z); },
    measureText: (s) => ({ width: String(s).length * 30 }),
    getLineDash: () => [],
  };
  return new Proxy(zustand, {
    get(ziel, prop: string) {
      if (prop in methoden || !(prop in ziel)) {
        if (prop === 'canvas') return { width: 1080, height: 1920 };
        return (...args: unknown[]) => {
          z.aufrufe++;
          pruefe(prop, args);
          return methoden[prop] ? methoden[prop](...args) : undefined;
        };
      }
      return ziel[prop];
    },
    set(ziel, prop: string, wert) {
      if (typeof wert === 'number' && !Number.isFinite(wert)) z.nan++;
      if (typeof wert === 'string' && /NaN/.test(wert)) z.nan++;
      if (mitLog) z.log.push(prop + '=' + (typeof wert === 'number' ? wert.toFixed(3) : typeof wert === 'string' ? wert : typeof wert));
      ziel[prop] = wert;
      return true;
    },
  });
}

// Offscreen-Ebenen (vorgebackene Glows) laufen im Browser über OffscreenCanvas.
// Für den Test liefert die Attrappe denselben Fake-Kontext.
const offscreenZaehler: Zaehler = { aufrufe: 0, nan: 0, log: [] };
const offscreenEbenen: Array<{ width: number; height: number }> = [];
(globalThis as any).OffscreenCanvas = class {
  width: number; height: number;
  constructor(w: number, h: number) {
    if (!(w > 0) || !(h > 0)) throw new RangeError('OffscreenCanvas: Größe muss > 0 sein');
    this.width = w; this.height = h;
    offscreenEbenen.push(this);
  }
  getContext() { return fakeKontext(offscreenZaehler); }
};

const { ANIMATIONEN, erzeugeRenderer, initiale, ladeSchrift } = await import('./alarm-anim.js');

const LEVEL_UP_IDS = ['lvl-herzschlag', 'lvl-goldherz', 'lvl-neon', 'lvl-tiktok', 'lvl-tiktok-neon'];

test('Katalog: alle fünf Level-Up-Stile mit Dauer, Sound und Ereignis-Zuordnung', () => {
  for (const id of LEVEL_UP_IDS) {
    const a = ANIMATIONEN[id];
    assert.ok(a, `${id} fehlt im Katalog`);
    assert.equal(typeof a.label, 'string');
    assert.ok(a.dauer > 0);
    assert.match(a.sound, /^botexe-levelup-[a-z-]+\.wav$/);
    assert.deepEqual([...a.fuer].sort(), ['level_gifter', 'level_team']);
  }
  // Die Sounds sind auf diese Zeitachsen getaktet — Dauer nicht „aufrunden".
  assert.equal(ANIMATIONEN['lvl-tiktok-neon'].dauer, 5.8);
  assert.equal(ANIMATIONEN['lvl-tiktok'].dauer, 5.8);
  assert.equal(ANIMATIONEN['lvl-herzschlag'].dauer, 5.6);
  assert.equal(ANIMATIONEN['lvl-goldherz'].dauer, 5.6);
  assert.equal(ANIMATIONEN['lvl-neon'].dauer, 5.6);
  assert.equal(ANIMATIONEN['lvl-tiktok-neon'].sound, 'botexe-levelup-tiktok-neon.wav');
  assert.equal(ANIMATIONEN['lvl-herzschlag'].sound, 'botexe-levelup-herzschlag.wav');
});

for (const id of LEVEL_UP_IDS) {
  for (const art of ['team', 'gifter'] as const) {
    test(`${id} (${art}): rendert t ∈ {0, 1.9, 3, dauer} ohne Wurf und ohne NaN`, () => {
      const r = erzeugeRenderer(id, { name: 'Schwester Mary', alt: 11, neu: 12, art });
      assert.equal(r.dauer, ANIMATIONEN[id].dauer);
      for (const t of [0, 1.9, 3, r.dauer]) {
        const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
        r.zeichne(fakeKontext(z), t, 1080, 1920);
        assert.equal(z.nan, 0, `NaN bei t=${t}`);
        assert.ok(z.aufrufe > 0, `t=${t}: nichts gezeichnet`);
      }
      r.destroy();
    });
  }
}

test('Lückenhafte Daten (TikTok lässt Felder weg) werfen nicht und erzeugen kein NaN', () => {
  for (const id of LEVEL_UP_IDS) {
    for (const daten of [{}, { name: '' }, { neu: 5 }, { alt: 'x', neu: undefined, art: 'gifter' }, { name: '🖤'.repeat(60), neu: 999 }]) {
      const r = erzeugeRenderer(id, daten as any);
      for (const t of [0, 0.5, 1.2, 1.9, 2.4, 3, 4.9, r.dauer]) {
        const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
        r.zeichne(fakeKontext(z), t, 540, 960);
        assert.equal(z.nan, 0, `${id} ${JSON.stringify(daten)} t=${t}`);
      }
      r.destroy();
    }
  }
});

test('Ohne vermessene Fläche (w=0, h=0) zeichnet der Renderer gar nichts', () => {
  for (const id of LEVEL_UP_IDS) {
    const r = erzeugeRenderer(id, { name: 'Mia', neu: 3 });
    for (const [w, h] of [[0, 0], [0, 500], [NaN, NaN], [undefined, undefined]]) {
      const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
      r.zeichne(fakeKontext(z), 2, w as number, h as number);
      assert.equal(z.aufrufe, 0, `${id}: ${w}×${h} darf nichts zeichnen`);
    }
    r.destroy();
  }
});

test('Deterministisch: gleiche Daten + gleiche Zeit → gleiche Zeichnung, auch nach Rückspulen', () => {
  for (const id of LEVEL_UP_IDS) {
    const bild = (r: any, t: number) => { const z: Zaehler = { aufrufe: 0, nan: 0, log: [] }; r.zeichne(fakeKontext(z, true), t, 1080, 1920); return z.log.join('\n'); };
    const a = erzeugeRenderer(id, { name: 'Mia', alt: 4, neu: 5 });
    const b = erzeugeRenderer(id, { name: 'Mia', alt: 4, neu: 5 });
    // a läuft Bild für Bild wie im Overlay, b springt direkt hin.
    for (let t = 0; t < 2.6; t += 1 / 60) a.zeichne(fakeKontext({ aufrufe: 0, nan: 0, log: [] }), t, 1080, 1920);
    assert.equal(bild(a, 2.6), bild(b, 2.6), `${id}: Sprung ≠ durchgespielt`);
    // Rückspulen (Vorschau-Schleife) beginnt sauber von vorn.
    const vorher = bild(b, 1.0);
    bild(b, 4.0);
    assert.equal(bild(b, 1.0), vorher, `${id}: Rückspulen liefert anderes Bild`);
  }
});

test('destroy() ist mehrfach aufrufbar und zeichne danach wirft nicht', () => {
  const r = erzeugeRenderer('lvl-tiktok-neon', { name: 'Mia', neu: 3, bild: 'http://x/a.png' });
  r.destroy();
  r.destroy();
  const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
  r.zeichne(fakeKontext(z), 3, 1080, 1920);
  assert.equal(z.nan, 0);
});

test('Unbekannte Animation → klare Meldung statt stiller Leere', () => {
  assert.throws(() => erzeugeRenderer('gibts-nicht', {}), /gibts-nicht/);
});

test('initiale: erstes sichtbares Zeichen, Emoji-sicher, Fallback ?', () => {
  assert.equal(initiale('🖤Mary'), '🖤');
  assert.equal(initiale(''), '?');
  assert.equal(initiale(undefined), '?');
  assert.equal(initiale('   '), '?');
  assert.equal(initiale('mary'), 'M');
  assert.equal(initiale('  ​Lena'), 'L');
  assert.equal(initiale('👨‍👩‍👧 Familie'), '👨‍👩‍👧');
});

test('Ohne OffscreenCanvas/document (vorgebackene Ebenen fehlen) zeichnet er trotzdem', async () => {
  const gesichert = (globalThis as any).OffscreenCanvas;
  delete (globalThis as any).OffscreenCanvas;
  try {
    for (const id of LEVEL_UP_IDS) {
      const r = erzeugeRenderer(id, { name: 'Mia', alt: 1, neu: 2, art: 'gifter' });
      for (const t of [0.5, 1.9, 2.5, 3.5]) {
        const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
        r.zeichne(fakeKontext(z), t, 1080, 1920);
        assert.equal(z.nan, 0);
        assert.ok(z.aufrufe > 0);
      }
      r.destroy();
    }
  } finally {
    (globalThis as any).OffscreenCanvas = gesichert;
  }
});

test('destroy() gibt die vorgebackenen Ebenen frei (Größe 0)', () => {
  for (const id of LEVEL_UP_IDS) {
    const vorher = offscreenEbenen.length;
    const r = erzeugeRenderer(id, { name: 'Mia', alt: 1, neu: 2 });
    for (const t of [1.0, 3.0]) r.zeichne(fakeKontext({ aufrufe: 0, nan: 0, log: [] }), t, 1080, 1920);
    const eigene = offscreenEbenen.slice(vorher).filter((c) => c.width > 4); // ohne Mess-Leinwände 4×4
    assert.ok(eigene.length > 0, `${id}: keine Ebenen gebacken`);
    r.destroy();
    const uebrig = eigene.filter((c) => c.width !== 0 || c.height !== 0);
    assert.equal(uebrig.length, 0, `${id}: ${uebrig.length} Ebenen nach destroy() nicht freigegeben`);
  }
});

// WÄCHTER: document.fonts.check() meldet für eine NIE registrierte Familie
// ebenfalls „bereit" (CSS Font Loading). Daran darf die Neu-Back-Logik nicht
// hängen — sonst bleiben Titel/Name/Zeilen für immer in der Ersatzschrift.
// Dieser Test läuft als letzter: Er schaltet den Modul-Merker „Schrift geladen" um.
test('Schrift kommt nach dem ersten Bild → Textebenen werden mit BxInter neu gebacken', async () => {
  const g = globalThis as any;
  const geladeneUrls: string[] = [];
  let hinzugefuegt = 0;
  g.document = { fonts: { check: () => true, add: () => { hinzugefuegt++; } } };
  g.FontFace = class {
    constructor(_familie: string, quelle: string) { geladeneUrls.push(quelle); }
    load() { return Promise.resolve(this); }
  };
  try {
    const r = erzeugeRenderer('lvl-tiktok-neon', { name: 'Mia', alt: 1, neu: 2 });
    const male = () => r.zeichne(fakeKontext({ aufrufe: 0, nan: 0, log: [] }), 3, 1080, 1920);
    male();
    const nachErstemBild = offscreenEbenen.length;
    male();
    assert.equal(offscreenEbenen.length, nachErstemBild, 'ohne geladene Schrift (check() lügt „bereit") darf nichts neu gebacken werden');
    const alteEbenen = offscreenEbenen.slice(0, nachErstemBild).filter((c) => c.width > 4);

    await ladeSchrift('http://127.0.0.1:27415', 'geheim');
    assert.equal(hinzugefuegt, 1, 'Schrift wurde nicht registriert');
    assert.match(geladeneUrls[0], /\/widgets\/inter-black\.woff2\?token=geheim/, 'ohne Schlüssel antwortet der Overlay-Server mit 403');

    male();
    assert.ok(offscreenEbenen.length > nachErstemBild, 'nach dem Laden der Schrift wurden die Textebenen nicht neu gebacken');
    assert.ok(alteEbenen.some((c) => c.width === 0), 'die alten Ebenen wurden beim Neu-Backen nicht freigegeben');
    const nachNeuBacken = offscreenEbenen.length;
    male();
    assert.equal(offscreenEbenen.length, nachNeuBacken, 'neu gebacken wird nur einmal, nicht in jedem Bild');
    r.destroy();
    // Zweiter Aufruf lädt nicht erneut.
    await ladeSchrift('http://127.0.0.1:27415', 'geheim');
    assert.equal(geladeneUrls.length, 1);
  } finally {
    delete g.document;
    delete g.FontFace;
  }
});
