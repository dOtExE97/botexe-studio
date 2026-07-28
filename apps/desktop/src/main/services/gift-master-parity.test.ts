// Wächter gegen die Lücke, die Alex gefunden hat (28.07.2026):
//
// Die eingebaute Master-Liste ALLER TikTok-Geschenke (5726 Einträge mit
// Bild-Adresse) lag unter renderer/lib und wurde NUR im App-Fenster
// dazugemischt. Der Overlay-Server lieferte den Widgets bloß den selbst
// gesammelten Katalog. Folge: Im Fenster ließ sich „Galaxy" mit Bild auswählen,
// im Stream zeigte dasselbe Geschenk einen grauen Platzhalter — es sah aus wie
// ein kaputtes Widget, obwohl die Einstellung stimmte.
//
// Nicht „doppelt gepflegt", sondern schlimmer: nur EINER Seite bekannt. Diese
// Tests halten fest, dass beide Seiten dieselbe Zusammenführung benutzen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MASTER, mergeMitMaster, mergeMitMasterAlsMap, masterKey, masterIcon } from '../../shared/gift-master';

const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

test('Master-Liste ist vollständig und trägt Bild-Adressen', () => {
  assert.ok(MASTER.length > 5000, `nur ${MASTER.length} Geschenke — Liste unvollständig?`);
  const ohneBild = MASTER.filter((m) => !m.icon);
  assert.equal(ohneBild.length, 0, `${ohneBild.length} Geschenke ohne Bild-Adresse`);
  // Stichproben: die teuren Geschenke, die im Stream als Platzhalter auffielen.
  for (const name of ['Galaxy', 'Lion', 'Hat and Mustache', 'Rose', 'Finger Heart']) {
    const t = MASTER.find((m) => m.name.trim() === name);
    assert.ok(t, `${name} fehlt in der Master-Liste`);
    assert.ok(t?.icon, `${name} hat keine Bild-Adresse`);
  }
});

test('mergeMitMaster: eigene Einträge gewinnen, Master füllt nur Lücken', () => {
  const eigene = {
    rose: { slug: 'Rose', coins: 1, count: 42, icon: 'http://127.0.0.1/lokal.webp', iconFile: 'r.webp' },
  };
  const zusammen = mergeMitMaster(eigene);

  const rose = zusammen.filter((g) => masterKey(g.slug) === 'rose');
  assert.equal(rose.length, 1, 'Rose darf nur EINMAL vorkommen');
  assert.equal(rose[0]?.count, 42, 'eigener Zähler bleibt');
  assert.equal(rose[0]?.icon, 'http://127.0.0.1/lokal.webp', 'lokales Bild gewinnt über die TikTok-Adresse');

  // Ein nie erhaltenes Geschenk kommt aus der Master-Liste — mit Bild.
  const galaxy = zusammen.find((g) => masterKey(g.slug) === 'galaxy');
  assert.ok(galaxy, 'Galaxy muss auch ohne eigenen Eintrag dabei sein');
  assert.equal(galaxy?.count, 0);
  assert.ok(galaxy?.icon, 'Galaxy braucht eine Bild-Adresse');
});

test('Fenster und Overlay benutzen DIESELBE Zusammenführung', () => {
  // Der Kern der Sache: Beide Wege müssen zur selben Menge führen.
  const eigene = { rose: { slug: 'Rose', coins: 1, count: 7 } };
  const alsListe = mergeMitMaster(eigene);          // so sieht es das App-Fenster
  const alsMap = mergeMitMasterAlsMap(eigene);      // so bekommt es das Overlay
  assert.equal(Object.keys(alsMap).length, alsListe.length, 'gleiche Anzahl Geschenke');
  for (const e of alsListe) {
    assert.ok(alsMap[masterKey(e.slug)], `${e.slug} fehlt in der Overlay-Sicht`);
  }
});

test('Master-Liste wird NICHT mehr direkt importiert — nur über die geteilte Datei', () => {
  // Wer die .json direkt einbindet, umgeht die Zusammenführung und baut damit
  // erneut eine Sicht, die die andere Seite nicht kennt.
  const erlaubt = join('shared', 'gift-master.ts');
  const treffer: string[] = [];
  const walk = (dir: string) => {
    for (const e of eintraege(dir)) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')) {
        const inhalt = readFileSync(p, 'utf-8');
        if (inhalt.includes('gift-master.json') && !p.endsWith(erlaubt)) treffer.push(p);
      }
    }
  };
  walk(SRC);
  assert.deepEqual(
    treffer,
    [],
    `Diese Dateien binden gift-master.json direkt ein statt shared/gift-master.ts zu nutzen:\n  ${treffer.join('\n  ')}`,
  );
});

function eintraege(dir: string): { name: string; isDirectory(): boolean }[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

test('masterIcon: findet das Bild ueber Namen UND ueber die Gift-ID', () => {
  // Diese Funktion versorgt die zehn Widgets, die ihr Bild aus dem Ereignis
  // nehmen (Coin-Glas, Feuerwerk, Kanone, Alert, Feed ...). Liefert TikTok im
  // Ereignis kein Bild mit, springt sie ein.
  for (const n of ['Galaxy', 'Lion', 'Rose', 'Hat and Mustache']) {
    assert.ok(masterIcon(n).startsWith('http'), `${n} ohne Bild`);
  }
  // Schreibweise egal — wie ueberall in der App.
  assert.equal(masterIcon('hat-and-mustache'), masterIcon('Hat and Mustache'));
  assert.equal(masterIcon('GALAXY'), masterIcon('Galaxy'));

  // Ueber die ID, falls der Name unbekannt ist (TikTok schickt manchmal nur die ID).
  const mitId = MASTER.find((m) => m.icon && m.id > 0);
  assert.ok(mitId);
  assert.equal(masterIcon('vollkommen-unbekanntes-geschenk', mitId?.id), mitId?.icon);

  // Nichts Passendes -> leer, damit der Aufrufer den Platzhalter behaelt.
  assert.equal(masterIcon('gibtesnicht12345'), '');
  assert.equal(masterIcon(''), '');
});
