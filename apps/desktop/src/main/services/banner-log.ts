// banner-log.ts — lesbare Logzeilen für Banner-Ereignisse (Level-Up, Superfan,
// VIP), LIVE-Ziele und Schatztruhen. Eigene Datei, damit die Zeilen prüfbar sind
// (banner-log.test.ts) — gerade sie sollen im ersten Live beweisen, was ankommt.
import type { StudioEvent } from '@botexe/trigger-engine';
import { log } from '../core/logger';

/** Lesbare Logzeilen für Banner (Level-Up, Superfan, VIP), LIVE-Ziele und Schatztruhen. */
export function logBannerEreignis(e: StudioEvent): void {
  const name = e.user?.nickname ?? '—';
  if (e.type === 'level_up' && e.levelUp) {
    const titel = e.levelUp.art === 'team' ? 'Teamherz-Level-Up' : 'Geschenke-Stufe-Level-Up';
    log.info('TikTok', `${titel}: ${name} → Stufe ${e.levelUp.neu}`);
  } else if (e.type === 'superfan') {
    if (e.superfanArt === 'abo_neu') log.info('TikTok', `Neuer Superfan (Abo): ${name}`);
    else if (e.superfanArt === 'abo_verlaengert') log.info('TikTok', `Superfan-Abo verlängert: ${name}`);
    else if (e.superfanArt === 'betritt') {
      log.gedrosselt(`superfan:betritt:${e.user?.id ?? name}`, 10 * 60_000, 'info', 'TikTok',
        `Superfan betritt das Live: ${name}`);
    }
  } else if (e.type === 'vip_betritt' && e.vip) {
    log.gedrosselt(`vip:betritt:${e.user?.id ?? name}`, 10 * 60_000, 'info', 'TikTok',
      `VIP betritt das Live: ${name} (Geschenke-Stufe ${e.vip.stufe})`);
  } else if (e.type === 'live_ziel' && e.ziel) {
    const z = e.ziel;
    const was = z.geschenk?.name ?? z.beschreibung ?? 'Ziel';
    const text = `${z.fortschritt}/${z.ziel} ${was} — Beitrag von ${name}`;
    // Nur die Flanke (vom Adapter bestimmt) ungedrosselt — jedes weitere Update
    // eines erreichten Ziels ist ein Zwischenstand wie jeder andere.
    if (z.geradeErreicht) log.info('TikTok', `LIVE-Ziel erreicht: ${text}`);
    else log.gedrosselt('live-ziel', 30_000, 'info', 'TikTok', `LIVE-Ziel: ${text}`);
  } else if (e.type === 'envelope' && e.envelope) {
    log.info('TikTok', `Schatztruhe von ${name}: ${e.envelope.coins} Coins, ${e.envelope.winners} Leute (Art ${e.envelope.businessType ?? '?'}, ID ${e.envelope.envelopeId ?? '—'})`);
  }
}
