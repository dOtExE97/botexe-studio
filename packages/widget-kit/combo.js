// combo.js — reine Combo-Mathematik für Effekt-Widgets (Feuerwerk, Glas).
// DOM-frei und damit in node testbar.
//
// Warum: TikTok fasst eine Combo (z.B. „10x Rose") zu EINEM Gift-Event mit
// count=10 zusammen. Skaliert man die Show nur über totalCoins (10 Coins =
// winzig), kommt bei 10x Rose nur eine Mini-Rakete. Hier leiten wir aus
// count UND Coin-Wert ab, wie viele Effekt-Elemente in welcher Stärke kommen.

/** Einzel-Burst-Stärke (0..1) aus dem Coin-Wert EINES Gifts. */
export function burstPower(coins) {
  return Math.min(1, Math.log10(Math.max(1, coins)) / 3);
}

/**
 * Plan für ein Gift-Event:
 *   rockets — wie viele Effekt-Elemente (= Combo-Anzahl, gedeckelt durch max)
 *   power   — Stärke je Element (0..1)
 *
 * opts (im Widget einstellbar):
 *   mode      — 'fan' (Default): Combo fächert in count Raketen auf, Power je
 *               Rakete aus dem Einzel-Coin-Wert. 'single': IMMER eine Rakete,
 *               Power aus den GESAMT-Coins (ein großer Burst statt Volley).
 *   burstScale— Multiplikator der Power (0.5 = halb, 2 = doppelt), gedeckelt 0..1.
 */
export function comboPlan(gift, max, opts) {
  const mode = opts?.mode === 'single' ? 'single' : 'fan';
  const burstScale = Number(opts?.burstScale ?? 1) || 1;
  const cap = Math.max(1, Math.floor(max || 1));
  const count = Math.max(1, Math.floor(gift?.count || 1));
  // Einzel-Coin-Wert: gegeben nehmen, sonst aus totalCoins/count ableiten —
  // NICHT totalCoins selbst (sonst überschätzt eine Combo die Einzelstärke).
  const givenPerUnit = Number(gift?.coinsPerUnit ?? 0);
  const givenTotal = Number(gift?.totalCoins ?? 0);
  const coinsPerUnit = Math.max(1, givenPerUnit || (givenTotal ? givenTotal / count : 1));
  const totalCoins = Math.max(1, givenTotal || coinsPerUnit * count);

  let rockets;
  let power;
  if (mode === 'single') {
    rockets = 1;
    power = burstPower(totalCoins);
  } else {
    rockets = Math.min(cap, count);
    power = burstPower(coinsPerUnit);
    // Combo größer als das Element-Cap → Reststärke auf die Elemente verteilen,
    // damit eine 60x-Combo sichtbar wuchtiger ist als eine 12x-Combo.
    if (count > rockets) {
      power = Math.min(1, power + 0.12 * Math.log2(count / rockets + 1));
    }
  }
  power = Math.max(0, Math.min(1, power * burstScale));
  return { rockets, power };
}
