// pi.js — Property Inspector: konfiguriert Server-URL, Token und den Panel-Knopf
// für diese Stream-Deck-Taste. Lädt die Knopf-Liste vom lokalen Steuer-Endpunkt.
let piWs;
let piUUID;
let piContext;
let settings = {};

const $ = (id) => document.getElementById(id);

function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, _inInfo, inActionInfo) {
  piUUID = inUUID;
  const info = JSON.parse(inActionInfo || '{}');
  piContext = info.context;
  settings = (info.payload && info.payload.settings) || {};

  piWs = new WebSocket('ws://127.0.0.1:' + inPort);
  piWs.onopen = () => {
    piWs.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
    hydrate();
  };
  piWs.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.event === 'didReceiveSettings') {
      settings = (msg.payload && msg.payload.settings) || {};
      hydrate();
    }
  };
}

function hydrate() {
  $('serverUrl').value = settings.serverUrl || 'http://127.0.0.1:27415';
  $('token').value = settings.token || '';
  if (settings.buttonId) {
    const opt = document.createElement('option');
    opt.value = settings.buttonId;
    opt.textContent = settings.buttonLabel || settings.buttonId;
    opt.selected = true;
    $('buttonId').appendChild(opt);
  }
}

function save() {
  if (!piWs) return;
  // WICHTIG: setSettings braucht den ACTION-Context (piContext), nicht die
  // Registrierungs-UUID — sonst verwirft Stream Deck die Einstellungen.
  piWs.send(JSON.stringify({ event: 'setSettings', context: piContext, payload: settings }));
}

function loadButtons() {
  const base = ($('serverUrl').value || '').replace(/\/$/, '');
  const token = encodeURIComponent($('token').value || '');
  if (!base || !token) { $('status').innerHTML = '<span class="err">Server-URL + Token nötig.</span>'; return; }
  $('status').textContent = 'Lade…';
  fetch(base + '/api/panel?token=' + token)
    .then((r) => r.json())
    .then((data) => {
      const sel = $('buttonId');
      sel.innerHTML = '<option value="">— Knopf wählen —</option>';
      (data.buttons || []).forEach((b) => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = b.label;
        if (b.id === settings.buttonId) o.selected = true;
        sel.appendChild(o);
      });
      $('status').innerHTML = '<span class="ok">' + (data.buttons || []).length + ' Knöpfe geladen.</span>';
    })
    .catch(() => { $('status').innerHTML = '<span class="err">Keine Verbindung — läuft bOtExE Studio?</span>'; });
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'serverUrl') settings.serverUrl = e.target.value.trim();
  if (e.target.id === 'token') settings.token = e.target.value.trim();
  if (e.target.id === 'buttonId') {
    settings.buttonId = e.target.value;
    settings.buttonLabel = e.target.options[e.target.selectedIndex]?.textContent || '';
  }
  save();
});
document.getElementById('reload').addEventListener('click', loadButtons);
