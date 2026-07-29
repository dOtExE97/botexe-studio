// Reihenfolge im Geschenk-Auswähler.
//
// Anlass (aus der Praxis): Jemand wollte die Geldpistole in ein Widget legen
// und hat sich durch hunderte fremder Fan-Club-Abzeichen gescrollt. Von den
// 5726 bekannten Geschenken sind über 4000 solche Abzeichen anderer Streamer
// („2ACT Crew", „805Chiefz", …) — alle für 1 Coin. Sortiert wurde nach Preis,
// also standen genau die ganz oben.
//
// Die Sortierlogik ist hier nachgebaut, damit sie ohne DOM prüfbar ist. Ändert
// sie sich in GiftPicker.tsx, muss dieser Test mitziehen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMitMaster } from '../../shared/gift-master';

interface G { slug: string; coins: number; count: number; de?: string }

const rang = (g: G): number => {
  if (g.count > 0) return 0;
  if (g.de) return 1;
  if ((g.coins || 0) > 1) return 2;
  return 3;
};

const sortiere = (list: G[]) => [...list].sort((a, b) =>
  rang(a) - rang(b) || (a.coins || 0) - (b.coins || 0) || a.slug.localeCompare(b.slug));

/** Katalog eines Nutzers, der noch nichts erhalten hat — der schlimmste Fall. */
const frisch = () => mergeMitMaster({}) as unknown as G[];

test('oben stehen bekannte Geschenke, nicht fremde Fan-Club-Abzeichen', () => {
  const erste20 = sortiere(frisch()).slice(0, 20);
  // „Bekannt" heißt hier: hat einen deutschen Namen (= in unseren Listen
  // gepflegt) oder kostet mehr als 1 Coin.
  const unbekannt = erste20.filter((g) => !g.de && (g.coins || 0) <= 1);
  assert.deepEqual(
    unbekannt.map((g) => g.slug),
    [],
    'Unter den ersten 20 dürfen keine namenlosen 1-Coin-Abzeichen sein',
  );
});

test('schon erhaltene Geschenke stehen ganz oben', () => {
  // Was bei DIR wirklich vorkommt, ist relevanter als alles andere — auch
  // wenn es teuer ist und deshalb sonst weit hinten stünde.
  const mitEigenem = mergeMitMaster({
    lion: { slug: 'Lion', coins: 29999, count: 3 },
  }) as unknown as G[];
  const erstes = sortiere(mitEigenem)[0];
  assert.equal(erstes?.slug, 'Lion', 'das selbst erhaltene Geschenk muss zuerst kommen');
});

test('die Geldpistole steht deutlich weiter vorn als vorher', () => {
  const sortiert = sortiere(frisch());
  const platz = sortiert.findIndex((g) => g.slug.trim() === 'Money Gun') + 1;
  assert.ok(platz > 0, 'Geldpistole muss im Katalog sein');
  // Vorher (nach Preis sortiert) lag sie hinter über 4000 Abzeichen.
  assert.ok(platz < 1000, `Geldpistole auf Platz ${platz} — zu weit hinten`);
});

test('die Master-Liste enthält wirklich massenhaft fremde Abzeichen', () => {
  // Absicherung der Annahme, auf der die ganze Sortierung beruht. Ändert
  // TikTok das Datenmodell, fällt es hier auf statt beim Nutzer.
  const alle = frisch();
  const abzeichen = alle.filter((g) => !g.de && (g.coins || 0) <= 1);
  assert.ok(
    abzeichen.length > 2000,
    `nur ${abzeichen.length} namenlose 1-Coin-Einträge — stimmt die Annahme noch?`,
  );
});
