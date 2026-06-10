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

const ajv = new Ajv({ allErrors: true });
const validateFn: ValidateFunction = ajv.compile(layoutJsonSchema);

export type LayoutValidationResult =
  | { ok: true; layout: OverlayLayout }
  | { ok: false; errors: string[] };

export function validateLayout(data: unknown): LayoutValidationResult {
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

export function createDefaultLayout(name: string, id?: string): OverlayLayout {
  const now = new Date().toISOString();
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    id: id ?? `layout-${Date.now().toString(36)}`,
    name,
    canvas: { width: 1920, height: 1080, background: 'transparent' },
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
}
