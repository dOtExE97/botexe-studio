# Twitch-API: Belege aus den offiziellen Docs

Stand der Recherche: 2026-11-13. Quelle ist ausschliesslich `dev.twitch.tv/docs/...`.
Regel im Projekt: keine Feldnamen raten. Alles, was hier steht, ist aus der jeweils genannten Seite
abgeschrieben. Was die Docs nicht sagen, steht im letzten Abschnitt als "unbelegt".

Seiten-Kuerzel (Basis `https://dev.twitch.tv/docs/`):

- [OAUTH] `authentication/getting-tokens-oauth/`
- [REFRESH] `authentication/refresh-tokens/`
- [VALIDATE] `authentication/validate-tokens/`
- [REVOKE] `authentication/revoke-tokens/`
- [REGISTER] `authentication/register-app/`
- [WS] `eventsub/handling-websocket-events/`
- [MANAGE] `eventsub/manage-subscriptions/`
- [EVREF] `eventsub/reference/` (Unterseiten: `/channel`, `/chat`, `/stream`, `/channel-points`)
- [API-EVENTSUB] `api/reference/eventsub` (Create EventSub Subscription)
- [API-USERS] `api/reference/users` (Get Users)
- [API-CHAT] `api/reference/chat` (Get Global Emotes, Send Chat Message)
- [EMOTES] `irc/emotes/`
- [GUIDE] `api/guide` (Rate Limits)
- [SCOPES] `authentication/scopes/`

Hinweis: Die alten Seiten `eventsub/eventsub-reference/` und `eventsub/eventsub-subscription-types/`
liefern nur "This page has moved to /docs/eventsub/reference/". Die Einzeltypen stehen jetzt unter
`/docs/eventsub/reference/<gruppe>` (z.B. `channel#channel-follow`).

---

## 1. Device Code Grant Flow (Public Client)

Quelle: [OAUTH], Abschnitt "Device code grant flow"
(https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow).

### 1.1 Was die Docs ueber Public Clients sagen (woertlich sinngemaess)

Public Clients:

- muessen kein Client Secret verwalten,
- koennen einen Access Token ohne Client Secret refreshen,
- sind "only limited to the usage of device authorization grant flow" und koennen weder Client
  Credentials noch Implicit Flow nutzen.

Die Docs schreiben ausserdem: "if your application is on a more open platform (such as windows) we
suggest using public". Fuer eine Desktop-App ist Public also die empfohlene Wahl.

### 1.2 Schritt 1: Device-Code anfordern

- URL: `https://id.twitch.tv/oauth2/device`
- Methode: `POST`
- Content-Type: Das Doc-Beispiel nutzt `curl --form` (also multipart). Die Docs nennen keinen
  expliziten Content-Type-Header fuer diesen Endpunkt. (Siehe "unbelegt": ob
  `application/x-www-form-urlencoded` ebenfalls geht.)

Parameter (beide Pflicht, Typ String):

| Parameter   | Beschreibung (Docs) |
| ----------- | ------------------- |
| `client_id` | "Your app's registered Client ID." |
| `scopes`    | "A space-delimited list of scopes ... You must URL encode the list." |

Scopes sind also leerzeichen-getrennt (nicht Komma, nicht Plus im Doc-Text) und URL-encoded.
Das Doc-Beispiel:

```
curl -X POST --location 'https://id.twitch.tv/oauth2/device' \
--form 'client_id="<clientID>"' \
--form 'scopes="<scopes>"'
```

Antwortfelder:

| Feld | Typ | Beschreibung (Docs) |
| ---- | --- | ------------------- |
| `device_code` | String | "The identifier for a given user." |
| `expires_in` | Int | "Time until the code is no longer valid" |
| `interval` | Int | "Time until another valid code can be requested" |
| `user_code` | String | "The code that the user will use to authenticate" |
| `verification_uri` | String | "The address you will send users to, to authenticate" |

Beispiel aus den Docs:

```json
{
  "device_code": "ike3GM8QIdYZs43KdrWPIO36LofILoCyFEzjlQ91",
  "expires_in": 1800,
  "interval": 5,
  "user_code": "ABCDEFGH",
  "verification_uri": "https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH"
}
```

Beobachtung: Im Beispiel enthaelt `verification_uri` den `user_code` bereits als Query-Parameter
(`device-code=ABCDEFGH`). Die Einheit von `expires_in` und `interval` nennen die Docs nicht
ausdruecklich; das Beispiel (1800 / 5) passt zu Sekunden. (Siehe "unbelegt".)

### 1.3 Schritt 2: Nutzer autorisiert

Doc-Text: "The user is presented with an authorization screen to review the scopes and complete the
authorization." Der Nutzer oeffnet `verification_uri`.

### 1.4 Schritt 3: Token abholen (Polling)

- URL: `https://id.twitch.tv/oauth2/token`
- Methode: Das Doc-Beispiel ist `curl --location ... --form ...` (cURL mit `--form` sendet POST).
  Der Doc-Text nennt die Methode nicht explizit.
- Alle Parameter Pflicht, String:

| Parameter | Wert / Beschreibung |
| --------- | ------------------- |
| `client_id` | "Your app's registered client ID." |
| `scopes` | leerzeichen-getrennte Liste, URL-encoded (gleiche Liste wie in Schritt 1) |
| `device_code` | "The code that will authenticate the user." |
| `grant_type` | "Must be set to `urn:ietf:params:oauth:grant-type:device_code`." |

```
curl --location 'https://id.twitch.tv/oauth2/token' \
--form 'client_id="<client_id>"' \
--form 'scopes="<scopes>"' \
--form 'device_code="<device_code>"' \
--form 'grant_type="urn:ietf:params:oauth:grant-type:device_code"'
```

Kein `client_secret` im Request. Wichtig: `scopes` muss auch im Token-Request mitgeschickt werden
(laut Parametertabelle "Required: Yes").

Erfolgsantwort (Felder laut Tabelle):

| Feld | Typ | Beschreibung (Docs) |
| ---- | --- | ------------------- |
| `access_token` | String | "The authenticated token, to be used for various API endpoints and EventSub subscriptions." |
| `expires_in` | Int | "Time until the code is no longer valid." |
| `refresh_token` | String | "A token used to refresh the access token." |
| `scope` | String (Tabelle) | "An array of the scopes requested." Im JSON-Beispiel ist es ein Array. |
| `token_type` | String | "Will generally be 'bearer'." |

```json
{
  "access_token": "<access_token>",
  "expires_in": <some_int_value>,
  "refresh_token": "<refresh_token>",
  "scope": ["<scopes>"],
  "token_type": "bearer"
}
```

Achtung: Die Tabelle nennt `scope` "String", das JSON-Beispiel zeigt ein Array. Defensiv beides
akzeptieren (Array bevorzugt).

### 1.5 Fehlerantworten beim Polling (exakt das, was die Docs zeigen)

Die Docs dokumentieren genau diese drei Bodies, jeweils mit `"status": 400`:

1. Nutzer hat noch nicht autorisiert (weiter pollen):
   ```json
   { "status": 400, "message": "authorization_pending" }
   ```
2. `device_code` wurde schon eingeloest (einmalig verwendbar):
   ```json
   { "status": 400, "message": "invalid device code" }
   ```
3. Refresh-Token wurde schon einmal benutzt:
   ```json
   { "status": 400, "message": "Invalid refresh token" }
   ```

`slow_down`, `expired_token`, `access_denied` (RFC-8628-Namen) sind in den Twitch-Docs NICHT
dokumentiert. Siehe "Offene Punkte". Die Docs sagen auch nicht, wie ein abgelaufener `device_code`
oder ein vom Nutzer abgelehnter Request aussieht.

Die Docs sagen ausserdem, dass man sich nicht auf Fehlertexte verlassen soll
([GUIDE], "Taking dependencies": "Error message strings"). Trotzdem ist `authorization_pending` die
einzige dokumentierte Polling-Unterscheidung.

### 1.6 Lebensdauern und Regeln (Public Client)

Aus [OAUTH]:

- `device_code`: "one time use only".
- Refresh-Token: "These tokens are for one time use only, meaning if they are used in refreshing a
  token they will become invalid after use."
- Refresh-Token-Ablauf: "There is an expiry on the refresh token which is inactive, which is set to
  30 days. After a refresh token expires the user is expected to start the DCF flow once again."
- Access-Token: "All access tokens obtained have the same expiry like before, i.e. 4 hours."

Aus [REFRESH]:

- "refresh tokens generated by a Public client type will expire 30 days after they are generated"
  (nicht "nach 30 Tagen Inaktivitaet"). Das widerspricht [OAUTH] leicht (inaktiv vs. nach
  Erzeugung). Siehe "Offene Punkte".
- Empfehlung der Docs: nicht anhand `expires_in` proaktiv refreshen, sondern reaktiv auf 401
  reagieren, weil Tokens auch aus anderen Gruenden ungueltig werden koennen.
- Tokens werden ungueltig, wenn der Nutzer das Passwort aendert oder die App trennt.
- Pro Refresh-Token maximal 50 gleichzeitig gueltige Access-Tokens.

### 1.7 Refresh fuer Public Clients

Quelle: [REFRESH] (https://dev.twitch.tv/docs/authentication/refresh-tokens/).

- `POST https://id.twitch.tv/oauth2/token`, Body `x-www-form-urlencoded`.

| Parameter | Pflicht | Beschreibung |
| --------- | ------- | ------------ |
| `client_id` | Ja | Client-ID der App |
| `client_secret` | Ja | "Note: This field is not required if your application's client type was set to public." |
| `grant_type` | Ja | "Must be set to `refresh_token`." |
| `refresh_token` | Ja | "You must URL encode the refresh token before posting the request." Sonst evtl. "Invalid refresh token". |

Beispiel (Doc, mit Secret; fuer Public Client `client_secret` weglassen):

```
curl -X POST https://id.twitch.tv/oauth2/token \
-H 'Content-Type: application/x-www-form-urlencoded' \
-d 'grant_type=refresh_token&refresh_token=...&client_id=<id>&client_secret=<secret>'
```

Antwort:

```json
{
  "access_token": "1ssjqsqfy6bads1ws7m03gras79zfr",
  "expires_in": 15583,
  "refresh_token": "eyJfMzUtNDU0OC4MWYwLTQ5MDY5ODY4NGNlMSJ9%asdfasdf=",
  "scope": ["channel:read:subscriptions", "channel:manage:polls"],
  "token_type": "bearer"
}
```

Der neue `refresh_token` MUSS gespeichert werden ("refresh tokens may change"; fuer Public Clients
sogar zwingend, weil der alte nach einmaliger Nutzung ungueltig ist). Persistieren am besten atomar,
bevor der neue Access-Token benutzt wird.

Fehler (Body-Beispiel der Docs):

```json
{ "error": "Bad Request", "status": 400, "message": "Invalid refresh token" }
```

Zusaetzlich: "A refresh request can fail with HTTP status code 401 Unauthorized if the refresh token
is no longer valid." Dann muss der Nutzer neu autorisieren (bei uns: Device Flow neu starten).
Die Docs nennen an dieser Stelle zwar Authorization-Code-Flow als Re-Consent, fuer Public Clients
gilt laut [OAUTH] der Device Flow.

### 1.8 Token validieren

Quelle: [VALIDATE] (https://dev.twitch.tv/docs/authentication/validate-tokens/).

- `GET https://id.twitch.tv/oauth2/validate`
- Header: `Authorization: OAuth <token>` (auch `Bearer <token>` erlaubt: "You may also use the Bearer
  prefix in place of OAuth").
- Pflicht: "Your app must validate the OAuth token when it starts and on an hourly basis thereafter."
  Gilt ausdruecklich auch fuer Desktop-Apps. Twitch auditiert das und droht mit Widerruf des
  API-Keys bzw. Drosselung.
- Zweck: erkennen, dass der Nutzer die App getrennt hat (Token wird dann ungueltig), auch wenn die
  App gerade keine API-Calls macht. Dann: alle Sessions mit dem Token beenden.

Antwort 200:

| Feld | Typ | Beschreibung |
| ---- | --- | ------------ |
| `client_id` | String | Client-ID des Tokens |
| `login` | String | lowercase Username; bei App-Token `null` |
| `scopes` | String[] | gewaehrte Scopes |
| `user_id` | String | User-ID; bei App-Token `null` |
| `expires_in` | Int | Sekunden bis zum Ablauf |

```json
{
  "client_id": "wbmytr93xzw8zbg0p1izqyzzc5mbiz",
  "login": "twitchdev",
  "scopes": ["channel:read:subscriptions"],
  "user_id": "141981764",
  "expires_in": 5520838
}
```

Ungueltig: HTTP 401, Body `{ "status": 401, "message": "invalid access token" }`.

### 1.9 Token widerrufen

Quelle: [REVOKE] (https://dev.twitch.tv/docs/authentication/revoke-tokens/).

- `POST https://id.twitch.tv/oauth2/revoke`, Body `x-www-form-urlencoded`
  (`Content-Type: application/x-www-form-urlencoded`).
- Parameter (beide Pflicht): `client_id`, `token` ("The access token to revoke").
- Erfolg: `200 OK` ohne Body.
- Fehler: `400` + `{"status": 400, "message": "Invalid token"}` (Client-ID ok, Token nicht);
  `404` + `{"status": 404, "message": "client does not exist"}` (Client-ID ungueltig).
- Die Seite spricht nur von Access-Tokens ("The access token to revoke"). Ob ein Refresh-Token
  uebergeben werden darf, steht dort nicht. Siehe "Offene Punkte".

---

## 2. App registrieren

Quelle: [REGISTER] (https://dev.twitch.tv/docs/authentication/register-app/).

Schritte laut Docs:

1. Developer Console, Konto muss eine verifizierte E-Mail haben und 2FA aktiviert haben.
2. Tab "Applications", "Register Your Application".
3. Felder: `Name` (muss unter allen Twitch-Apps eindeutig sein; erscheint beim Nutzer unter
   "Connections / Other Connections"), `OAuth Redirect URLs` (Callback-URL der App, mit "Add"
   bestaetigen), `Category`, Captcha ("I'm not a robot"), "Create".
4. Danach "Manage": dort steht die Client ID. "Client IDs are considered public and can be embedded
   in a web page's source."
5. Client Secret ("New Secret") nur "Depending on the flow you use to get a token". Ein neues
   Secret macht das alte ungueltig.
6. "Do not share client IDs among applications; each application must have its own client ID."

Was diese Seite NICHT sagt:

- Das Feld "Client Type" (Confidential/Public) steht auf der Register-Seite nicht. Es wird nur in
  [REFRESH] ("your application's client type was set to public") und [OAUTH] erwaehnt. Ob/wo man es
  setzt, ist hier unbelegt.
- Ob das Redirect-URL-Feld fuer Device Flow Pflicht ist, wird nirgends gesagt. Die Seite beschreibt
  es als normalen Registrierungsschritt, ohne "optional" oder "required". Siehe "Offene Punkte".
- Dass Device Flow zwingend "Public" braucht: [OAUTH] sagt, DCF erlaubt "public and confidential
  client types". Public ist also nicht zwingend, sondern fuer offene Plattformen empfohlen.

---

## 3. EventSub WebSocket

Quelle: [WS] (https://dev.twitch.tv/docs/eventsub/handling-websocket-events/).

### 3.1 Verbindung

- URL: `wss://eventsub.wss.twitch.tv/ws`
- Optionaler Query-Parameter `keepalive_timeout_seconds`: ganze Zahlen von 10 bis 600, z.B.
  `wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30`. Ungueltige numerische Werte
  werden auf den naechsten erlaubten Wert gesetzt.
- Der Server sendet nur. Jede Nachricht des Clients ausser Pong fuehrt zum Schliessen (Code 4001).
- Alle Timestamps: RFC3339 mit Nanosekunden.
- Ein Verbindungsverlust fuehrt dazu, dass alle Subscriptions der Session deaktiviert sind. Nach
  dem Neuverbinden muss neu abonniert werden; es gibt kein Replay verpasster Events.

### 3.2 Envelope

Jeder Frame hat `metadata` und `payload`:

```json
{
  "metadata": {
    "message_id": "96a3f3b5-5dec-4eed-908e-e11ee657416c",
    "message_type": "session_welcome",
    "message_timestamp": "2023-07-19T14:56:51.634234626Z"
  },
  "payload": { }
}
```

`subscription_type` und `subscription_version` stehen NUR bei `notification` und `revocation` im
`metadata` ([WS], Tabelle "Headers": "Included only for notification and revocation message types").
Beachte im Doc-Beispiel: `metadata.subscription_version` ist dort `"1"`, waehrend
`payload.subscription.version` `"2"` ist (Doc-Beispiel, nicht als Regel lesen; die Version aus
`payload.subscription.version` bzw. der eigenen Subscription ableiten).

`message_type` Werte: `session_welcome`, `session_keepalive`, `notification`, `session_reconnect`,
`revocation`. (Ping/Pong sind echte WebSocket-Control-Frames, keine JSON-Messages.)

### 3.3 session_welcome

```json
{
  "metadata": { "message_id": "...", "message_type": "session_welcome", "message_timestamp": "..." },
  "payload": {
    "session": {
      "id": "AQoQILE98gtqShGmLD7AM6yJThAB",
      "status": "connected",
      "connected_at": "2023-07-19T14:56:51.616329898Z",
      "keepalive_timeout_seconds": 10,
      "reconnect_url": null
    }
  }
}
```

- `payload.session.id` ist die `session_id` fuer das Subscribe.
- Frist: "By default, you have 10 seconds from the time you receive the Welcome message to subscribe to
  an event, unless otherwise specified when connecting. If you don't subscribe within this
  timeframe, the server closes the connection." (Close-Code 4003.) "The time limit is subject to
  change."

### 3.4 session_keepalive

`payload` ist `{}`. Wird gesendet, wenn innerhalb von `keepalive_timeout_seconds` keine
Notification kam. Regel: Kommt laenger als `keepalive_timeout_seconds` weder Notification noch
Keepalive, ist die Verbindung als verloren zu betrachten: neu verbinden und neu abonnieren.
Der Timer wird nur durch Notification und Keepalive zurueckgesetzt, nicht durch Ping.

### 3.5 Ping/Pong

Auf WebSocket-Ping-Frames muss mit Pong geantwortet werden, sonst trennt der Server (Code 4002).
Die meisten Libraries (u.a. Browser) machen das automatisch.

### 3.6 notification

`metadata.message_type = "notification"`, plus `subscription_type`, `subscription_version`.
`payload.subscription` (id, status, type, version, cost, condition, transport, created_at) und
`payload.event` (typspezifisch). Beispiel siehe Abschnitt 5.1.

### 3.7 session_reconnect

```json
{
  "metadata": { "message_id": "...", "message_type": "session_reconnect", "message_timestamp": "..." },
  "payload": {
    "session": {
      "id": "AQoQexAWVYKSTIu4ec_2VAxyuhAB",
      "status": "reconnecting",
      "keepalive_timeout_seconds": null,
      "reconnect_url": "wss://eventsub.wss.twitch.tv?...",
      "connected_at": "2022-11-16T10:11:12.634234626Z"
    }
  }
}
```

Semantik laut Docs:

- Wird 30 Sekunden vor dem Schliessen der alten Verbindung gesendet.
- `reconnect_url` sofort fuer eine neue Verbindung nutzen, "as is; do not modify it".
- Die neue Verbindung hat dieselben Subscriptions (kein erneutes Subscribe noetig).
- "You should not close the old connection until you receive a Welcome message on the new
  connection." Die alte Verbindung bekommt weiter Events bis dahin.
- Wer die neue Verbindung nicht rechtzeitig aufbaut oder die alte nie schliesst, bekommt auf der
  alten Close-Code 4004.
- Reconnect ueber `reconnect_url` zaehlt nicht gegen das Limit von 3 Verbindungen.

### 3.8 revocation

`metadata` enthaelt `subscription_type`/`subscription_version`; `payload.subscription.status`
nennt den Grund. In [WS]: `user_removed`, `authorization_revoked`, `version_removed`.
[MANAGE] listet zusaetzlich u.a. `moderator_removed`, `chat_user_banned`, `beta_maintenance`
und die `websocket_*`-Status (`websocket_disconnected`, `websocket_failed_ping_pong`,
`websocket_received_inbound_traffic`, `websocket_connection_unused`, `websocket_internal_error`,
`websocket_network_timeout`, `websocket_network_error`, `websocket_failed_to_reconnect`).
Eine Revocation kommt einmalig; danach keine Nachrichten mehr fuer diese Subscription.
"Twitch reserves the right to revoke a subscription at any time."

### 3.9 Close-Codes

| Code | Grund | Hinweis (Docs) |
| ---- | ----- | -------------- |
| 4000 | Internal server error | Serverproblem (wie HTTP 500) |
| 4001 | Client sent inbound traffic | Senden ausser Pong verboten |
| 4002 | Client failed ping-pong | Ping muss mit Pong beantwortet werden |
| 4003 | Connection unused | Innerhalb von 10 s nach Verbindung muss eine Subscription angelegt werden |
| 4004 | Reconnect grace time expired | Nach `session_reconnect` 30 s Zeit zum Wechseln und Schliessen der alten |
| 4005 | Network timeout | Transienter Timeout |
| 4006 | Network error | Transienter Netzwerkfehler |
| 4007 | Invalid reconnect | Reconnect-URL ungueltig |

### 3.10 Limits

Laut [WS] "Subscription limits", gelten "per user token (client ID and user ID tuple)":

- maximal 3 WebSocket-Verbindungen mit aktiven Subscriptions,
- maximal 300 aktive Subscriptions pro Verbindung (deaktivierte zaehlen nicht),
- `max_total_cost` ist 10 ueber alle Subscriptions.
- "You should create one WebSocket connection until you have a reason to create another one."

Kosten ([MANAGE], "Subscription limits"): Subscriptions, die eine Nutzer-Autorisierung verlangen
(z.B. `channel.subscribe`), kosten 0. Subscriptions, die eine User-ID brauchen, aber keine
Autorisierung verlangen (`stream.online`, `channel.update`), kosten 1, ausser der Nutzer hat die App
fuer diesen Nutzer autorisiert (dann 0). Max. 3 Subscriptions mit gleichem Typ und gleicher
Condition.

Widerspruch in den Docs: Beispiele zeigen `"max_total_cost": 10000`, der Text und die Fehlerliste von
Create Subscription nennen fuer WebSockets 10. Fuer uns gilt 10 (siehe "Offene Punkte").

Authentifizierung: WebSockets brauchen einen User Access Token; mit App-Token schlaegt das
Subscribe fehl ([WS] "Migrating ... Authentication"). Ist fuer einen Typ keine Scope-Anforderung
angegeben, "you must create a user access token with no scope" ([MANAGE]), d.h. ein Token ohne
Scope reicht.

---

## 4. Subscription anlegen

Quelle: [API-EVENTSUB] (https://dev.twitch.tv/docs/api/reference/eventsub#create-eventsub-subscription).

- `POST https://api.twitch.tv/helix/eventsub/subscriptions`
- Header: `Authorization: Bearer <user access token>`, `Client-Id: <client id>`,
  `Content-Type: application/json`.
- Bei WebSocket: nur User-Token. "The ID in the Client-Id header must match the client ID in the
  access token."
- Body:

```json
{
  "type": "channel.follow",
  "version": "2",
  "condition": { "broadcaster_user_id": "1337", "moderator_user_id": "1337" },
  "transport": { "method": "websocket", "session_id": "AQoQexAWVYKSTIu4ec_2VAxyuhAB" }
}
```

Fuer `method: "websocket"` darf man `callback`/`secret` nicht mitsenden. `version` ist ein String.

Antwort `202 Accepted`:

```json
{
  "data": [
    {
      "id": "f1c2a387-161a-49f9-a165-0f21d7a4e1c4",
      "status": "enabled",
      "type": "channel.follow",
      "version": "2",
      "cost": 0,
      "condition": { "broadcaster_user_id": "1234", "moderator_user_id": "1234" },
      "transport": { "method": "websocket", "session_id": "...", "connected_at": "..." },
      "created_at": "2019-11-16T10:11:12.634234626Z"
    }
  ],
  "total": 1,
  "total_cost": 0,
  "max_total_cost": 10
}
```

(Feldliste aus [API-EVENTSUB]: `data[].id/status/type/version/condition/created_at/transport/cost`,
`total`, `total_cost`, `max_total_cost`. Bei WebSocket: `data.transport.session_id` und `connected_at`.)

Fehlercodes (Auswahl aus den Docs):

- `400`: u.a. Condition fehlt oder unvollstaendig; ungueltige Typ/Version-Kombination;
  `session_id` fehlt; "The request must use a user access token if the transport method is
  WebSocket"; "The WebSocket session doesn't exist or has already disconnected"; "The WebSocket
  session already has subscriptions that a different user created".
- `401`: Authorization fehlt/ungueltig oder Client-Id passt nicht zum Token.
- `403`: Token erfuellt die Anforderungen des Typs nicht (z.B. fehlender Scope).
- `409`: gleiche Subscription (Typ + Condition + Session) existiert schon; die `message` enthaelt
  die ID der bestehenden.
- `410`: Version 1 von `channel.follow` ist nicht mehr verfuegbar, Version 2 nutzen.
- `429`: mehr als 3 gleiche Typ+Condition, `max_total_cost` ueberschritten, mehr als 3
  WebSocket-Verbindungen, schon 300 Subscriptions auf der Verbindung, WebSocket-`max_total_cost` 10.

---

## 5. Subscription-Typen

Gemeinsam: Jede Notification hat `payload.subscription` (`id`, `status`, `type`, `version`, `cost`,
`condition`, `transport`, `created_at`) und `payload.event`. Quelle jeweils
`https://dev.twitch.tv/docs/eventsub/reference/<gruppe>#<anker>`. Alle IDs sind Strings.

### 5.1 `channel.follow`, Version 2

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel#channel-follow

- Scope: `moderator:read:followers` (User-Token). Wichtig: das ist NICHT `channel:read:followers`.
- Condition: `broadcaster_user_id` (Pflicht), `moderator_user_id` (Pflicht; bei Autorisierung durch
  den Broadcaster selbst die ID des Broadcasters eintragen).
- Version 1 ist entfernt (HTTP 410).

Event-Felder (alle String):

`user_id`, `user_login`, `user_name` (der neue Follower), `broadcaster_user_id`,
`broadcaster_user_login`, `broadcaster_user_name`, `followed_at` (RFC3339).

Beispiel (aus [WS]):

```json
{
  "metadata": {
    "message_id": "befa7b53-d79d-478f-86b9-120f112b044e",
    "message_type": "notification",
    "message_timestamp": "2022-11-16T10:11:12.464757833Z",
    "subscription_type": "channel.follow",
    "subscription_version": "1"
  },
  "payload": {
    "subscription": { "id": "f1c2a387-161a-49f9-a165-0f21d7a4e1c4", "status": "enabled",
      "type": "channel.follow", "version": "2", "cost": 0,
      "condition": { "broadcaster_user_id": "12826", "moderator_user_id": "12826" },
      "transport": { "method": "websocket", "session_id": "AQoQexAWVYKSTIu4ec_2VAxyuhAB" },
      "created_at": "2022-11-16T10:11:12.464757833Z" },
    "event": {
      "user_id": "1337", "user_login": "awesome_user", "user_name": "Awesome_User",
      "broadcaster_user_id": "12826", "broadcaster_user_login": "twitch",
      "broadcaster_user_name": "Twitch", "followed_at": "2023-07-15T18:16:11.17106713Z"
    }
  }
}
```

### 5.2 `channel.chat.message`, Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/chat#channel-chat-message

- Scope: `user:read:chat` (User-Token). (App-Token-Variante braucht `user:read:chat`+`user:bot`
  und `channel:bot`; fuer uns irrelevant.)
- Condition (beide Pflicht): `broadcaster_user_id` ("The User ID of the channel to receive chat
  message events for"), `user_id` ("The User ID to read chat as").

Event-Felder:

| Feld | Typ | Beschreibung |
| ---- | --- | ------------ |
| `broadcaster_user_id` / `_name` / `_login` | String | Kanal |
| `chatter_user_id` / `_name` / `_login` | String | Absender |
| `message_id` | String | UUID der Nachricht |
| `message` | Object | strukturierte Nachricht |
| `message.text` | String | Klartext |
| `message.fragments` | Object[] | geordnete Fragmente |
| `message.fragments[].type` | String | `text`, `cheermote`, `emote`, `mention`, `gif` |
| `message.fragments[].text` | String | Text des Fragments |
| `message.fragments[].cheermote` | Object, nullable | `prefix` (String, lowercase), `bits` (Int), `tier` (Int) |
| `message.fragments[].emote` | Object, nullable | `id`, `emote_set_id`, `owner_id` (String), `format` (String[]: `animated` / `static`) |
| `message.fragments[].mention` | Object, nullable | `user_id`, `user_name`, `user_login` |
| `message.fragments[].gif` | Object, nullable | `id` (String), `url` (String; "must use the full URL provided; it must not be modified") |
| `message_type` | String | `text`, `channel_points_highlighted`, `channel_points_sub_only`, `user_intro`, `power_ups_message_effect`, `power_ups_gigantified_emote` |
| `badges` | Object[] | je `set_id`, `id`, `info` (alle String) |
| `cheer` | Object, nullable | `bits` (Int) |
| `color` | String | Hex `#RRGGBB`, kann leer sein ("may be empty if it is never set") |
| `reply` | Object, nullable | `parent_message_id`, `parent_message_body`, `parent_user_id`, `parent_user_name`, `parent_user_login`, `thread_message_id`, `thread_user_id`, `thread_user_name`, `thread_user_login` |
| `channel_points_custom_reward_id` | String, nullable | ID der eingeloesten Belohnung |
| `source_broadcaster_user_id` / `_name` / `_login` | String, nullable | Shared Chat: Ursprungskanal, sonst `null` |
| `source_message_id` | String, nullable | Shared Chat |
| `source_badges` | Object[], nullable | Shared Chat; je `set_id`, `id`, `info` |
| `is_source_only` | Boolean, nullable | Shared Chat |

Badge-Details: `badges[].info` enthaelt laut Docs aktuell nur bei Subscriber-Badges Metadaten
(Anzahl Monate). Badges pro Nachricht lesen, nicht cachen ([EMOTES], "Chat Badges"). Die Docs
liefern in dieser Nachricht nur `set_id`/`id`/`info`, keine Bild-URLs. Badge-Bilder kommen aus
einem anderen Endpunkt (Get Global/Channel Chat Badges; hier nicht recherchiert).

Beispiel aus den Docs (Event):

```json
{
  "broadcaster_user_id": "1971641", "broadcaster_user_login": "streamer", "broadcaster_user_name": "streamer",
  "chatter_user_id": "4145994", "chatter_user_login": "viewer32", "chatter_user_name": "viewer32",
  "message_id": "cc106a89-1814-919d-454c-f4f2f970aae7",
  "message": {
    "text": "Hi chat",
    "fragments": [
      { "type": "text", "text": "Hi chat", "cheermote": null, "emote": null, "mention": null }
    ]
  },
  "color": "#00FF7F",
  "badges": [
    { "set_id": "moderator", "id": "1", "info": "" },
    { "set_id": "subscriber", "id": "12", "info": "16" },
    { "set_id": "sub-gifter", "id": "1", "info": "" }
  ],
  "message_type": "text",
  "cheer": null,
  "reply": null,
  "channel_points_custom_reward_id": null,
  "source_broadcaster_user_id": null,
  "source_broadcaster_user_login": null,
  "source_broadcaster_user_name": null,
  "source_message_id": null,
  "source_badges": null
}
```

Emote-Fragment-Beispiel (aus [EMOTES], gekuerzt): Fragment mit `"type": "emote"` und `emote`-Objekt;
die Bild-URL setzt man aus `emote.id` plus Wahl von format/theme/scale zusammen (Abschnitt 6).

### 5.3 `channel.subscribe`, Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel#channel-subscribe

- Scope: `channel:read:subscriptions`. Condition: `broadcaster_user_id`.
- Gilt NICHT fuer Resubscribes ("This does not include resubscribes").
- Event: `user_id`, `user_login`, `user_name`, `broadcaster_user_id`, `broadcaster_user_login`,
  `broadcaster_user_name` (String), `tier` (String: `1000`, `2000`, `3000`), `is_gift` (Boolean).

```json
{ "user_id": "1234", "user_login": "cool_user", "user_name": "Cool_User",
  "broadcaster_user_id": "1337", "broadcaster_user_login": "cooler_user",
  "broadcaster_user_name": "Cooler_User", "tier": "1000", "is_gift": false }
```

### 5.4 `channel.subscription.message`, Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel#channel-subscription-message

- Scope: `channel:read:subscriptions`. Condition: `broadcaster_user_id`.
- Event: `user_id`, `user_login`, `user_name`, `broadcaster_user_id`, `broadcaster_user_login`,
  `broadcaster_user_name` (String), `tier` (String), `message` (Object: `text` String, `emotes`
  Object[] mit `begin` Int, `end` Int, `id` String), `cumulative_months` (Int), `streak_months`
  (Int, nullable: null wenn der Nutzer das nicht teilt), `duration_months` (Int).

```json
{ "user_id": "1234", "user_login": "cool_user", "user_name": "Cool_User",
  "broadcaster_user_id": "1337", "broadcaster_user_login": "cooler_user",
  "broadcaster_user_name": "Cooler_User", "tier": "1000",
  "message": { "text": "Love the stream! FevziGG",
               "emotes": [ { "begin": 23, "end": 30, "id": "302976485" } ] },
  "cumulative_months": 15, "streak_months": 1, "duration_months": 6 }
```

### 5.5 `channel.subscription.gift`, Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel#channel-subscription-gift

- Scope: `channel:read:subscriptions`. Condition: `broadcaster_user_id`.
- Event: `user_id`, `user_login`, `user_name` (String, NULLABLE: `null` bei anonymem Gift),
  `broadcaster_user_id`, `broadcaster_user_login`, `broadcaster_user_name` (String),
  `total` (Int: Anzahl Subs im Gift), `tier` (String), `cumulative_total` (Int, nullable: null bei
  anonym oder wenn der Gifter das nicht teilt), `is_anonymous` (Boolean).

```json
{ "user_id": "1234", "user_login": "cool_user", "user_name": "Cool_User",
  "broadcaster_user_id": "1337", "broadcaster_user_login": "cooler_user",
  "broadcaster_user_name": "Cooler_User", "total": 2, "tier": "1000",
  "cumulative_total": 284, "is_anonymous": false }
```

Hinweis: Die Docs beschreiben ein Gift-Event pro Gift-Aktion (`total`). Ob zusaetzlich pro
beschenktem Nutzer ein `channel.subscribe` mit `is_gift: true` kommt, steht auf diesen Seiten
nicht; `channel.subscribe.is_gift` existiert aber. Doppelzaehlung pruefen.

### 5.6 `channel.cheer`, Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel#channel-cheer

- Scope: `bits:read`. Condition: `broadcaster_user_id`.
- Event: `is_anonymous` (Boolean), `user_id`/`user_login`/`user_name` (String, nullable: null wenn
  `is_anonymous` true), `broadcaster_user_id`/`_login`/`_name` (String), `message` (String),
  `bits` (Int).

```json
{ "is_anonymous": false, "user_id": "1234", "user_login": "cool_user", "user_name": "Cool_User",
  "broadcaster_user_id": "1337", "broadcaster_user_login": "cooler_user",
  "broadcaster_user_name": "Cooler_User", "message": "pogchamp", "bits": 1000 }
```

### 5.7 `channel.raid`, Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel#channel-raid

- Authorization: "No authorization required." (Token ohne Scope genuegt.)
- Condition: entweder `from_broadcaster_user_id` ODER `to_broadcaster_user_id`, nie beide
  ("If you pass both parameters, the subscription request fails"). Fuer "wir werden geraidet":
  `to_broadcaster_user_id` = eigene Kanal-ID.
- Event: `from_broadcaster_user_id`/`_login`/`_name`, `to_broadcaster_user_id`/`_login`/`_name`
  (String), `viewers` (Int).

```json
{ "from_broadcaster_user_id": "1234", "from_broadcaster_user_login": "cool_user",
  "from_broadcaster_user_name": "Cool_User", "to_broadcaster_user_id": "1337",
  "to_broadcaster_user_login": "cooler_user", "to_broadcaster_user_name": "Cooler_User",
  "viewers": 9001 }
```

### 5.8 `stream.online` / `stream.offline`, jeweils Version 1

Quelle: https://dev.twitch.tv/docs/eventsub/reference/stream

- Authorization: "No authorization required." Condition: `broadcaster_user_id`.
- Kosten: 1, ausser der Nutzer hat die App autorisiert (bei User-Token von uns: 0, siehe 3.10;
  genaue Kostenberechnung bei User-Token ist in den Docs nur indirekt belegt).
- `stream.online` Event: `id` (String, Stream-ID), `broadcaster_user_id`/`_login`/`_name` (String),
  `type` (String: `live`, `playlist`, `watch_party`, `premiere`, `rerun`), `started_at` (String).
- `stream.offline` Event: `id`, `broadcaster_user_id`, `broadcaster_user_login`,
  `broadcaster_user_name` (alle String).

```json
{ "id": "9001", "broadcaster_user_id": "1337", "broadcaster_user_login": "cool_user",
  "broadcaster_user_name": "Cool_User", "type": "live", "started_at": "2020-10-11T10:11:12.123Z" }
```

### 5.9 `channel.channel_points_custom_reward_redemption.add`, Version 1 (kurz)

Quelle: https://dev.twitch.tv/docs/eventsub/reference/channel-points#channel-channel-points-custom-reward-redemption-add

- Scope: `channel:read:redemptions` ODER `channel:manage:redemptions`.
- Condition: `broadcaster_user_id` (Pflicht), `reward_id` (optional, nullable: nur diese Belohnung).
- Event: `id` (Redemption-ID), `broadcaster_user_id`/`_login`/`_name`, `user_id`, `user_login`,
  `user_name`, `user_input` (String, leer wenn keine Eingabe), `status` (`unknown`, `unfulfilled`,
  `fulfilled`, `canceled`), `redeemed_at` (RFC3339), `reward` (Object: `id`, `title`, `cost` Int,
  `prompt`).

```json
{ "id": "17fa2df1-ad76-4804-bfa5-a40ef63efe63", "user_id": "9001", "user_login": "cooler_user",
  "user_name": "Cooler_User", "user_input": "pogchamp", "status": "unfulfilled",
  "reward": { "id": "92af127c-7326-4483-a52b-b0da0be61c01", "title": "title", "cost": 100,
              "prompt": "reward prompt" },
  "redeemed_at": "2020-07-15T17:16:03.17106713Z" }
```

(Broadcaster-Felder im Beispiel gekuerzt.)

### 5.10 Scope-Uebersicht fuer die Device-Flow-Anfrage

Bei `scopes` im Device-Request (leerzeichen-getrennt, URL-encoded):

| Zweck | Scope |
| ----- | ----- |
| Chat lesen | `user:read:chat` |
| Follows | `moderator:read:followers` |
| Subs / Resubs / Gifts | `channel:read:subscriptions` |
| Cheers | `bits:read` |
| Channel Points | `channel:read:redemptions` |
| Chat senden (spaeter) | `user:write:chat` |
| Raid, stream.online/offline | keiner |

Scope-Namen sind gegen [SCOPES] (https://dev.twitch.tv/docs/authentication/scopes/) und die
jeweiligen Event-Seiten geprueft. Scope-Aenderungen erfordern eine neue Autorisierung durch den
Nutzer.

---

## 6. Emote-Bild-URL

Quellen: [API-CHAT] Get Global Emotes
(https://dev.twitch.tv/docs/api/reference/chat#get-global-emotes) und [EMOTES]
(https://dev.twitch.tv/docs/irc/emotes/).

Das Feld `template` der Antwort lautet woertlich:

```
https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}
```

Die Platzhalter sind literal `{{id}}`, `{{format}}`, `{{theme_mode}}`, `{{scale}}` (doppelte
geschweifte Klammern) und werden mit den gleichnamigen Feldern des Emotes ersetzt:

- `format`: `static` (PNG) oder `animated` (GIF). Bei EventSub-Fragmenten steht die Liste der
  verfuegbaren Formate in `emote.format`.
- `theme_mode`: `light` oder `dark`.
- `scale`: `1.0` (28x28), `2.0` (56x56), `3.0` (112x112).

Beispiel aus [EMOTES]: `https://static-cdn.jtvnw.net/emoticons/v2/62836/static/light/3.0`.

Die Docs raten ausdruecklich, `template` zu nutzen statt der `images.url_1x/2x/4x`-Felder
(diese liefern nur statische Bilder mit hellem Hintergrund; `url_4x` ist 112x112).
Zusatz: [GUIDE] erlaubt Twitch, URL-Formate zu aendern ("your code should not take dependencies on
the URLs that the API returns except where noted"). Das `template`-Feld ist die dokumentierte
Ausnahme. Aus dem Chat-Event ergibt sich die URL nur aus der Template-Konvention; ein
hartkodiertes Muster ist durch die Beispiele belegt, aber die Template-Antwort ist die Autoritaet.

Hinweis: Ein `emote.format` das nur `static` enthaelt darf nicht als `animated` angefragt werden.

---

## 7. Helix Get Users

Quelle: [API-USERS] (https://dev.twitch.tv/docs/api/reference/users#get-users).

- `GET https://api.twitch.tv/helix/users`
- Auth: User-Token oder App-Token; Header `Authorization: Bearer ...`, `Client-Id`.
- Query: `id` (wiederholbar: `id=1234&id=5678`), `login` (wiederholbar).
- Limit: "the sum total of the number of users you may look up is 100" (IDs und Logins zusammen,
  nicht je 100). Ohne Parameter und mit User-Token: der Nutzer des Tokens.
- Fehler `400`: zu viele Parameter oder eine fehlerhafte ID/Login ("One malformed value fails the
  whole request"). `401`: Token/Client-Id ungueltig.
- Antwortfelder `data[]`: `id`, `login`, `display_name`, `type` (`admin`, `global_mod`, `staff`
  oder leerer String), `broadcaster_type` (`affiliate`, `partner` oder leer), `description`,
  `profile_image_url`, `offline_image_url`, `view_count` (deprecated, nicht nutzen), `email`
  (nur mit `user:read:email`), `created_at`.
- Gesperrte oder geloeschte Konten fehlen in der Liste ("doesn't include deleted or suspended
  accounts"): Antwortliste kann kuerzer sein als die Anfrage.

---

## 8. Chat-Nachricht senden (spaeter, kurz)

Quelle: [API-CHAT] (https://dev.twitch.tv/docs/api/reference/chat#send-chat-message).

- `POST https://api.twitch.tv/helix/chat/messages`
- Scope: `user:write:chat` (User-Token).
- Body (JSON): `broadcaster_id` (Pflicht), `sender_id` (Pflicht; muss der User des Tokens sein),
  `message` (Pflicht, max. 500 Zeichen), `reply_parent_message_id` (optional),
  `for_source_only` (nur mit App-Token; mit User-Token fuehrt es zu 400), `pin` (neu, optional,
  braucht zusaetzlich `moderator:manage:chat_messages`).
- Antwort 200: `data[].message_id`, `data[].is_sent` (Boolean), `data[].drop_reason`
  (`null` oder `{ code, message }`).
- `drop_reason.code` Werte u.a.: `msg_duplicate`, `user_banned`, `user_warned`, `user_timed_out`,
  `emote_only_mode`, `slow_mode`, `followers_only_mode`, `subs_only_mode`, `unique_mode`,
  `verified_account`, `channel_settings`, `automod_held`, `msg_rejected`, `msg_bad_characters`,
  `banned_email_alias`, `banned_phone_alias`, `verified_phone_number`, `channel_suspended`.
- Fehler: `400`, `401`, `403`, `422` (Nachricht zu gross), `429`.
- `msg_duplicate`: identisch zur vorherigen Nachricht des Senders in den letzten 30 s.

---

## 9. Rate Limits

Quelle: [GUIDE] (https://dev.twitch.tv/docs/api/guide#twitch-rate-limits).

- Token-Bucket pro Client-ID. Standard-Kosten pro Request: 1 Punkt. Es gibt einen Bucket fuer
  App-Requests und einen fuer User-Requests; bei User-Token gilt das Limit "per client ID per user
  per minute".
- Ueberschreitung: HTTP `429`.
- Response-Header: `Ratelimit-Limit` (max. Bucket), `Ratelimit-Remaining` (Punkte im Bucket),
  `Ratelimit-Reset` (Unix-Epoch-Zeitstempel, wann der Bucket wieder voll ist). Beispiel in den
  Docs: `800` / `799` / `1781653392`.
- Bei 429: bis `Ratelimit-Reset` warten.
- Manche Endpunkte liefern 429 aus anderen Gruenden; dann Fehlermeldung auswerten.
- Der Wert 800 stammt aus dem Header-Beispiel der Docs; ein fester Standard-Bucket-Wert wird im
  Text nicht ausdruecklich als Garantie genannt.

---

## Offene Punkte / unbelegt

1. Device-Flow-Fehler: `slow_down`, `expired_token`/abgelaufener `device_code`, `access_denied`
   (Nutzer lehnt ab) sind in den Twitch-Docs nicht dokumentiert. Dokumentiert ist nur
   `authorization_pending` (400) und `invalid device code` (400). Annahme fuer die Implementierung:
   jeder andere 400er beim Polling beendet den Flow; das ist aber NICHT durch Docs gedeckt.
   Verhalten live gegen Twitch testen.
2. HTTP-Status/Reaktion bei zu schnellem Polling: nicht belegt. `interval` einhalten.
3. Einheit von `expires_in`/`interval` im Device-Response: nicht ausdruecklich genannt
   (Beispiel 1800 / 5 passt zu Sekunden).
4. Content-Type fuer `/oauth2/device` und das Polling auf `/oauth2/token`: Doc-Beispiele nutzen
   `--form` (multipart). Ob `application/x-www-form-urlencoded` ebenfalls akzeptiert wird, steht
   nicht dort (fuer Refresh und Revoke ist `x-www-form-urlencoded` ausdruecklich belegt).
5. Refresh-Token-Lebensdauer Public Client: [OAUTH] sagt "30 days" bei Inaktivitaet, [REFRESH]
   sagt "30 days after they are generated". Konservativ annehmen: nach 30 Tagen ohne Nutzung
   (mindestens) muss neu autorisiert werden; App sollte beim Start refreshen und den neuen Token
   sofort speichern.
6. Client Type "Public" in der Developer Console: die Register-Seite erwaehnt das Feld nicht.
   Ob die Redirect-URL fuer Device Flow Pflicht ist, ist unbelegt (nur "set OAuth Redirect URLs").
   Praktisch: pruefen, was die Console beim Anlegen verlangt; falls Pflicht, `http://localhost`
   eintragen (Annahme, nicht aus den Docs).
7. Revoke akzeptiert laut Seite einen "access token"; Refresh-Token-Revoke ist nicht beschrieben.
8. `max_total_cost` fuer WebSockets: Text und Fehlerliste sagen 10, Beispielantworten zeigen
   10000. Als 10 behandeln. Wie sich Kosten bei User-Token genau berechnen (stream.online mit
   eigener Autorisierung = 0?) ist nur indirekt belegt ([MANAGE]); `cost` der Antwort pruefen.
9. Muss `condition.user_id` bei `channel.chat.message` der User des Tokens sein? Die Seite sagt
   "The User ID to read chat as"; eine ausdrueckliche Gleichheitsregel mit dem Token steht dort
   nicht (bei Send Chat Message ist sie belegt).
10. Doppelte Events bei Sub-Gifts (`channel.subscription.gift` plus je Empfaenger
    `channel.subscribe` mit `is_gift: true`): auf den Referenzseiten nicht beschrieben.
11. Badge-Bilder: aus dem Chat-Event kommen nur `set_id`/`id`/`info`; der Bild-Endpunkt
    (Get Global/Channel Chat Badges) wurde hier nicht recherchiert.
12. Event-Reihenfolge und Duplikate: Twitch dokumentiert `metadata.message_id` pro Nachricht;
    eine ausdrueckliche Dedupe-Garantie oder Reihenfolgegarantie fuer WebSockets habe ich auf den
    gelesenen Seiten nicht gefunden. Dedupe ueber `message_id` ist trotzdem sinnvoll (z.B. beim
    Reconnect-Uebergang), aber nicht als Pflicht belegt.
13. Hinweis zur Quelle: Die Seiten wurden als HTML abgerufen und zu Text reduziert. Feldnamen,
    Typen und Beispiele sind direkt uebernommen; Fliesstext ist teils gekuerzt oder
    paraphrasiert.
