// @botexe/overlay-engine — Layout-DSL + Schema-Validierung (Audit K3:
// JEDES Layout wird vor Save UND Load validiert; ungültige Daten — egal ob
// von Hand, KI oder kaputter Datei — kommen nie auf Disk bzw. nie in die App).

import Ajv, { type ValidateFunction } from 'ajv';

export const LAYOUT_SCHEMA_VERSION = 1 as const;

export interface OverlayCanvas {
  width: number;
  height: number;
  /** 'transparent' für TTLS-Browser-Quelle; sonst CSS-Farbe (Preview/Debug). */
  background: 'transparent' | string;
}

export interface OverlayLayer {
  /** Eindeutig im Layout — Trigger-Actions referenzieren diese ID. */
  id: string;
  /** Key in der Widget-Registry (z.B. 'gift-alert', 'goal-bar', 'chat-box'). */
  widgetType: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
  opacity?: number;
  props?: Record<string, unknown>;
}

export interface OverlayLayout {
  schemaVersion: typeof LAYOUT_SCHEMA_VERSION;
  id: string;
  name: string;
  canvas: OverlayCanvas;
  layers: OverlayLayer[];
  createdAt: string;
  updatedAt: string;
}

const layoutJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'id', 'name', 'canvas', 'layers', 'createdAt', 'updatedAt'],
  properties: {
    schemaVersion: { const: LAYOUT_SCHEMA_VERSION },
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    canvas: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'height', 'background'],
      properties: {
        width: { type: 'integer', minimum: 16, maximum: 7680 },
        height: { type: 'integer', minimum: 16, maximum: 7680 },
        background: { type: 'string', minLength: 1 },
      },
    },
    layers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'widgetType', 'name', 'x', 'y', 'w', 'h', 'z', 'visible'],
        properties: {
          id: { type: 'string', minLength: 1 },
          widgetType: { type: 'string', minLength: 1 },
          name: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          w: { type: 'number', minimum: 0 },
          h: { type: 'number', minimum: 0 },
          z: { type: 'number' },
          visible: { type: 'boolean' },
          opacity: { type: 'number', minimum: 0, maximum: 1 },
          props: { type: 'object' },
        },
      },
    },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
} as const;

// LAZY kompilieren — ajv erzeugt Code via `new Function()` (eval-artig).
// Der Renderer importiert dieses Modul nur für Presets/SafeZones/Typen;
// ein Top-Level-Compile würde dort an der CSP (kein unsafe-eval) sterben
// und die ganze App schwarz lassen. Nur der Main-Prozess validiert wirklich.
let validateFnCache: ValidateFunction | null = null;
function getValidateFn(): ValidateFunction {
  if (!validateFnCache) validateFnCache = new Ajv({ allErrors: true }).compile(layoutJsonSchema);
  return validateFnCache;
}

export type LayoutValidationResult =
  | { ok: true; layout: OverlayLayout }
  | { ok: false; errors: string[] };

export function validateLayout(data: unknown): LayoutValidationResult {
  const validateFn = getValidateFn();
  if (!validateFn(data)) {
    const errors = (validateFn.errors ?? []).map(
      (e) => `${e.instancePath || '/'} ${e.message ?? 'ungültig'}`,
    );
    return { ok: false, errors: errors.length > 0 ? errors : ['Layout entspricht nicht dem Schema'] };
  }

  const layout = data as OverlayLayout;

  // Über JSON-Schema hinaus: Layer-IDs müssen eindeutig sein, sonst sind
  // Trigger-Targets mehrdeutig (Audit-Finding „Doppelte Layer-IDs").
  const seen = new Set<string>();
  for (const layer of layout.layers) {
    if (seen.has(layer.id)) {
      return { ok: false, errors: [`Doppelte Layer-ID: "${layer.id}"`] };
    }
    seen.add(layer.id);
  }

  return { ok: true, layout };
}

export type CanvasPreset = 'portrait' | 'landscape';

export const CANVAS_PRESETS: Record<CanvasPreset, { width: number; height: number; label: string }> = {
  portrait: { width: 1080, height: 1920, label: 'Hochformat (TikTok)' },
  landscape: { width: 1920, height: 1080, label: 'Querformat' },
};

export function createDefaultLayout(name: string, id?: string, preset: CanvasPreset = 'portrait'): OverlayLayout {
  const now = new Date().toISOString();
  const { width, height } = CANVAS_PRESETS[preset];
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    id: id ?? `layout-${Date.now().toString(36)}`,
    name,
    canvas: { width, height, background: 'transparent' },
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── TikTok SafeZones (aus botexe-app übernommen) ──────────────────────────
// Bereiche, in denen die TikTok-Live-UI Widgets verdecken kann. Der Editor
// blendet sie als Guides ein; gerendert wird im Overlay nichts davon.

export type SafeZoneKind = 'blocked' | 'risky' | 'focus';

export interface SafeZoneRect {
  id: string;
  label: string;
  kind: SafeZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  note?: string;
}

export interface SafeZoneProfile {
  id: string;
  label: string;
  canvas: { width: number; height: number };
  zones: SafeZoneRect[];
}

export const SAFEZONE_PROFILES: SafeZoneProfile[] = [
  {
    id: 'tiktok-live-portrait',
    label: 'TikTok LIVE Hochformat',
    canvas: { width: 1080, height: 1920 },
    zones: [
      { id: 'top-live-header', label: 'LIVE-Header / Creator-Info', kind: 'risky', x: 0, y: 0, w: 1080, h: 190, note: 'Creator, LIVE-Badge, Viewer-Zahl, Follow-Button — variiert je Gerät.' },
      { id: 'right-engagement-rail', label: 'Rechte Leiste / Engagement', kind: 'risky', x: 875, y: 300, w: 205, h: 1120, note: 'Like/Share/Gift-Buttons und native Prompts.' },
      { id: 'bottom-chat-gift', label: 'Chat / Eingabe / Gift-Tray', kind: 'blocked', x: 0, y: 1420, w: 1080, h: 500, note: 'LIVE-Chat, Eingabezeile, Gift-Leiste, Join-/Gift-Hinweise.' },
      { id: 'center-focus', label: 'Bester Bereich', kind: 'focus', x: 90, y: 220, w: 760, h: 1120, note: 'Hier sind dauerhafte Widgets am besten lesbar.' },
    ],
  },
  {
    id: 'tiktok-live-landscape',
    label: 'TikTok LIVE Querformat',
    canvas: { width: 1920, height: 1080 },
    zones: [
      { id: 'top-header', label: 'Oberer Header', kind: 'risky', x: 0, y: 0, w: 1920, h: 120, note: 'LIVE-Header und App-Chrome variieren.' },
      { id: 'right-chat-column', label: 'Rechte Chat-Spalte', kind: 'blocked', x: 1420, y: 120, w: 500, h: 820, note: 'Im Querformat liegt der Zuschauer-Chat meist rechts.' },
      { id: 'bottom-controls', label: 'Untere Controls', kind: 'risky', x: 0, y: 900, w: 1920, h: 180, note: 'Eingabe, Gift- und App-Controls.' },
      { id: 'left-safe-content', label: 'Bester Bereich', kind: 'focus', x: 70, y: 145, w: 1280, h: 720 },
    ],
  },
];

export function getSafeZoneProfile(width: number, height: number): SafeZoneProfile | null {
  return SAFEZONE_PROFILES.find((p) => p.canvas.width === width && p.canvas.height === height) ?? null;
}
