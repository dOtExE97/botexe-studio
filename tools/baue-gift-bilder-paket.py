#!/usr/bin/env python3
"""Baut das Geschenk-Bilder-Paket: PNGs -> 128px WebP -> tar.gz.

Die Originale sind ~195x195 PNG mit 40-55 KB. Fuer ein Overlay-Widget reichen
128 Pixel; als WebP schrumpft das auf 4-6 KB (~89% kleiner). Aus 4,4 GB werden
so rund 25 MB — klein genug fuer einen einmaligen Download in der App.
"""
import io
import os
import sys
import tarfile
import zipfile
from PIL import Image

QUELLE = '/tmp/giftbuild/zips'
ZIEL = '/tmp/giftbuild/gift-images.tar.gz'
KANTE = 128
QUALITAET = 82

gesehen = {}
uebersprungen = 0

with tarfile.open(ZIEL, 'w:gz') as tar:
    for zipname in sorted(os.listdir(QUELLE)):
        if not zipname.endswith('.zip'):
            continue
        with zipfile.ZipFile(os.path.join(QUELLE, zipname)) as z:
            for eintrag in z.namelist():
                if not eintrag.lower().endswith('.png'):
                    continue
                basis = os.path.basename(eintrag)
                if not basis:
                    continue
                name = os.path.splitext(basis)[0] + '.webp'
                # Doppelte Namen ueber die 6 Teile hinweg: erster gewinnt.
                if name in gesehen:
                    uebersprungen += 1
                    continue
                try:
                    roh = z.read(eintrag)
                    im = Image.open(io.BytesIO(roh)).convert('RGBA')
                    im = im.resize((KANTE, KANTE), Image.LANCZOS)
                    puffer = io.BytesIO()
                    im.save(puffer, 'WEBP', quality=QUALITAET, method=6)
                    daten = puffer.getvalue()
                except Exception as e:            # noqa: BLE001
                    print(f'FEHLER {basis}: {e}', file=sys.stderr)
                    continue

                info = tarfile.TarInfo(name)
                info.size = len(daten)
                info.mtime = 0          # feste Zeit -> reproduzierbares Paket
                info.mode = 0o644
                tar.addfile(info, io.BytesIO(daten))
                gesehen[name] = len(daten)

                if len(gesehen) % 500 == 0:
                    print(f'  {len(gesehen)} Bilder ...', flush=True)

groesse = os.path.getsize(ZIEL)
print(f'\nFERTIG: {len(gesehen)} Bilder, {uebersprungen} Duplikate uebersprungen')
print(f'Paket: {ZIEL} = {groesse / 1048576:.1f} MB')

# ── Benutzung ────────────────────────────────────────────────────────────────
# 1. Quell-Archive (PNGs, benannt „NNNN_Name.png") nach /tmp/giftbuild/zips legen
# 2. python3 tools/baue-gift-bilder-paket.py
# 3. Ergebnis als Anhang an ein PRE-RELEASE haengen (NICHT als normale Version —
#    sonst haelt der Auto-Update-Dienst es fuer die neueste App-Version):
#      gh release create gift-images-v2 /tmp/giftbuild/gift-images.tar.gz --prerelease
# 4. PACK_URL in apps/desktop/src/main/services/gift-image-pack.ts nachziehen
#
# Die Bilder selbst gehoeren TikTok und liegen NIE im Repo — nur dieses Skript.
