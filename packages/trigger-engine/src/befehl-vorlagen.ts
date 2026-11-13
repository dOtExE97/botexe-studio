// befehl-vorlagen.ts — fertige Piraten-Befehle zum Hinzufügen per Klick
// (Seite „Befehle" → „Piraten-Vorlagen"). Bewusst KEINE Standardbefehle: Die
// App hat kein Verfahren, bestehenden Nutzern Befehle unterzuschieben, und ein
// Bot, der plötzlich von selbst in den Chat schreibt, wäre eine Überraschung.
// Antworten gehen in den Chat der Plattform, aus der der Befehl kam.
import type { ChatCommand } from './index';

const PAUSE = { cooldownMs: 10_000, userCooldownMs: 30_000 } as const;

function vorlage(id: string, command: string, response: string, extra: Partial<ChatCommand> = {}): ChatCommand {
  return { id: `vorlage-${id}`, command, response, speak: false, sendToChat: true, who: 'all', ...PAUSE, enabled: true, ...extra };
}

/** Frische Kopie der Piraten-Vorlagen (Platzhalter siehe befehl-variablen.ts). */
export function piratenVorlagen(): ChatCommand[] {
  return [
    vorlage('kiste', '!kiste', '@{user} Dein Piraten-Token liegt in Kiste {kiste} 🏴‍☠️'),
    vorlage('song', '!song', '🎵 Gerade läuft: {song}'),
    vorlage('musik', '!musik', '🎵 Gerade läuft: {song}'),
    vorlage('uptime', '!uptime', '⏱️ Wir segeln schon seit {uptime}'),
    vorlage('discord', '!discord', '🏴‍☠️ Discord: {discord}'),
    vorlage('tiktok', '!tiktok', '🏴‍☠️ TikTok: {tiktok}'),
    vorlage('insta', '!insta', '🏴‍☠️ Instagram: {insta}'),
    vorlage('socials', '!socials', '🏴‍☠️ Discord: {discord} · TikTok: {tiktok} · Insta: {insta}'),
    vorlage('lurk', '!lurk', '@{user} versteckt sich im Krähennest 👀 Danke fürs Mitsegeln!'),
    vorlage('ziel', '!ziel', 'Auf dem Weg zum Affiliate: {ziel} Follower ⚓'),
    vorlage('top', '!top', '🏆 Größte Schatzbringer heute: {top}'),
    vorlage('befehle', '!befehle', '📜 Befehle an Bord: {befehle}'),
    vorlage('hug', '!hug', '{user} umarmt {ziel_user} 🤗'),
    vorlage('sr', '!sr', '🎵 @{user} {song} ist in der Warteschlange ⚓', { aktion: 'song_request', userCooldownMs: 60_000 }),
  ];
}

const norm = (c: string) => c.trim().toLowerCase().replace(/^!*/, '');

/** Die Vorlagen, die noch fehlen — nach Befehl UND id, damit nichts doppelt landet. */
export function fehlendeVorlagen(vorhanden: ChatCommand[]): ChatCommand[] {
  const befehle = new Set(vorhanden.map((c) => norm(c.command)));
  const ids = new Set(vorhanden.map((c) => c.id));
  return piratenVorlagen().filter((v) => !befehle.has(norm(v.command)) && !ids.has(v.id));
}
