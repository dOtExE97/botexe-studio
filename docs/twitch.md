# Twitch mit bOtExE Studio

bOtExE Studio holt Follows, Chat (mit Emotes), Subs, Bits, Raids, Kanalpunkte
und die Follower-Zahl von deinem Twitch-Kanal in die App und antwortet auf Wunsch
im Twitch-Chat. TikTok und Twitch laufen dabei **getrennt**: Jedes
Overlay weiß, für welche Plattform es da ist, und zeigt nur deren Chat und Alarme.

## Einrichtung in 5 Schritten

1. **Client-ID holen (einmalig).** Auf [dev.twitch.tv/console](https://dev.twitch.tv/console)
   mit deinem Twitch-Konto anmelden → „Anwendung registrieren":
   - Name: frei wählbar (z. B. „bOtExE Studio von <dein Name>")
   - Weiterleitungs-URL (OAuth Redirect URL): `https://localhost`
   - Kategorie: **Application Integration**
   - Client-Typ: **Öffentlich**

   Speichern und die **Client-ID** kopieren. Ein Geheimnis (Client Secret)
   brauchst du nicht — die App fragt nie danach.
2. **In der App verbinden.** Einstellungen → Twitch → Client-ID einfügen →
   **„Mit Twitch verbinden"**. Die App zeigt einen Code und öffnet Twitch im
   Browser; dort den Code bestätigen. Fertig — der Punkt wird grün
   („Verbunden"). Mit „Beim Start automatisch mit Twitch verbinden" verbindet
   die App sich ab jetzt von selbst.
3. **Twitch-Overlay anlegen.** Overlay-Editor → oben in der Profil-Leiste
   **„Twitch-Overlay (Querformat) anlegen"**. Es entsteht ein fertiges
   1920×1080-Overlay mit Chat rechts, Piraten-Banner oben links und einem
   Herz-Alarm in der Mitte: Piraten-Orakel bei jedem neuen Follower, dazu große
   Piraten-Animationen für Subs (auch Resubs und verschenkte Abos), Bits und
   Raids. Alles lässt sich frei
   verschieben und umstellen; die Bildmitte bleibt fürs Spiel frei.
4. **Link kopieren.** Am Profil-Knopf des neuen Overlays auf das
   **Ketten-Symbol** („Overlay-Link kopieren (OBS / Browser)") klicken. Der Link
   sieht so aus:
   `http://127.0.0.1:<Port>/overlay?token=<dein Schlüssel>&profile=<Overlay-ID>`.
   Der `profile`-Teil sorgt dafür, dass OBS genau dieses Overlay zeigt, egal
   welches Profil in der App gerade Standard ist.
5. **In OBS einfügen.** Quelle hinzufügen → **Browser** → Link einfügen →
   Breite **1920**, Höhe **1080** → OK. Die Browserquelle über das Spielbild
   legen.

## TikTok und Twitch getrennt — die Einstellung „Plattform"

Neben dem Profilnamen im Overlay-Editor steht die Auswahl:

| Einstellung | Was das Overlay bekommt |
|---|---|
| **Alle Plattformen** (Standard) | alles von TikTok und Twitch — so wie jedes Overlay vor der Twitch-Anbindung |
| **Nur TikTok** | nur TikTok-Chat und TikTok-Alarme |
| **Nur Twitch** | nur Twitch-Chat und Twitch-Alarme |

Ereignisse ohne Plattform (Timer, Test-Knöpfe, Wiederholungen) erscheinen in
jedem Overlay. Deine Regeln („wenn Follow → zeig Alarm") gelten für beide
Plattformen; der Alarm landet aber nur in den Overlays, die zur auslösenden
Plattform passen.

Für ein gemischtes Overlay („Alle Plattformen"): In der Chat-Box den Schalter
**„Plattform-Zeichen vor dem Namen"** einschalten, dann steht vor jedem Namen
ein kleines TikTok- oder Twitch-Zeichen.

## Kanalpunkte, Chat-Bot und Raid

> **Nach dem Update einmal neu verbinden.** Für Kanalpunkte, Chat-Antworten und
> Raid braucht die App drei zusätzliche Rechte (`channel:read:redemptions`,
> `user:write:chat`, `channel:manage:raids`). Twitch fragt danach nur einmal:
> Die App meldet „Bitte neu verbinden" — Schritt 2 wiederholen, fertig.

**Nur mit Affiliate (oder Partner):** Kanalpunkte, Bits, Subs und Werbung gibt
es bei Twitch erst ab Affiliate. Bist du noch keiner, verbindet die App trotzdem
ganz normal; bei den Kanalpunkten steht dann einmal im Log „Kanalpunkte gibt es
erst ab Twitch-Affiliate". Sobald du Affiliate bist, kommen sie von selbst an.

### Kanalpunkte als Auslöser

Reiter **Trigger** → neue Regel → Ereignis **„🟣 Twitch-Kanalpunkte eingelöst"**.
Als Bedingung **„Belohnung heißt genau …"** und den Titel so eintragen, wie er
bei Twitch heißt (Groß-/Kleinschreibung egal). Beispiel: Belohnung „Kanone" →
Sound abspielen + Alarm zeigen. Ohne Bedingung feuert die Regel bei **jeder**
Belohnung. Verlangt die Belohnung eine Eingabe, steht sie in der Vorlage als
`{text}` bereit (z. B. Ansage „{user} sagt: {text}").

### Chat-Antworten (Bot)

Die Aktion **„In den Chat schreiben"** einer Regel und Chat-Befehle mit
**„In Chat senden"** antworten jetzt in den Chat, **aus dem das Ereignis kam**:
Twitch-Ereignis → Twitch-Chat, TikTok-Ereignis → TikTok-Chat. Die Antwort
schreibt dein eigener Kanal. Höchstens eine Nachricht alle 1,5 Sekunden; dieselbe
Nachricht innerhalb von 30 Sekunden geht nur einmal raus. Die eigenen Antworten
lösen nie selbst wieder Befehle aus (und erscheinen nicht im Overlay-Chat).

Eine fertige Befehlsliste bringt die App nicht mit — Befehle legst du im Reiter
**Befehle** an (gilt für TikTok und Twitch gleichzeitig):

| Befehl | Antwort (Beispiel) | Einstellung |
|---|---|---|
| `!discord` | `Komm auf meinen Discord: discord.gg/…` | „In Chat senden" an, Vorlesen aus |
| `!tiktok` | `Mich gibt's auch auf TikTok: tiktok.com/@…` | „In Chat senden" an |

`!kiste` („in welcher Kiste liegt mein Token?") geht noch nicht: Die
Kistennummer würfelt das Piraten-Orakel im Overlay, die App selbst kennt sie
nicht.

### Raid starten (Stream Deck)

`POST /api/twitch/raid?login=<kanal>&token=…` startet einen Raid, Twitch zählt
dann 90 Sekunden herunter (oder in Twitch „Jetzt raiden" klicken).
`POST /api/twitch/raid-abbrechen?token=…` bricht ihn bis dahin ab. Details und
Fehlermeldungen: [api.md](api.md).

## Gut zu wissen

- Twitch-Zahlen fließen **nicht** in die TikTok-Statistiken (Coins, Likes,
  Top-Gifter) — die bleiben sauber TikTok.
- Eine **eigene Twitch-Bestenliste** gibt es trotzdem: Widget „Top Gifter",
  Quelle **„Twitch-Supporter"**. Gezählt wird je Zuschauer: 1 Bit = 1 Punkt,
  1 Sub (auch Resub) = 500 Punkte, verschenkte Subs zählen beim Schenkenden
  (Anzahl × 500). Anonyme Cheers/Geschenke landen nie in der Liste. Angezeigt
  wird, was jemand gegeben hat („2 Subs + 300 Bits"), sortiert nach Punkten.
  Passender Look: Stil **„Schatz"** („TOP PIRATEN", Krone, Silber- und
  Bronzemünze). Die Liste gilt pro Stream wie die übrige Statistik.
- Für die Leiste unten im Bild („Letzter Follower / Abo / Cheer / Raid") gibt
  es das Widget **„Piraten-Infoleiste (Letzter …)"** (Reiter Stats & Zähler,
  1600×84). Abos zählen dort nur von Twitch; nach einem Neuladen der
  Browserquelle stehen die letzten Namen sofort wieder da.
- Fürs **Affiliate-Ziel** (50 Follower) gibt es die **„Affiliate-Schatzkarte
  (Twitch)"** (Reiter Gifts & Ziele, 640×110 oder 900×120): Goal-Bar im Stil
  „Schatzkarte" mit der Metrik „Twitch-Follower". Sie zeigt den echten
  Follower-Stand des Kanals (Ereignis `follower_stand`, beim Laden sofort da)
  und zählt dazwischen jeden Twitch-Follow mit.
- Wer **zum allerersten Mal** in deinen Twitch-Chat schreibt, bekommt mit dem
  Widget **„Neuer Pirat an Bord! (Erst-Chatter)"** (Reiter Alerts, 520×130) ein
  eigenes Schild. Bots (Standard: StreamElements, Nightbot, Moobot), anonyme
  Geschenke und du selbst sind ausgenommen; mehrere Neue kommen nacheinander.
- Für Fortnite: **„Piraten-Zähler (Fortnite)"** (Stats & Zähler, 360×110) zählt
  Victory Royales und Kills — per Stream Deck über `POST /api/zaehler`
  (`docs/api.md`).
- Twitch-Zuschauer haben eigene IDs (`twitch:<nummer>`); Punkte und Spiele
  vermischen sich nicht mit TikTok-Zuschauern gleichen Namens.
- Das Piraten-Orakel und die Twitch-Piraten (Sub, Bits, Raid) sind im
  Herz-Alarm standardmäßig **aus** und nur in der Twitch-Vorlage an. Ein Sub
  von TikTok (Superfan-Abo) löst nie die Twitch-Sub-Animation aus.
- Erscheint „Bitte neu verbinden": Die Anmeldung ist abgelaufen (Twitch lässt
  sie nach etwa 30 Tagen ohne Nutzung verfallen). Einfach Schritt 2 wiederholen.
