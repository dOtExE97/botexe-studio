// moderation.ts — kuratierte Standard-Blockliste für die TTS-Moderation.
// Plattformneutral (Renderer-Button „Standard-Blockliste laden" + Main-Tests).
//
// Auswahlkriterien: eindeutige Beleidigungen/Slurs, die als TEILWORT sicher
// sind (die Moderation matcht Teilworte, Groß/klein egal) — also keine kurzen
// Alltagswort-Bestandteile, die harmlose Nachrichten fälschlich blocken würden.
export const DEFAULT_BLOCKLIST: string[] = [
  // Deutsch
  'hurensohn', 'hurentochter', 'wichser', 'fotze', 'schlampe', 'missgeburt',
  'arschloch', 'verpiss dich', 'fick dich', 'neger',
  // Englisch
  'nigger', 'nigga', 'faggot', 'retard', 'cunt', 'kill yourself', 'kys',
  // NS-Bezug
  'sieg heil', 'heil hitler',
];
