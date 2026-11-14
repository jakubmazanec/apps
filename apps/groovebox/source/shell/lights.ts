/* eslint-disable no-bitwise -- the lights are the bits of one word */
const PADS = 12;
const STEPS = 16;
const TRACKS = 4;
const FIRST_STEP_BIT = PADS;
const FIRST_TRACK_BIT = FIRST_STEP_BIT + STEPS;
const PADS_KEYS_BIT = FIRST_TRACK_BIT + TRACKS;

// The lights word that the core stores after every step, one bit per light in the "Lights" table
// of the plan: pads 1–12, steps 1–16, T1–T4, then PADS/KEYS, ROLL, REC, PLAY and TEMPO
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
