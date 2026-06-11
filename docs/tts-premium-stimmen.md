# Premium- & KI-Stimmen einrichten (BYOK)

bOtExE Studio bringt von Haus aus 30 Gratis-Stimmen mit (Edge, Piper lokal, Google-Robo).
Wer mehr will, trägt auf der **Stimme**-Seite unter „Premium- & KI-Stimmen" seinen eigenen
Zugang ein. Jeder Dienst rechnet über den eigenen Account ab — die Keys bleiben lokal.

## TTS.Monster (die Twitch-KI-Stimmen, gratis)
1. Auf [tts.monster](https://tts.monster) mit Twitch/Google anmelden
2. Dashboard → „API" → Key kopieren
3. In bOtExE: TTS.Monster aufklappen → Key einfügen → Speichern
- Free-Tier: 300 Nachrichten/Monat, 100+ Stimmen

## Amazon Polly (inkl. „Brian" — der Twitch-Klassiker)
1. AWS-Account anlegen ([aws.amazon.com](https://aws.amazon.com)) — **Kreditkarte nötig**, 12 Monate gratis 1 Mio. Zeichen/Monat
2. IAM → neuer User mit Policy `AmazonPollyReadOnlyAccess`
3. Access-Key + Secret erstellen
4. In bOtExE: Access Key ID + Secret + Region (z.B. `eu-central-1`) eintragen
- Brian ist `VoiceId: Brian` — steht direkt im Dropdown

## ElevenLabs (beste KI-Qualität)
1. Auf [elevenlabs.io](https://elevenlabs.io) registrieren (Free-Tier ~10.000 Zeichen/Monat)
2. Profil → „API Keys" → Key erstellen
3. In bOtExE: Key einfügen

## OpenAI-kompatibel (lokale KI / eigener Server — Dev)
Für selbstgehostete Stimmen wie **XTTS via [openedai-speech](https://github.com/matatonic/openedai-speech)**,
LocalAI oder OpenAI selbst.
1. Server starten (z.B. openedai-speech per Docker auf Port 8000)
2. In bOtExE: Basis-URL eintragen (`http://127.0.0.1:8000/v1`), Key nur falls der Server einen verlangt
- Spricht den Standard-Endpoint `POST /v1/audio/speech` — funktioniert mit allen OpenAI-kompatiblen TTS-Servern

## Hinweis zu Stimmen, die wir NICHT anbinden
- **StreamElements-Brian-Endpoint**: seit Kurzem dicht (liefert 401) — nutze stattdessen Polly für echtes Brian
- **TikTok-Video-Stimmen**: brauchen eine eingeloggte Session (Login-Umgehung) — bewusst nicht angebunden
