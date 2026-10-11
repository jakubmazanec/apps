// Every colour of the game, as numbers the way Pixi takes them. The theme, the screens and
// scripts/generate-ui-atlas.mjs read it. `ground`, `shade`, `line` and `dim` are four strengths of
// one indigo; `shade` is too close to black for a border that stays visible under the CRT filter,
// so borders use `line`.
export const palette = {
  black: 0x000000,
  ground: 0x1f1a2d,
  shade: 0x2d2735,
  line: 0x463c5c,
  dim: 0x8479a0,
  white: 0xffffff,
  rose: 0xff1b64,
  // The pictures' inks. A picture's shader gets the whole palette, in this order.
  pink: 0xff6281,
  plum: 0x5e0960,
  magenta: 0xc20265,
  blue: 0x004cec,
  cyan: 0x00c9ff,
  mint: 0x00ffb3,
} as const;
