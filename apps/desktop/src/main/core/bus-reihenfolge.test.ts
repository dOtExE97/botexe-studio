// bus-reihenfolge.test.ts — Wer zuerst zuhört, sieht das Ereignis zuerst.
//
// WORUM ES GEHT
// Ein Geschenk-Ereignis wird auf dem Bus NICHT fertig veröffentlicht. Es kommt
// roh an und wird erst in einem Bus-Abonnenten angereichert: Studio.wireBus()
// hängt das fehlende Geschenk-Bild aus dem Katalog nach, setzt den
// Anzeigenamen und markiert den ersten Auftritt eines Zuschauers.
//
// Der Overlay-Server ist ein ZWEITER Abonnent, der das Ereignis unverändert an
// alle Browser-Quellen weitergibt. Damit im Stream das Bild ankommt, muss die
// Anreicherung VORHER gelaufen sein. Es hält aber nichts diese Reihenfolge
// fest — sie ergibt sich allein daraus, dass Studio.wireBus() im Konstruktor
// läuft und server.start() erst in start().
//
// Verschiebt jemand server.start() einen Schritt nach vorn, zeigen zehn
// Widgets stillschweigend wieder Platzhalter statt Geschenk-Bildern. Kein
// Fehler, keine Meldung — nur fade Bilder im Stream.
//
// Diese Datei nagelt beide Hälften fest: die Zustellreihenfolge des Busses und
// die Aufrufreihenfolge in studio.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EventBus } from './event-bus';
import type { StudioEvent } from '@botexe/trigger-engine';

// Gleiches Muster wie cloud-vollstaendigkeit.test.ts: Der Testlauf startet je
// nach Aufruf im Arbeitsordner oder im Repo-Wurzelverzeichnis.
const SRC = existsSync(join(process.cwd(), 'src', 'main.ts'))
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'apps', 'desktop', 'src');

function gift(): StudioEvent {
  return {
    type: 'gift',
    ts: Date.now(),
    gift: { slug: 'rose', count: 1, coinsPerUnit: 1, totalCoins: 1 },
  };
}

test('der Bus stellt in der Reihenfolge der Anmeldung zu', () => {
  const bus = new EventBus();
  const reihe: string[] = [];
  bus.subscribeAll(() => reihe.push('erster'));
  bus.subscribeAll(() => reihe.push('zweiter'));
  bus.publish(gift());
  assert.deepEqual(reihe, ['erster', 'zweiter'],
    'Wer sich zuerst anmeldet, wird zuerst benachrichtigt — darauf baut die Anreicherung.');
});

test('was der erste Abonnent ergänzt, sieht der zweite', () => {
  const bus = new EventBus();
  let gesehen: string | undefined = 'noch nichts';

  // So arbeitet Studio.wireBus(): das Ereignis wird an Ort und Stelle ergänzt.
  bus.subscribeAll((e) => { if (e.gift && !e.gift.icon) e.gift.icon = 'rose.png'; });
  // So arbeitet der Overlay-Server: er reicht weiter, was ankommt.
  bus.subscribeAll((e) => { gesehen = e.gift?.icon; });

  bus.publish(gift());
  assert.equal(gesehen, 'rose.png',
    'Das Overlay bekommt das nachgetragene Bild — sonst zeigen die Widgets Platzhalter.');
});

test('studio.ts meldet den Bus im Konstruktor an — der Overlay-Server erst in start()', () => {
  const quelle = readFileSync(join(SRC, 'main', 'services', 'studio.ts'), 'utf-8');

  // Geprüft wird, WO die Aufrufe stehen, nicht in welcher Zeile sie zufällig
  // landen: Eine Methode zu verschieben darf diesen Test nicht auslösen.
  const ctorAnfang = quelle.indexOf('  constructor(');
  const ctorEnde = quelle.indexOf('  private wireBus(): void {');
  assert.ok(ctorAnfang > 0 && ctorEnde > ctorAnfang,
    'Konstruktor und wireBus()-Definition müssen auffindbar bleiben — sonst prüft dieser Test nichts.');
  const ctor = quelle.slice(ctorAnfang, ctorEnde);

  // Zeilenweise und OHNE Kommentarzeilen: Ein auskommentierter Aufruf enthält
  // die Zeichenkette weiterhin und käme bei einer reinen Textsuche durch.
  // (Genau das ist beim Gegencheck dieses Tests passiert.)
  const echterCode = (abschnitt: string) => abschnitt
    .split('\n')
    .filter((z) => !z.trim().startsWith('//') && !z.trim().startsWith('*'))
    .join('\n');

  assert.match(echterCode(ctor), /^\s*this\.wireBus\(\);/m,
    'wireBus() gehört in den Konstruktor. Dort meldet es sich als ERSTER am Bus an und '
    + 'reichert jedes Ereignis an, bevor der Overlay-Server es weiterreicht.');
  assert.ok(!echterCode(ctor).includes('this.server.start()'),
    'server.start() darf NICHT im Konstruktor stehen. Sonst hört der Overlay-Server vor der '
    + 'Anreicherung zu und sendet Geschenke ohne Bild an alle Browser-Quellen — lautlos.');
  assert.ok(quelle.includes('await this.server.start();'),
    'server.start() muss weiterhin in start() aufgerufen werden.');
});
