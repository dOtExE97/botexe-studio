// ai-overlay.ts — KI-Overlay-Assistent: Der Streamer beschreibt seinen Wunsch
// in natürlicher Sprache („Goal-Bar oben, Chat unten links, alles in Pink"),
// die KI liefert die passende layers-Liste für das AKTUELLE Layout.
//
// Sicherheits-Design: Die KI kontrolliert NUR `layers` — id/name/canvas des
// Layouts setzt die App; die finale ajv-Validierung passiert wie immer beim
// saveLayout. Provider: Google Gemini (gratis-Tier, BYOK) oder Ollama (lokal).
import { log } from '../core/logger';

/** Kompakte Widget-Beschreibung für den Prompt (kommt aus dem Renderer-Katalog). */
export interface AiCatalogEntry {
  type: string;
  label: string;
  desc: string;
  w: number;
  h: number;
  /** Default-Props inkl. der wählbaren Felder (Werte zeigen die erlaubten Keys). */
  props: Record<string, unknown>;
}

export interface AiWishRequest {
  wish: string;
  layout: { canvas: { width: number; height: number }; layers: unknown[] };
  catalog: AiCatalogEntry[];
  provider: 'gemini' | 'ollama';
  apiKey: string;
  model: string;
}

/** JSON aus einer LLM-Antwort schälen: ```json-Zäune weg, erstes { bis letztes }. */
export function extractJson(text: string): string | null {
  const cleaned = String(text ?? '').replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

/** Rohe KI-layers → bereinigte Layer-Liste. Unbekannte Widget-Typen fliegen
 *  raus, Zahlen werden erzwungen/geklemmt, IDs ergänzt. Liefert null, wenn
 *  nichts Brauchbares übrig bleibt. */
export function sanitizeLayers(
  raw: unknown,
  knownTypes: Set<string>,
  canvas: { width: number; height: number },
): Array<Record<string, unknown>> | null {
  const arr = Array.isArray(raw) ? raw : (raw as { layers?: unknown[] } | null)?.layers;
  if (!Array.isArray(arr)) return null;
  const out: Array<Record<string, unknown>> = [];
  let z = 1;
  for (const item of arr.slice(0, 40)) {
    if (!item || typeof item !== 'object') continue;
    const l = item as Record<string, unknown>;
    const widgetType = String(l.widgetType ?? l.type ?? '');
    if (!knownTypes.has(widgetType)) continue; // KI darf nichts erfinden
    const num = (v: unknown, fallback: number, max: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n))) : fallback;
    };
    const w = num(l.w, 300, canvas.width);
    const h = num(l.h, 200, canvas.height);
    out.push({
      id: typeof l.id === 'string' && l.id ? l.id : `layer-ai-${Math.random().toString(36).slice(2, 9)}`,
      widgetType,
      name: typeof l.name === 'string' && l.name ? l.name.slice(0, 60) : widgetType,
      x: num(l.x, 40, Math.max(0, canvas.width - 40)),
      y: num(l.y, 40, Math.max(0, canvas.height - 40)),
      w: Math.max(40, w),
      h: Math.max(40, h),
      z: Number.isFinite(Number(l.z)) ? Number(l.z) : z++,
      visible: l.visible !== false,
      props: l.props && typeof l.props === 'object' ? (l.props as Record<string, unknown>) : {},
    });
  }
  return out.length > 0 ? out : null;
}

/** Prompt: Aufgabe + Regeln + Katalog + aktuelles Layout + Wunsch. Deutsch,
 *  weil die Wünsche deutsch kommen — Gemini/Ollama können beides. */
export function buildPrompt(req: { wish: string; layout: AiWishRequest['layout']; catalog: AiCatalogEntry[] }): string {
  const { width, height } = req.layout.canvas;
  const catalogLines = req.catalog
    .map((c) => `- ${c.type} (${c.label}): ${c.desc} | Standardgröße ${c.w}×${c.h} | props: ${JSON.stringify(c.props)}`)
    .join('\n');
  return `Du bist der Overlay-Assistent von bOtExE Studio (TikTok-Live-Overlays).
Du bearbeitest das AKTUELLE Overlay-Layout nach dem Wunsch des Streamers.

REGELN:
1. Antworte NUR mit JSON: {"layers": [...]} — kein Text davor/danach.
2. Jeder Layer: {"id","widgetType","name","x","y","w","h","z","visible","props"}.
3. Nur widgetType-Werte aus dem Katalog unten. NIE neue Typen erfinden.
4. Canvas ist ${width}×${height} Pixel (x/y/w/h müssen hineinpassen). ${height > width ? 'HOCHFORMAT (TikTok!): Mitte frei lassen, Widgets eher oben/unten/an den Rändern.' : 'Querformat.'}
5. Bestehende Layer, die der Wunsch NICHT betrifft, unverändert übernehmen (gleiche id + props behalten!). Beim Entfernen: einfach weglassen.
6. props nur mit Keys aus dem Katalog-Beispiel des jeweiligen Widgets belegen. Farben als Hex (accent). Designs über props.theme bzw. props.style/props.shape, wenn das Widget sie kennt.
7. Sinnvolle Größen/Positionen: nichts überlappt wichtige Bereiche, Alerts mittig-groß, Listen an den Rand.

WIDGET-KATALOG:
${catalogLines}

AKTUELLES LAYOUT (layers):
${JSON.stringify(req.layout.layers)}

WUNSCH DES STREAMERS:
"${req.wish.slice(0, 500)}"`;
}

async function callGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const m = model || 'gemini-2.0-flash';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45_000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? `Gemini HTTP ${res.status}`);
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error('Leere Antwort von Gemini');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callOllama(prompt: string, model: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 120_000); // lokale Modelle sind langsamer
  try {
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({ model: model || 'llama3.1', prompt, stream: false, format: 'json' }),
    });
    const body = (await res.json().catch(() => ({}))) as { response?: string; error?: string };
    if (!res.ok || body.error) throw new Error(body.error ?? `Ollama HTTP ${res.status}`);
    if (!body.response) throw new Error('Leere Antwort von Ollama');
    return body.response;
  } finally {
    clearTimeout(timer);
  }
}

/** Wunsch → neue layers-Liste (oder verständlicher Fehler). */
export async function generateLayers(req: AiWishRequest): Promise<{ ok: true; layers: Array<Record<string, unknown>> } | { ok: false; error: string }> {
  const wish = req.wish.trim();
  if (!wish) return { ok: false, error: 'Kein Wunsch angegeben.' };
  if (req.provider === 'gemini' && !req.apiKey) {
    return { ok: false, error: 'Kein Gemini-Key hinterlegt — Einstellungen → KI-Assistent → „Gratis-Key holen".' };
  }
  const prompt = buildPrompt(req);
  const knownTypes = new Set(req.catalog.map((c) => c.type));
  try {
    const raw = req.provider === 'ollama'
      ? await callOllama(prompt, req.model)
      : await callGemini(prompt, req.apiKey, req.model);
    const json = extractJson(raw);
    if (!json) return { ok: false, error: 'Die KI hat kein verwertbares Layout geliefert — formuliere den Wunsch etwas konkreter.' };
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return { ok: false, error: 'KI-Antwort war kein gültiges JSON — bitte nochmal versuchen.' }; }
    const layers = sanitizeLayers(parsed, knownTypes, req.layout.canvas);
    if (!layers) return { ok: false, error: 'Die KI hat keine gültigen Widgets geliefert — bitte nochmal versuchen.' };
    log.info('KI', `Overlay-Wunsch umgesetzt: ${layers.length} Widgets („${wish.slice(0, 60)}…")`);
    return { ok: true, layers };
  } catch (err) {
    const msg = (err as Error).message ?? 'unbekannt';
    if (/abort/i.test(msg)) return { ok: false, error: 'Zeitüberschreitung — die KI hat zu lange gebraucht. Nochmal versuchen.' };
    if (/API key|401|403|permission/i.test(msg)) return { ok: false, error: 'Der KI-Key wird abgelehnt — prüfe ihn unter Einstellungen → KI-Assistent.' };
    if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
      return { ok: false, error: req.provider === 'ollama' ? 'Ollama nicht erreichbar — läuft es auf diesem PC (Port 11434)?' : 'Keine Verbindung zur KI — Internet prüfen.' };
    }
    log.warn('KI', 'Overlay-Wunsch fehlgeschlagen', msg);
    return { ok: false, error: `KI-Fehler: ${msg.slice(0, 140)}` };
  }
}
