// Twitch-Overlay (Querformat) als fertige Vorlage — der „Twitch-Mode" aus dem
// Design (docs/superpowers/specs/2026-11-13-twitch-anbindung-design.md).
//
// Ein Layout 1920×1080 mit `plattform: 'twitch'`: Es bekommt nur Twitch-Ereignisse
// (und solche ohne Plattform wie Timer/Test). Die Ebenen sind auf ein
// Shooter-Bild wie Fortnite gelegt: die Mitte bleibt frei, die Ecken mit dem
// Spiel-HUD (Minikarte oben rechts, Waffenleiste unten rechts) auch.
//
// Bewusst ohne React-Import und ohne Validierung hier: ajv darf im Renderer
// nicht kompilieren (CSP), geprüft wird beim Speichern im Main-Prozess — und
// im Test (twitch-vorlage.test.ts) gegen dasselbe Schema.
import type { OverlayLayer, OverlayLayout } from '@botexe/overlay-engine';
import { WIDGET_TYPES } from './widget-types';

interface Platz {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  props?: Record<string, unknown>;
}

const PLAETZE: Platz[] = [
  // Banner oben links: „FOLLOW = KISTEN BIS ZUM TOKEN". Token-/Kistenbild
  // bleiben leer — das Banner zeichnet dann selbst eine Goldmünze.
  { id: 'twitch-piraten-banner', type: 'piraten-banner', x: 24, y: 24, w: 640, h: 120 },
  // Kleine Einblendung direkt unter dem Banner — NUR für Subs: einen Follow
  // feiert schon das Piraten-Orakel (sonst zwei Einblendungen je Follow).
  // „Geteilt" gibt es auf Twitch nicht.
  {
    id: 'twitch-follow-alert', type: 'follow-alert', x: 24, y: 160, w: 460, h: 90,
    props: { events: ['sub'] },
  },
  // Chat rechts, unter der Minikarte und über der Waffenleiste.
  { id: 'twitch-chat', type: 'chat-box', x: 1500, y: 330, w: 400, h: 580 },
  // Piraten-Orakel bei jedem Follow. Die Animation ist hochkant gezeichnet
  // (1080×1920) und wird eingepasst — 700×1080 mittig ergibt die volle Höhe.
  // Modus „Ereignisse" mit NUR Follow: Teamherz, Truhe & Co. gibt es auf
  // Twitch nicht. Orakel-Bilder leer → gezeichnete Münze und Truhe.
  {
    id: 'twitch-herz-alarm', type: 'herz-alarm', x: 610, y: 0, w: 700, h: 1080,
    props: { modus: 'ereignisse', ereignisse: ['follow'] },
  },
];

export function erzeugeTwitchVorlage(id: string, name = 'Twitch (Querformat)'): OverlayLayout {
  const jetzt = new Date().toISOString();
  const layers: OverlayLayer[] = [];
  PLAETZE.forEach((p, i) => {
    const def = WIDGET_TYPES.find((wt) => wt.type === p.type);
    if (!def) return;
    layers.push({
      id: p.id,
      widgetType: def.type,
      name: def.label,
      x: p.x, y: p.y, w: p.w, h: p.h,
      z: i + 1,
      visible: true,
      // Standard-Props kopieren (Arrays nicht teilen — der Editor ändert sie).
      props: structuredClone({ ...def.props, ...(p.props ?? {}) }),
    });
  });
  return {
    schemaVersion: 1,
    id,
    name,
    plattform: 'twitch',
    canvas: { width: 1920, height: 1080, background: 'transparent' },
    layers,
    createdAt: jetzt,
    updatedAt: jetzt,
  };
}
