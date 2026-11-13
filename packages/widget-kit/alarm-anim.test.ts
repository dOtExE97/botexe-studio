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

/** Jeder gezeichnete Text (fillText/strokeText), egal in welchem Kontext. */
const TEXTE: string[] = [];

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
    if ((name === 'fillText' || name === 'strokeText') && typeof args[0] === 'string') TEXTE.push(args[0]);
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
const PREMIUM_IDS = ['superfan-premium', 'vip-gold', 'truhe-premium', 'ziel-erreicht'];
const ALLE_IDS = [...LEVEL_UP_IDS, ...PREMIUM_IDS];

/** Spielt einen Renderer in Viertelsekunden durch und liefert alle gezeichneten Texte. */
function texteVon(id: string, daten: Record<string, unknown>): string[] {
  TEXTE.length = 0;
  const r = erzeugeRenderer(id, daten);
  for (let t = 0; t <= r.dauer + 1e-9; t += 0.25) {
    const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
    r.zeichne(fakeKontext(z), t, 1080, 1920);
    assert.equal(z.nan, 0, `${id} t=${t}: NaN`);
  }
  r.destroy();
  return [...TEXTE];
}

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

test('Katalog: Superfan, VIP, Schatztruhe und Ziel mit Dauer, Sound und Ereignis', () => {
  const erwartet: Record<string, [number, string, string[]]> = {
    'superfan-premium': [7.6, 'botexe-superfan.wav', ['superfan', 'superfan_betritt', 'vip']], // VIP: wählbar im Editor (Spec: Superfan-Premium mit „VIP IST DA")
    'vip-gold': [7.6, 'botexe-superfan.wav', ['vip']],
    'truhe-premium': [6.8, 'botexe-truhe.wav', ['truhe']],
    'ziel-erreicht': [5.8, 'botexe-levelup-tiktok-neon.wav', ['ziel']],
  };
  for (const [id, [dauer, sound, fuer]] of Object.entries(erwartet)) {
    const a = ANIMATIONEN[id];
    assert.ok(a, `${id} fehlt im Katalog`);
    assert.equal(a.dauer, dauer, `${id}: Dauer (der Sound ist darauf getaktet)`);
    assert.equal(a.sound, sound);
    assert.deepEqual([...a.fuer].sort(), [...fuer].sort());
    assert.equal(erzeugeRenderer(id, {}).dauer, dauer);
  }
});

for (const id of PREMIUM_IDS) {
  test(`${id}: rendert t ∈ {0, 1.9, 3, dauer} ohne Wurf und ohne NaN — auch mit lückenhaften Daten`, () => {
    for (const daten of [
      { name: 'Schwester Mary', alt: 11, neu: 12, coins: 500, neuAbo: true, fortschritt: 12, ziel: 20, unterzeile: 'Rose' },
      {},
      { coins: undefined, neu: undefined, fortschritt: 'x', ziel: null },
      { name: '🖤'.repeat(60), coins: 99999999, unterzeile: 'X'.repeat(200), art: 'gifter' },
    ]) {
      const r = erzeugeRenderer(id, daten as any);
      for (const t of [0, 0.5, 1.2, 1.4, 1.65, 1.9, 2.05, 2.35, 3, 4.6, 5.5, r.dauer]) {
        const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
        r.zeichne(fakeKontext(z), t, 1080, 1920);
        assert.equal(z.nan, 0, `${id} ${JSON.stringify(daten)} t=${t}`);
        assert.ok(z.aufrufe > 0);
      }
      const z0: Zaehler = { aufrufe: 0, nan: 0, log: [] };
      r.zeichne(fakeKontext(z0), 3, 0, 0);
      assert.equal(z0.aufrufe, 0, `${id}: ohne Fläche gezeichnet`);
      r.destroy();
    }
  });
}

test('Superfan: „NEUER" nur bei Neu-Abo, Unterzeile Standard bzw. vom Alarm', () => {
  const neu = texteVon('superfan-premium', { name: 'Mia', neuAbo: true });
  assert.ok(neu.includes('NEUER'));
  assert.ok(neu.includes('SUPERFAN'));
  assert.ok(neu.includes('WILLKOMMEN IM SUPERFAN-CLUB'));
  const verl = texteVon('superfan-premium', { name: 'Mia', unterzeile: 'SUPERFAN VERLÄNGERT' });
  assert.ok(!verl.includes('NEUER'), 'Verlängerung ist kein neuer Superfan');
  assert.ok(verl.includes('SUPERFAN VERLÄNGERT'));
  assert.ok(!verl.includes('WILLKOMMEN IM SUPERFAN-CLUB'));
  assert.ok(!texteVon('superfan-premium', { name: 'Mia', neuAbo: 'ja' }).includes('NEUER'), 'nur echtes true zählt');
});

test('VIP: Titel „VIP IST DA", Geschenke-Stufe, kein Superfan-Text', () => {
  const texte = texteVon('vip-gold', { name: 'Mia', neu: 25 });
  assert.ok(texte.includes('VIP IST DA'));
  assert.ok(texte.includes('GESCHENKE-STUFE 25'));
  assert.ok(!texte.some((t) => /SUPERFAN|NEUER/.test(t)));
  // Der Herz-Alarm liefert die VIP-Stufe als `stufe` (hat Vorrang vor neu).
  assert.ok(texteVon('vip-gold', { name: 'Mia', stufe: 31, neu: 2 }).includes('GESCHENKE-STUFE 31'));
  // Ohne Stufe keine erfundene „GESCHENKE-STUFE 1".
  assert.ok(!texteVon('vip-gold', { name: 'Mia' }).some((t) => /GESCHENKE-STUFE/.test(t)));
});

test('Schatztruhe: Zähler zeigt die Coins, ohne Coins kein Zähler; Unterzeile Superfan-Truhe', () => {
  const mit = texteVon('truhe-premium', { name: 'Mia', coins: 500 });
  assert.ok(mit.includes('SCHATZTRUHE!'));
  assert.ok(mit.includes('500'), 'Endstand des Zählers fehlt');
  assert.ok(mit.includes('COINS ZUM SCHNAPPEN'));
  const ohne = texteVon('truhe-premium', { name: 'Mia' });
  assert.ok(!ohne.some((t) => /^\d+$/.test(t)), 'ohne Coins darf kein Zähler erscheinen');
  for (const leer of [null, '']) {
    const t = texteVon('truhe-premium', { name: 'Mia', coins: leer });
    assert.ok(!t.some((x) => /^\d+$/.test(x)), `coins: ${JSON.stringify(leer)} heißt „fehlt“, kein 0-Zähler`);
  }
  assert.ok(texteVon('truhe-premium', { name: 'Mia', coins: 0 }).includes('0'), 'echte 0 bleibt eine Zahl');
  assert.ok(texteVon('truhe-premium', { name: 'Mia', coins: 100, unterzeile: 'SUPERFAN-TRUHE' }).includes('SUPERFAN-TRUHE'));
});

test('Schatztruhe: die Münz-/Edelstein-Fontäne steigt wirklich über die Truhe', () => {
  // Wächter: Ein Bearbeitungsfehler hatte die Bewegung der Partikel auskommentiert —
  // alles lief „grün", nur die Fontäne klebte unsichtbar am Truhenrand (y = 670).
  const r = erzeugeRenderer('truhe-premium', { name: 'Mia', coins: 500 });
  const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
  r.zeichne(fakeKontext(z, true), 2.2, 1080, 1920);
  const hoch = z.log.filter((l) => { const m = /^translate\(([-\d.]+),([-\d.]+)\)$/.exec(l); return m && Number(m[1]) > 100 && Number(m[1]) < 1000 && Number(m[2]) > 0 && Number(m[2]) < 600; }); // Weltkoordinaten der Fontäne (Truhe startet bei y≈670)
  assert.ok(hoch.length >= 30, `nur ${hoch.length} Partikel über der Truhe`);
  r.destroy();
});

test('titel ersetzt den Titel der vier neuen Alarme (Feld vom Herz-Alarm)', () => {
  for (const id of PREMIUM_IDS) {
    const texte = texteVon(id, { name: 'Mia', titel: 'Danke Mia', coins: 5, fortschritt: 1, ziel: 2 });
    assert.ok(texte.includes('DANKE MIA'), `${id}: titel nicht übernommen`);
  }
});

test('Ziel erreicht: Titel, Pille fortschritt/ziel, Unterzeile auf 28 Zeichen + „…" gekürzt', () => {
  const texte = texteVon('ziel-erreicht', { name: 'Mia', fortschritt: 20, ziel: 20, unterzeile: 'Ein sehr langer Geschenkname der nicht passt' });
  assert.ok(texte.includes('ZIEL ERREICHT!'));
  assert.ok(texte.includes('20/20'));
  assert.ok(texte.includes('EIN SEHR LANGER GESCHENKNAME…'), texte.filter((t) => t.length > 10).join(' | '));
  assert.ok(!texte.some((t) => /LEVEL|TEAM-LEVEL/.test(t)), 'kein Level-Up-Text im Ziel-Alarm');
  assert.ok(texteVon('ziel-erreicht', { name: 'Mia', fortschritt: 3, ziel: 5, unterzeile: 'Rose' }).includes('ROSE'));
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
    // Alle Animationen — der Neu-Back-Weg muss in JEDEM Stil-Renderer greifen.
    const daten = { name: 'Mia', alt: 1, neu: 2, coins: 50, neuAbo: true, fortschritt: 1, ziel: 2 };
    const renderer = ALLE_IDS.map((id) => ({ id, r: erzeugeRenderer(id, daten), ebenen: [] as Array<{ width: number }> }));
    const male = (r: any) => r.zeichne(fakeKontext({ aufrufe: 0, nan: 0, log: [] }), 4, 1080, 1920);
    for (const x of renderer) {
      const vor = offscreenEbenen.length;
      male(x.r);
      x.ebenen = offscreenEbenen.slice(vor).filter((c) => c.width > 4);
      assert.ok(x.ebenen.length > 0, `${x.id}: keine Ebenen gebacken`);
    }
    const nachErstemBild = offscreenEbenen.length;
    for (const x of renderer) male(x.r);
    assert.equal(offscreenEbenen.length, nachErstemBild, 'ohne geladene Schrift (check() lügt „bereit") darf nichts neu gebacken werden');

    await ladeSchrift('http://127.0.0.1:27415', 'geheim');
    assert.equal(hinzugefuegt, 1, 'Schrift wurde nicht registriert');
    assert.match(geladeneUrls[0], /\/widgets\/inter-black\.woff2\?token=geheim/, 'ohne Schlüssel antwortet der Overlay-Server mit 403');

    for (const x of renderer) {
      const vor = offscreenEbenen.length;
      male(x.r);
      assert.ok(offscreenEbenen.length > vor, `${x.id}: nach dem Laden der Schrift nicht neu gebacken`);
      assert.ok(x.ebenen.some((c) => c.width === 0), `${x.id}: alte Ebenen beim Neu-Backen nicht freigegeben`);
    }
    const nachNeuBacken = offscreenEbenen.length;
    for (const x of renderer) male(x.r);
    assert.equal(offscreenEbenen.length, nachNeuBacken, 'neu gebacken wird nur einmal, nicht in jedem Bild');
    for (const x of renderer) x.r.destroy();
    // Zweiter Aufruf lädt nicht erneut.
    await ladeSchrift('http://127.0.0.1:27415', 'geheim');
    assert.equal(geladeneUrls.length, 1);
  } finally {
    delete g.document;
    delete g.FontFace;
  }
});

// ---- Twitch-Piraten: Sub, Bits, Raid ----
const PIRATEN_IDS = ['piraten-sub', 'piraten-bits', 'piraten-raid'];

test('Katalog: Twitch-Piraten mit Dauer, Sound und Ereignis', () => {
  const erwartet: Record<string, [number, string, string]> = {
    'piraten-sub': [6.2, 'botexe-superfan.wav', 'twitch_sub'],
    'piraten-bits': [6.4, 'botexe-truhe.wav', 'cheer'],
    'piraten-raid': [7.2, 'botexe-boom.wav', 'raid'],
  };
  for (const [id, [dauer, sound, art]] of Object.entries(erwartet)) {
    const a = ANIMATIONEN[id];
    assert.ok(a, `${id} fehlt im Katalog`);
    assert.equal(a.dauer, dauer);
    assert.equal(a.sound, sound);
    assert.deepEqual([...a.fuer], [art]);
    assert.equal(erzeugeRenderer(id, {}).dauer, dauer);
  }
});

for (const id of PIRATEN_IDS) {
  test(`${id}: rendert den ganzen Ablauf ohne NaN — auch lückenhaft, im Querformat und klein`, () => {
    for (const daten of [
      { name: 'KäptnMia', monate: 7, bits: 1500, nachricht: 'Ahoi!', zuschauer: 42, groesse: 75 },
      {},
      { geschenk: 'x', bits: null, zuschauer: -5, nachricht: 42, groesse: 'quatsch' },
      { name: '🖤'.repeat(60), geschenk: 9999, bits: 99999999, zuschauer: 99999999, nachricht: 'X'.repeat(300), groesse: 40 },
    ]) {
      const r = erzeugeRenderer(id, daten as any);
      for (let t = 0; t <= r.dauer + 1e-9; t += 0.2) {
        for (const [w, h] of [[1080, 1920], [1920, 1080]]) {
          const z: Zaehler = { aufrufe: 0, nan: 0, log: [] };
          r.zeichne(fakeKontext(z), t, w, h);
          assert.equal(z.nan, 0, `${id} ${JSON.stringify(daten)} t=${t.toFixed(1)} ${w}×${h}`);
          assert.ok(z.aufrufe > 0);
        }
      }
      const z0: Zaehler = { aufrufe: 0, nan: 0, log: [] };
      r.zeichne(fakeKontext(z0), 3, 0, 0);
      assert.equal(z0.aufrufe, 0, `${id}: ohne Fläche gezeichnet`);
      r.destroy();
    }
  });
}

test('Piraten-Sub: Titel je Fall — neu, Resub, verschenkt', () => {
  assert.ok(texteVon('piraten-sub', { name: 'Mia' }).some((t) => t.includes('NEUE CREW!')));
  assert.ok(texteVon('piraten-sub', { name: 'Mia', monate: 1 }).some((t) => t.includes('NEUE CREW!')), '1 Monat = neu');
  const resub = texteVon('piraten-sub', { name: 'Mia', monate: 14 });
  assert.ok(resub.some((t) => t.includes('14 MONATE AN BORD!')));
  assert.ok(!resub.some((t) => t.includes('NEUE CREW')));
  const gift = texteVon('piraten-sub', { name: 'Mia', geschenk: 1500, monate: 3 });
  assert.ok(gift.some((t) => t.includes('1.500 × CREW VERSCHENKT!')), 'Geschenk geht vor Monaten');
  assert.ok(gift.some((t) => t.includes('1.500 ABOS FÜR DIE CREW')));
  assert.ok(texteVon('piraten-sub', { geschenk: 1 }).some((t) => t.includes('1 ABO FÜR DIE CREW')));
});

test('Piraten-Bits: Zähler endet auf dem Betrag, Nachricht bereinigt und gekürzt', () => {
  const texte = texteVon('piraten-bits', { name: 'Ben', bits: 1500, nachricht: 'Ahoi\u0007 Käpt‮n,\n  Rum!' });
  assert.ok(texte.some((t) => t === '1.500 BITS'), 'Endstand');
  assert.ok(texte.some((t) => t === '0 BITS'), 'zählt von 0 hoch');
  const n = texte.find((t) => t.startsWith('„'));
  assert.ok(n, 'Nachricht fehlt');
  assert.ok(!/[\u0000-\u001f‮]/.test(n!), 'Steuerzeichen in der Nachricht');
  const lang = texteVon('piraten-bits', { bits: 5, nachricht: 'Y'.repeat(300) }).find((t) => t.startsWith('„'))!;
  assert.ok(Array.from(lang).length <= 48, `zu lang: ${lang.length}`);
  assert.ok(!texteVon('piraten-bits', { bits: 5 }).some((t) => t.startsWith('„')), 'ohne Nachricht keine Zeile');
});

test('Piraten-Raid: ENTERN! und „{n} PIRATEN VON {name}" (1 → PIRAT, 0 → RAID VON)', () => {
  const texte = texteVon('piraten-raid', { name: 'KrakenKalle', zuschauer: 1234 });
  assert.ok(texte.some((t) => t.includes('ENTERN!')));
  assert.ok(texte.some((t) => t === '1.234 PIRATEN VON KRAKENKALLE'));
  assert.ok(texteVon('piraten-raid', { name: 'Solo', zuschauer: 1 }).some((t) => t === '1 PIRAT VON SOLO'));
  assert.ok(texteVon('piraten-raid', { name: 'Leer' }).some((t) => t === 'RAID VON LEER'));
});

test('Twitch-Piraten: deterministisch (Sprung = durchgespielt)', () => {
  for (const id of PIRATEN_IDS) {
    const bild = (r: any, t: number) => { const z: Zaehler = { aufrufe: 0, nan: 0, log: [] }; r.zeichne(fakeKontext(z, true), t, 1080, 1920); return z.log.join('\n'); };
    const d = { name: 'Mia', bits: 2000, zuschauer: 5, geschenk: 5 };
    const a = erzeugeRenderer(id, d), b = erzeugeRenderer(id, d);
    for (let t = 0; t < 3.2; t += 1 / 60) a.zeichne(fakeKontext({ aufrufe: 0, nan: 0, log: [] }), t, 1080, 1920);
    assert.equal(bild(a, 3.2), bild(b, 3.2), `${id}: Sprung ≠ durchgespielt`);
  }
});
