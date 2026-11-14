/* eslint-disable no-bitwise -- the lights are the bits of two words */
const PADS = 12;
const STEPS = 16;
const TRACKS = 4;
const FIRST_STEP_BIT = PADS;
const FIRST_TRACK_BIT = FIRST_STEP_BIT + STEPS;
const PADS_KEYS_BIT = FIRST_TRACK_BIT + TRACKS;

// The lights that the core stores after every step in two 32-bit words, `words` at its lights
// pointer: the low word, then the high one. The core stores the high word first, so loading the
// low word first gives one step's lights, or for one frame while a step stores, its low word with a
// later step's high word
export function loadLights(words: Uint32Array) {
  let low = Atomics.load(words, 0);

  return (BigInt(Atomics.load(words, 1)) << 32n) | BigInt(low);
}

// The lights as one number, one bit per light in the "Lights" table of the plan: pads 1–12, steps
// 1–16, T1–T4, then PADS/KEYS, ROLL, REC, PLAY and TEMPO
export function decodeLights(word: bigint) {
  let lit = (bit: number) => ((word >> BigInt(bit)) & 1n) === 1n;

  return {
    pads: Array.from({length: PADS}, (_, pad) => lit(pad)),
    steps: Array.from({length: STEPS}, (_, step) => lit(FIRST_STEP_BIT + step)),
    tracks: Array.from({length: TRACKS}, (_, track) => lit(FIRST_TRACK_BIT + track)),
    padsKeys: lit(PADS_KEYS_BIT),
    roll: lit(PADS_KEYS_BIT + 1),
    rec: lit(PADS_KEYS_BIT + 2),
    play: lit(PADS_KEYS_BIT + 3),
    tempo: lit(PADS_KEYS_BIT + 4),
  };
}
