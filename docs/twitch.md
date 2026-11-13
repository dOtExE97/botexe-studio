# Twitch mit bOtExE Studio

bOtExE Studio holt Follows, Chat (mit Emotes), Subs, Bits und Raids von deinem
Twitch-Kanal in die App. TikTok und Twitch laufen dabei **getrennt**: Jedes
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
- Twitch-Zuschauer haben eigene IDs (`twitch:<nummer>`); Punkte und Spiele
  vermischen sich nicht mit TikTok-Zuschauern gleichen Namens.
- Das Piraten-Orakel und die Twitch-Piraten (Sub, Bits, Raid) sind im
  Herz-Alarm standardmäßig **aus** und nur in der Twitch-Vorlage an. Ein Sub
  von TikTok (Superfan-Abo) löst nie die Twitch-Sub-Animation aus.
- Erscheint „Bitte neu verbinden": Die Anmeldung ist abgelaufen (Twitch lässt
  sie nach etwa 30 Tagen ohne Nutzung verfallen). Einfach Schritt 2 wiederholen.
