// useTwitchStatus — Twitch-Verbindungsstand für Einstellungen und Ampel.
//
// Gleiches Muster wie der TikTok-Status in useStudio.ts: erst den Push
// abonnieren, dann EINMAL den Ist-Stand holen. Kommt zwischen Abo und
// Antwort ein Push, gewinnt der (neuere) Push — sonst überschriebe die späte
// Pull-Antwort einen frischeren Stand. Nötig, weil Twitch beim App-Start
// schon verbindet, bevor dieses Fenster zuhört.
import { useEffect, useState } from 'react';
import type { TwitchUiStatus } from '../../main/services/twitch-steuerung';

const START: TwitchUiStatus = { status: 'aus', clientIdGesetzt: false, angemeldet: false, anmeldungLaeuft: false };

export function useTwitchStatus(): TwitchUiStatus {
  const [status, setStatus] = useState<TwitchUiStatus>(START);
  useEffect(() => {
    let gepusht = false;
    const weg = window.studio.onTwitchStatus?.((info) => {
      gepusht = true;
      setStatus(info);
    });
    void window.studio.twitchGetStatus?.()
      .then((info) => { if (!gepusht && info) setStatus(info); })
      .catch(() => { /* Hauptprozess noch nicht bereit — der Push kommt */ });
    return () => { weg?.(); };
  }, []);
  return status;
}
