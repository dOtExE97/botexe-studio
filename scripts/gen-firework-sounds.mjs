// gen-firework-sounds.mjs — synthetisiert zwei Feuerwerk-Sounds als WAV:
//   botexe-pfeife.wav  — aufsteigendes Raketen-Pfeifen (Frequenz-Sweep + Vibrato)
//   botexe-boom.wav     — tiefer Explosions-Boom (Sub-Thump + gefiltertes Rauschen + Crackle)
// Mono, 44100 Hz, 16-bit PCM. Lauf: `node scripts/gen-firework-sounds.mjs`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'widget-kit', 'sounds');

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s < 0 ? s * 0x8000 : s * 0x7fff) | 0, 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('geschrieben:', name, `(${(n / SR).toFixed(2)}s)`);
}

// ── Pfeifen: Sinus-Sweep 520→1500 Hz, leichtes Vibrato, sanftes Ein-/Ausblenden.
function pfeife() {
  const dur = 0.85, n = (SR * dur) | 0, out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = 520 + (1500 - 520) * Math.pow(t, 1.3) + Math.sin(t * 38) * 22; // Sweep + Vibrato
    phase += (2 * Math.PI * f) / SR;
    const env = Math.min(1, t * 12) * Math.pow(1 - t, 0.6); // schneller Anstieg, weicher Abfall
    let s = Math.sin(phase) * 0.6 + Math.sin(phase * 2) * 0.12; // Grundton + Oberton
    out[i] = s * env * 0.5;
  }
  return out;
}

// ── Boom: Sub-Thump (~70 Hz, fallend) + gefiltertes Rauschen + knisternder Tail.
function boom() {
  const dur = 1.1, n = (SR * dur) | 0, out = new Float32Array(n);
  let lp = 0; // einfacher Tiefpass fürs Rauschen
  let seed = 1337;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Sub-Bass-Thump: Frequenz fällt von 90 auf 45 Hz, exponentieller Abfall.
    const f = 90 - 45 * t;
    ph += (2 * Math.PI * f) / SR;
    const thump = Math.sin(ph) * Math.exp(-t * 6) * 0.8;
    // Knall-Rauschen, tiefpassgefiltert, schnell abklingend.
    const noise = rnd();
    lp += (noise - lp) * 0.22;
    const crack = lp * Math.exp(-t * 9) * 0.5;
    // Knister-Tail (sporadische Funken-Pops).
    const sparkle = (rnd() > 0.985 ? rnd() : 0) * Math.exp(-t * 2.5) * 0.35;
    out[i] = thump + crack + sparkle;
  }
  // weicher Ausklang
  for (let i = n - 600; i < n; i++) out[i] *= (n - i) / 600;
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
writeWav('botexe-pfeife.wav', pfeife());
writeWav('botexe-boom.wav', boom());
