// Generates placeholder dialogue art at 1 art px:
//   public/portraits.png + portraits.json  - one 32x32 'mira' frame
//   public/npc.png + npc.json              - one 16x20 frame under all eight
//                                            clip names (the spark-sheet
//                                            workaround until T1.3)
//   public/prompt-bubble.png + prompt-bubble.json - one 8x8 'bubble' frame
// Hand-authored art can overwrite the same files later; no code changes.
//
// Idempotent — re-running overwrites the files with identical bytes.
// Usage: node scripts/generate-dialogue-assets.mjs
import {encode} from 'fast-png';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const CHANNELS = 4; // RGBA

let publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const palette = {
  outline: [34, 32, 52, 255],
  skin: [238, 195, 154, 255],
  hair: [102, 57, 49, 255],
  shirt: [63, 118, 86, 255],
  bubble: [233, 234, 238, 255],
};

function createImage(width, height) {
  return {width, height, data: new Uint8Array(width * height * CHANNELS)};
}

function fillRect(image, x, y, width, height, color) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      image.data.set(color, (row * image.width + col) * CHANNELS);
    }
  }
}

function writeSheet(name, image, json) {
  writeFileSync(join(publicDir, `${name}.png`), encode({...image, channels: CHANNELS}));
  writeFileSync(join(publicDir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
  // eslint-disable-next-line no-console -- one-shot generator script feedback
  console.log(`wrote public/${name}.png (${image.width}x${image.height}) and public/${name}.json`);
}

// Portrait: a framed bust, enough to read as a face at 32x32.
let portrait = createImage(32, 32);

fillRect(portrait, 0, 0, 32, 32, palette.outline);
fillRect(portrait, 1, 1, 30, 30, palette.shirt);
fillRect(portrait, 6, 4, 20, 10, palette.hair);
fillRect(portrait, 8, 10, 16, 14, palette.skin);
fillRect(portrait, 12, 16, 2, 2, palette.outline);
fillRect(portrait, 18, 16, 2, 2, palette.outline);
fillRect(portrait, 13, 21, 6, 1, palette.outline);

writeSheet('portraits', portrait, {
  frames: {mira: {frame: {x: 0, y: 0, w: 32, h: 32}}},
  meta: {image: 'portraits.png'},
});

// NPC: a 16x20 villager silhouette, character-sheet footprint.
let npc = createImage(16, 20);

fillRect(npc, 4, 0, 8, 4, palette.hair);
fillRect(npc, 4, 4, 8, 6, palette.skin);
fillRect(npc, 5, 6, 2, 1, palette.outline);
fillRect(npc, 9, 6, 2, 1, palette.outline);
fillRect(npc, 3, 10, 10, 8, palette.shirt);
fillRect(npc, 5, 18, 2, 2, palette.outline);
fillRect(npc, 9, 18, 2, 2, palette.outline);

let npcSpriteNames = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

writeSheet('npc', npc, {
  frames: {1: {frame: {x: 0, y: 0, w: 16, h: 20}}},
  meta: {image: 'npc.png'},
  animations: Object.fromEntries(npcSpriteNames.map((name) => [name, ['1']])),
});

// Prompt bubble: an 8x8 speech bubble with a tail and a dot.
let bubble = createImage(8, 8);

fillRect(bubble, 0, 0, 8, 6, palette.outline);
fillRect(bubble, 1, 1, 6, 4, palette.bubble);
fillRect(bubble, 3, 2, 2, 2, palette.outline);
fillRect(bubble, 3, 6, 2, 1, palette.outline);

writeSheet('prompt-bubble', bubble, {
  frames: {bubble: {frame: {x: 0, y: 0, w: 8, h: 8}}},
  meta: {image: 'prompt-bubble.png'},
});
