// Zero-dependency placeholder audio generator: writes mono 16-bit PCM WAV files
// into public/. These are throwaway sounds for the demo; replace with real CC0
// .ogg clips later (the loader parser accepts both .ogg and .wav — just change
// the bundle `sources` entries in source/game/game.ts).
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const SAMPLE_RATE = 44100;

function encodeWav(samples) {
  let dataLength = samples.length * 2;
  let buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // format = PCM
  buffer.writeUInt16LE(1, 22); // channels = mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < samples.length; i++) {
    let clamped = Math.max(-1, Math.min(1, samples[i]));

    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

// A single decaying sine "blip".
function blip({freq, ms, volume = 0.4}) {
  let count = Math.floor((SAMPLE_RATE * ms) / 1000);
  let samples = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    let t = i / SAMPLE_RATE;
    let envelope = Math.exp((-t * 3000) / ms); // fast exponential decay

    samples[i] = Math.sin(2 * Math.PI * freq * t) * envelope * volume;
  }

  return samples;
}

// A looping arpeggio built from a repeated note sequence (a placeholder track).
function loop({notes, noteMs, repeats}) {
  let chunks = [];

  for (let r = 0; r < repeats; r++) {
    for (let freq of notes) {
      chunks.push(blip({freq, ms: noteMs, volume: 0.25}));
    }
  }

  let total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let samples = new Float32Array(total);
  let offset = 0;

  for (let chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return samples;
}

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));
let files = {
  'ui-click.wav': blip({freq: 880, ms: 60}),
  'ui-key.wav': blip({freq: 660, ms: 40, volume: 0.3}),
  'ui-error.wav': blip({freq: 220, ms: 180, volume: 0.5}),
  'bump.wav': blip({freq: 140, ms: 120, volume: 0.6}),
  'menu-music.wav': loop({notes: [523, 659, 784, 659], noteMs: 220, repeats: 8}),
  'game-music.wav': loop({notes: [392, 523, 494, 587], noteMs: 180, repeats: 10}),
};

for (let [name, samples] of Object.entries(files)) {
  writeFileSync(publicDir + name, encodeWav(samples));
  // eslint-disable-next-line no-console -- one-shot generator script
  console.log(`wrote public/${name} (${(samples.length / SAMPLE_RATE).toFixed(2)}s)`);
}
