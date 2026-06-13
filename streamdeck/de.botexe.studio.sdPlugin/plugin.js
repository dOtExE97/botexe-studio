// plugin.js — Stream-Deck-Plugin-Logik. Verbindet sich mit der Stream-Deck-
// Software und löst bei einem Tastendruck einen bOtExE-Studio-Panel-Knopf aus
// (HTTP-POST an den lokalen Steuer-Endpunkt der App).
let ws;
let uuidRegister;
const settingsByContext = {}; // context → { serverUrl, token, buttonId }

// Stream Deck ruft diese globale Funktion beim Start auf.
function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, _inInfo) {
  uuidRegister = inUUID;
  ws = new WebSocket('ws://127.0.0.1:' + inPort);

  ws.onopen = () => {
    ws.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
  };

  ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    const { event, context, payload } = msg;

    if (event === 'willAppear' || event === 'didReceiveSettings') {
      settingsByContext[context] = (payload && payload.settings) || {};
      return;
    }
    if (event === 'keyUp') {
      fire(context, settingsByContext[context] || (payload && payload.settings) || {});
    }
  };
}

function fire(context, settings) {
  const base = (settings.serverUrl || 'http://127.0.0.1:27415').replace(/\/$/, '');
  const token = encodeURIComponent(settings.token || '');
  const id = settings.buttonId || '';
  if (!id || !token) { showAlert(context); return; }

  fetch(base + '/api/panel/fire?token=' + token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
    .then((r) => (r.ok ? showOk(context) : showAlert(context)))
    .catch(() => showAlert(context));
}

function showOk(context) {
  if (ws) ws.send(JSON.stringify({ event: 'showOk', context }));
}
function showAlert(context) {
  if (ws) ws.send(JSON.stringify({ event: 'showAlert', context }));
}
