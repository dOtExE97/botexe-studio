# bOtExE Studio — Stream-Deck-Plugin

Löst deine **Panel**-Knöpfe aus bOtExE Studio per Elgato-Stream-Deck-Taste aus
(Sound, Overlay-Alert, Glücksrad, Counter … — alles, was als Panel-Knopf existiert).

## Installation
1. bOtExE Studio starten. Unter **Einstellungen → Stream Deck** stehen **URL** + **Token**.
2. Den Ordner `de.botexe.studio.sdPlugin` ins Stream-Deck-Plugin-Verzeichnis kopieren:
   - **Windows:** `%appdata%\Elgato\StreamDeck\Plugins\`
   - **macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
   Stream-Deck-Software danach neu starten. (Alternativ: Ordner zu `…​.streamDeckPlugin`
   zippen und doppelklicken — installiert es automatisch.)
3. Im Stream Deck die Aktion **„bOtExE Studio → Panel-Aktion auslösen"** auf eine Taste ziehen.
4. Rechts im Property Inspector **URL** + **Token** eintragen, **„Liste laden"** klicken,
   den gewünschten **Panel-Knopf** wählen. Fertig — Taste drücken löst die Aktion aus.

## Wie es funktioniert
Die Taste schickt einen `POST` an `{URL}/api/panel/fire?token=…` mit der Knopf-ID.
Alles bleibt lokal (127.0.0.1), der Token ist über Neustarts stabil.

Icons neu erzeugen: `node streamdeck/gen-icons.mjs`
