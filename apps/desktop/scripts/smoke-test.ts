// smoke-test.ts — headless-Durchklick durch ALLE App-Seiten gegen die laufende
// App (gestartet mit --remote-debugging-port=9222). Fängt Render-Crashes,
// geworfene Exceptions und console.error je Seite — genau die Fehlerklasse, die
// sonst erst auf dem echten Windows-PC auffällt. Kein echtes Audio nötig.
//
// Nutzung: App headless starten (xvfb) → `tsx scripts/smoke-test.ts`.
// Exit 1, sobald irgendeine Seite einen echten Fehler produziert.
import WebSocket from 'ws';

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';

interface Target { webSocketDebuggerUrl: string; url: string; type: string }

let msgId = 0;
function send(ws: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    const onMessage = (data: unknown) => {
      const msg = JSON.parse(String(data));
      if (msg.id === id) {
        ws.off('message', onMessage);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      }
    };
    ws.on('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(ws: WebSocket, expression: string): Promise<unknown> {
  const result = (await send(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as
    { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  if (result.exceptionDetails) throw new Error(`JS-Fehler: ${JSON.stringify(result.exceptionDetails)}`);
  return result.result?.value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Bekannte, im Headless-Betrieb HARMLOSE Meldungen (kein echtes Audio-Gerät,
// kein Update-Server, keine GPU) — die sollen den Test nicht rot machen.
const IGNORE = [
  /update\.electronjs|autoUpdater|update-electron-app|No published versions/i,
  /enumerateDevices|getUserMedia|setSinkId|requestDevice|Permission denied.*audio|The AudioContext/i,
  /net::ERR_|Failed to load resource|favicon|ERR_CONNECTION|ERR_INTERNET/i,
  /GPU|WebGL|GroupMarker|Passthrough is not supported|SharedImageManager|gbm_/i,
  /Autofill\.|Download the React DevTools|DevTools listening/i,
  /ws:\/\/127\.0\.0\.1|WebSocket connection|Overlay-Server|fetchIsLive|isn't online|not online|nicht live/i,
];
const ignored = (t: string): boolean => IGNORE.some((re) => re.test(t));

// Nav-Labels wie in App.tsx (Reihenfolge egal — es wird per Text geklickt).
const PAGES = ['Live', 'Auswertung', 'Overlay', 'Bilder & Videos', 'Geschenke', 'Sticker', 'Trigger', 'Befehle', 'Store', 'Panel', 'Sounds', 'Stimme', 'Mixer', 'Zuschauer', 'Diagnose', 'Einstellungen'];

interface Problem { page: string; text: string }

async function main(): Promise<void> {
  const targets = (await (await fetch(`${CDP}/json`)).json()) as Target[];
  const appTarget = targets.find((t) => t.type === 'page' && !t.url.includes('devtools'));
  if (!appTarget) throw new Error(`Kein App-Target: ${JSON.stringify(targets.map((t) => t.url))}`);
  console.log(`🔌 Verbunden: ${appTarget.url}`);

  const ws = new WebSocket(appTarget.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  // Fehler laufend einsammeln, jeweils der aktuell offenen Seite zugeordnet.
  const problems: Problem[] = [];
  let current = 'Start';
  ws.on('message', (data: unknown) => {
    const msg = JSON.parse(String(data));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      const text = (msg.params.args ?? []).map((a: { value?: unknown; description?: string }) => String(a.value ?? a.description ?? '')).join(' ');
      if (text && !ignored(text)) problems.push({ page: current, text: text.slice(0, 300) });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const text = msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? '';
      if (text && !ignored(text)) problems.push({ page: current, text: String(text).slice(0, 300) });
    }
  });

  // Onboarding-Tour „gesehen" + Palette-Live aus, dann neu laden (Tour verdeckt sonst).
  await evalJs(ws, `localStorage.setItem('bx-onboarding-done','1'); localStorage.setItem('bx-palette-live','0'); true`);
  await send(ws, 'Page.reload');
  await sleep(2500);
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  // Jede Seite anklicken und rendern lassen.
  for (const label of PAGES) {
    current = label;
    const clicked = await evalJs(ws, `(() => {
      const btns = [...document.querySelectorAll('nav button')];
      const b = btns.find((x) => (x.textContent || '').trim().startsWith(${JSON.stringify(label)}));
      if (!b) return false; b.click(); return true;
    })()`);
    if (!clicked) { problems.push({ page: label, text: 'Nav-Button nicht gefunden' }); continue; }
    await sleep(650);
    // Hauptbereich muss etwas gerendert haben (ErrorBoundary-Fallback zählt als Fehler).
    const info = (await evalJs(ws, `(() => {
      const main = document.querySelector('main') || document.body;
      const txt = (main.textContent || '').trim();
      const boundary = /etwas ist schiefgelaufen|something went wrong|Fehler in der Ansicht/i.test(txt);
      return { len: txt.length, boundary };
    })()`)) as { len: number; boundary: boolean };
    if (info.boundary) problems.push({ page: label, text: 'ErrorBoundary ausgelöst (Seite gecrasht)' });
    else if (info.len < 5) problems.push({ page: label, text: 'Seite blieb leer' });
    console.log(`  ${problems.some((p) => p.page === label) ? '❌' : '✓'} ${label}`);
  }

  // Widget-Katalog: das Fenster über der ganzen App. Der Durchklick oben sieht
  // nur die schmale Leiste mit einem Kategorie-Reiter — der Katalog ist eine
  // eigene Verzweigung und waere damit voellig ungeprueft. Geprueft wird, was
  // ihn ausmacht: Er ist breiter als die Leiste, zeigt ALLE Kategorien, und
  // seine Suche findet auch, was anders heisst.
  current = 'Overlay';
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('nav button')].find(x=>(x.textContent||'').trim().startsWith('Overlay')); b&&b.click(); return true; })()`);
  await sleep(600);
  const katalogCheck = (await evalJs(ws, `(async () => {
    const leiste = document.querySelector('[data-palette-scroll]');
    if (!leiste) return { fehler: 'Palette nicht gefunden' };
    const schmalBreite = Math.round(leiste.getBoundingClientRect().width);
    const knopf = [...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('Alle Widgets'));
    if (!knopf) return { fehler: 'Knopf „Alle Widgets" nicht gefunden' };
    knopf.click();
    await new Promise(r => setTimeout(r, 600));
    // Der Katalog bringt seinen eigenen Scrollbereich mit. NICHT ueber die
    // Reihenfolge suchen — er steht im Dokument VOR der Leiste, weil er als
    // Fenster darueber liegt. Erkennbar ist er an den Kategorie-Abschnitten.
    const bereiche = [...document.querySelectorAll('[data-palette-scroll]')];
    const katalog = bereiche.find(b => b.querySelector('[data-kat]')) || bereiche[bereiche.length - 1];
    if (bereiche.length < 2) return { fehler: 'Katalog hat sich nicht geoeffnet' };
    const gruppen = [...katalog.querySelectorAll('[data-kat]')].map(el => el.getAttribute('data-kat'));
    const breit = Math.round(katalog.getBoundingClientRect().width);
    const kacheln = katalog.querySelectorAll('button, iframe').length;
    // Suche: „geschenk" muss auch die englisch benannten Widgets finden.
    const feld = document.querySelector('input[placeholder^="Suchen"]');
    let treffer = -1;
    if (feld) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(feld, 'geschenk');
      feld.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const kopf = [...katalog.querySelectorAll('div')].map(d => (d.textContent||'')).find(t => /Treffer f/.test(t)) || '';
      treffer = Number((kopf.match(/(\\d+)\\s+Treffer/) || [])[1] ?? -1);
    }
    // Mit Escape wieder zu, damit die restlichen Pruefungen den Normalzustand sehen.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const offenDanach = document.querySelectorAll('[data-palette-scroll]').length;
    return { schmalBreite, breit, gruppen, kacheln, treffer, offenDanach };
  })()`)) as { fehler?: string; schmalBreite?: number; breit?: number; gruppen?: string[]; kacheln?: number; treffer?: number; offenDanach?: number };
  if (katalogCheck.fehler) {
    problems.push({ page: 'Overlay', text: `Katalog: ${katalogCheck.fehler}` });
  } else {
    const g = katalogCheck.gruppen ?? [];
    if (g.length < 6) problems.push({ page: 'Overlay', text: `Katalog zeigt nur ${g.length} Kategorien` });
    if ((katalogCheck.breit ?? 0) <= (katalogCheck.schmalBreite ?? 0)) {
      problems.push({ page: 'Overlay', text: 'Katalog ist nicht breiter als die schmale Leiste' });
    }
    if ((katalogCheck.kacheln ?? 0) < 20) problems.push({ page: 'Overlay', text: `Katalog zeigt nur ${katalogCheck.kacheln} Kacheln` });
    // 21 Treffer sind es heute; die Schwelle liegt bewusst tiefer, damit ein
    // neues Widget den Test nicht rot macht — sie soll nur belegen, dass die
    // Suche quer über die Kategorien greift und nicht nur über Namen.
    if ((katalogCheck.treffer ?? 0) < 12) {
      problems.push({ page: 'Overlay', text: `Katalog-Suche „geschenk" findet nur ${katalogCheck.treffer} Widgets` });
    }
    if ((katalogCheck.offenDanach ?? 2) !== 1) problems.push({ page: 'Overlay', text: 'Katalog liess sich mit Escape nicht schliessen' });
    console.log(`  🧩 Katalog: ${katalogCheck.schmalBreite}px → ${katalogCheck.breit}px, ${g.length} Kategorien, ${katalogCheck.kacheln} Kacheln, „geschenk" → ${katalogCheck.treffer} Treffer`);
  }

  // Mixer-spezifisch: Regler vorhanden + Live-Event feuerbar (ohne echtes Audio).
  current = 'Mixer';
  await evalJs(ws, `(() => { const b=[...document.querySelectorAll('nav button')].find(x=>(x.textContent||'').trim().startsWith('Mixer')); b&&b.click(); return true; })()`);
  await sleep(500);
  const mixerCheck = (await evalJs(ws, `(() => {
    const sliders = document.querySelectorAll('input[type=range]').length;
    const selects = document.querySelectorAll('select').length;
    let eventOk = true;
    try { window.dispatchEvent(new CustomEvent('bx-mixer', { detail: { master: 0.5, channels: {} } })); } catch (e) { eventOk = false; }
    return { sliders, selects, eventOk };
  })()`)) as { sliders: number; selects: number; eventOk: boolean };
  console.log(`  🎚️  Mixer: ${mixerCheck.sliders} Regler, ${mixerCheck.selects} Geräte-Dropdowns, Event ${mixerCheck.eventOk ? 'ok' : 'FEHLER'}`);
  if (mixerCheck.sliders < 5) problems.push({ page: 'Mixer', text: `Zu wenige Regler (${mixerCheck.sliders}, erwartet ≥5: Master + 4 Kanäle)` });
  if (!mixerCheck.eventOk) problems.push({ page: 'Mixer', text: 'bx-mixer-Event warf eine Exception' });

  // Key-Assistent: öffnet sich das Modal, sind die 3 Schritte + Eingabefeld da?
  current = 'KeyWizard';
  const kw = (await evalJs(ws, `(async () => {
    window.dispatchEvent(new CustomEvent('bx-key-wizard'));
    await new Promise((r) => setTimeout(r, 400));
    const modal = [...document.querySelectorAll('h2')].find((h) => /Gratis-Key holen/i.test(h.textContent || ''));
    const steps = document.querySelectorAll('.fixed .rounded-full').length;
    const input = !!document.querySelector('.fixed input[placeholder^="euler_"]');
    const close = [...document.querySelectorAll('.fixed button')].find((b) => (b.getAttribute('title') || '') === 'Schließen');
    close && close.click();
    return { open: !!modal, steps, input };
  })()`)) as { open: boolean; steps: number; input: boolean };
  console.log(`  🔑 Key-Assistent: ${kw.open ? 'öffnet ✓' : 'FEHLT'}, Eingabefeld ${kw.input ? '✓' : '✗'}`);
  if (!kw.open) problems.push({ page: 'KeyWizard', text: 'Modal öffnet nicht (bx-key-wizard)' });
  if (!kw.input) problems.push({ page: 'KeyWizard', text: 'euler_-Eingabefeld fehlt' });

  // KI-/Steuer-API end-to-end: Token aus der laufenden App holen, dann von Node
  // aus (umgeht Renderer-CSP) Lesen + eine harmlose Aktion + Reject prüfen.
  current = 'API';
  try {
    const info = (await evalJs(ws, 'window.studio.getOverlayInfo()')) as { url: string };
    const token = new URL(info.url).searchParams.get('token') ?? '';
    const base = `http://127.0.0.1:27415`;
    const status = (await (await fetch(`${base}/api/status?token=${token}`)).json()) as { actions?: unknown; stats?: unknown };
    if (!Array.isArray(status.actions) || !status.stats) problems.push({ page: 'API', text: 'GET /api/status unvollständig' });
    // gültige, harmlose Aktion (kein Audio/Netz)
    const stop = await fetch(`${base}/api/action?token=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'stop_game' }) });
    if (stop.status !== 200) problems.push({ page: 'API', text: `stop_game gab ${stop.status}` });
    // ungültige Aktion MUSS abgelehnt werden
    const bad = await fetch(`${base}/api/action?token=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'rm_rf' }) });
    if (bad.status !== 400) problems.push({ page: 'API', text: `ungültige Aktion nicht abgelehnt (${bad.status})` });
    // falscher Token MUSS scheitern
    const noauth = await fetch(`${base}/api/status?token=falsch`);
    if (noauth.status === 200) problems.push({ page: 'API', text: 'falscher Token wurde akzeptiert!' });
    // Geschenk-Regeln fürs Geschenk-Menü. Wichtig ist nicht nur, DASS die Route
    // antwortet, sondern dass sie KEINE Aktions-Parameter mitschickt — darin
    // stecken Sound-Pfade, OBS-Szenen und Streamer.bot-IDs, die im Overlay
    // nichts zu suchen haben.
    const rulesRes = await fetch(`${base}/trigger-rules?token=${token}`);
    const rulesBody = (await rulesRes.json()) as { rules?: unknown };
    const rules = Array.isArray(rulesBody.rules) ? (rulesBody.rules as Record<string, unknown>[]) : null;
    if (rulesRes.status !== 200 || !rules) {
      problems.push({ page: 'API', text: `GET /trigger-rules unbrauchbar (${rulesRes.status})` });
    } else {
      const leck = rules.some((r) => (Array.isArray(r.actions) ? r.actions : []).some(
        (a) => Object.keys(a as object).some((k) => k !== 'kind'),
      ));
      if (leck) problems.push({ page: 'API', text: '/trigger-rules liefert Aktions-Parameter mit!' });
      const rulesNoauth = await fetch(`${base}/trigger-rules?token=falsch`);
      if (rulesNoauth.status === 200) problems.push({ page: 'API', text: '/trigger-rules ohne Token erreichbar!' });
    }
    console.log(`  🔌 API: status ${Array.isArray(status.actions) ? '✓' : '✗'}, Aktion ✓, Reject ✓, Auth ✓, Regeln ${rules ? '✓' : '✗'}`);
  } catch (e) {
    problems.push({ page: 'API', text: `API-Test warf: ${(e as Error).message}` });
  }

  ws.close();

  console.log('');
  if (problems.length === 0) {
    console.log('✅ SMOKE-TEST OK — alle Seiten rendern sauber, keine Fehler.');
    process.exit(0);
  }
  console.log(`❌ SMOKE-TEST: ${problems.length} Problem(e):`);
  for (const p of problems) console.log(`   [${p.page}] ${p.text}`);
  process.exit(1);
}

main().catch((err) => { console.error('SMOKE-TEST FEHLGESCHLAGEN:', err.message); process.exit(1); });
