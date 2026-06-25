// tikfinity-decrypt.ts — entschlüsselt eine TikFinity-`.tfc`-Settings-Datei
// (eigene Daten des Nutzers, für den Import). Das Format ist doppelt
// AES-verschlüsselt (CryptoJS) mit einem getarnten Base64-Alphabet als
// Zwischenschicht und einem modifizierten MD5 (`shash`) zur Key-Ableitung.
// Reverse-engineert + portiert; rein lokal, keine Netz-/Secret-Weitergabe.
import CryptoJS from 'crypto-js';

const LAYER1_PW = 'lolsurghwi378ukasfjsdf_s';

/** Modifizierte MD5 ("shash"): eigene Init-Konstanten, krumme Rotation (i%4)+4,
 *  Input wird mit einem Suffix base64-kodiert. Liefert 32-stelligen Hex-Key. */
function shash(input: string, encVersion: number): string {
  const hashValues: [number, number, number, number] = [305419896, 2595938032, 4275878552, 2271363873];
  let s = input;
  if (encVersion === 2) s = Buffer.from(input + 'Mozilla').toString('base64');
  else if (encVersion === 3) s = Buffer.from(input + 'dfgkjoi3kdjkfe').toString('base64');
  hashValues[3] = 2271560481;
  hashValues[1] = 2596069104;
  const rotl = (x: number, c: number) => ((x << c) | (x >>> (32 - c))) >>> 0;

  let bytes = Array.from(Buffer.from(s, 'utf8'));
  const bitLen = bytes.length * 8;
  bytes.push(128);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const lenBuf = Buffer.alloc(8);
  lenBuf.writeUInt32LE(bitLen >>> 0, 0);
  bytes = bytes.concat(Array.from(lenBuf));
  const u8 = Uint8Array.from(bytes);

  for (let off = 0; off < u8.length; off += 64) {
    const block = u8.subarray(off, off + 64);
    const M = new Uint32Array(16);
    const dv = new DataView(block.buffer, block.byteOffset, 64);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(i * 4, true);
    let [a, b, c, d] = hashValues;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (i * 5 + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (i * 3 + 5) % 16; }
      else { f = c ^ (b | ~d); g = (i * 7) % 16; }
      f = f >>> 0;
      const K = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967295);
      const tmp = (a + f + (M[g] ?? 0) + K) >>> 0;
      const rotated = rotl(tmp, (i % 4) + 4);
      const newB = (b + rotated) >>> 0;
      a = d; d = c; c = b; b = newB;
    }
    hashValues[0] = ((hashValues[0] ?? 0) + a) >>> 0;
    hashValues[1] = ((hashValues[1] ?? 0) + b) >>> 0;
    hashValues[2] = ((hashValues[2] ?? 0) + c) >>> 0;
    hashValues[3] = ((hashValues[3] ?? 0) + d) >>> 0;
  }
  return hashValues.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

// Getarntes Base64-Alphabet (v3: U↔V, i↔j, r↔s vertauscht) → Standard zurück.
const CUSTOM = 'ABCDEFGHIJKLMNOPQRSTVUWXYZabcdefghjiklmnopqsrtuvwxyz0123456789+/=';
const STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function customToStd(b64: string): string {
  const map: Record<string, string> = {};
  for (let i = 0; i < CUSTOM.length; i++) map[CUSTOM[i] as string] = STD[i] as string;
  return b64.split('').map((ch) => map[ch] ?? ch).join('');
}

export interface TikfinityConfig {
  version?: string;
  sourceChannelId?: string;
  actions?: unknown[];
  dynamicSettings?: Record<string, unknown>;
}

/** Entschlüsselt den Inhalt einer `.tfc`-Datei → TikFinity-Config-Objekt.
 *  Wirft bei falschem Format/Fehler. */
export function decryptTfc(fileContent: string): TikfinityConfig {
  const data = fileContent.trim();
  // Layer 1
  const l1 = CryptoJS.AES.decrypt(data, LAYER1_PW).toString(CryptoJS.enc.Utf8);
  const parts = l1.split(':');
  if (parts.length < 3) throw new Error('Kein gültiges TikFinity-Profil (.tfc)');
  const version = parseInt((parts[0] ?? '').replace('v', ''), 10);
  const salt = Buffer.from(parts[1] ?? '', 'base64').toString('latin1');
  const payload = parts[2] ?? '';
  // Layer 2: Key aus salt ableiten, getarntes Base64 zurück, AES entschlüsseln
  const key = shash(salt, version);
  const std = version === 3 ? customToStd(payload) : payload;
  const inner = CryptoJS.AES.decrypt(std, key).toString(CryptoJS.enc.Utf8);
  if (!inner || inner.length < 5) throw new Error('Entschlüsselung fehlgeschlagen (Layer 2)');
  // Finale: b64RawData umkehren → base64 → uri-decode → JSON
  const obj = JSON.parse(inner) as { b64RawData?: string };
  if (!obj.b64RawData) throw new Error('Unerwartetes Format (kein b64RawData)');
  const finalJson = decodeURIComponent(Buffer.from(obj.b64RawData.split('').reverse().join(''), 'base64').toString('latin1'));
  return JSON.parse(finalJson) as TikfinityConfig;
}
