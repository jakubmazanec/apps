import {PICTURE_STEPS_PER_SECOND} from './getPictureStep.js';
import {palette} from './palette.js';

export type PictureShaderSource = {
  vertex: string;
  fragment: string;
};

// Both stages ask for high precision of decimal and whole numbers, so that the
// hash gives the same result on every device.
const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;
// The mesh is a rectangle of the picture's size in art pixels. vPosition is the
// position in art pixels, y down; the fragment shader takes the pixel from it,
// so a render target's flip cannot move the picture.
const VERTEX = `${HEADER}
in vec2 aPosition;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

out vec2 vPosition;

void main() {
  mat3 matrix = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;

  gl_Position = vec4((matrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPosition = aPosition;
}
`;
const inkNames = Object.keys(palette);
// One constant per colour of the palette, in the order of palette.ts, which is
// the order of uPalette.
const INK_DECLARATIONS = [
  `const int PALETTE_SIZE = ${inkNames.length};`,
  ...inkNames.map((name, index) => `const int INK_${name.toUpperCase()} = ${index};`),
].join('\n');
// The code every picture shares. A place's GLSL comes after it and defines
// `vec3 picture(ivec2 pixel, vec2 point, float t)`.
const SHARED = `
${INK_DECLARATIONS}

uniform vec2 uSize;
uniform int uStep;
uniform vec3 uPalette[PALETTE_SIZE];

in vec2 vPosition;

out vec4 finalColor;

// A ladder is three inks: lo, hi and top.
struct Ladder {
  int lo;
  int hi;
  int top;
};

const Ladder WARM = Ladder(INK_MAGENTA, INK_ROSE, INK_PINK);
const Ladder DEEP = Ladder(INK_PLUM, INK_MAGENTA, INK_ROSE);
const Ladder LIGHT = Ladder(INK_BLUE, INK_CYAN, INK_MINT);

// The seed of the hash that roughens the border between two tones.
const int TONE_SEED = 7919;

// The art pixel being drawn. main sets it before it calls picture.
ivec2 currentPixel;

vec3 ink(int index) {
  return uPalette[index];
}

uint mixBits(uint value) {
  value ^= value >> 16u;
  value *= 0x7feb352du;
  value ^= value >> 15u;
  value *= 0x846ca68bu;
  value ^= value >> 16u;

  return value;
}

// A number in [0, 1) for a cell and a seed, from whole-number arithmetic only,
// so that it is the same on every device. The cell and the seed are mixed in
// one round, because a software renderer, as in the tests, pays for every
// round on every pixel.
float hash(ivec2 cell, int seed) {
  uint value = mixBits(
    uint(cell.x) * 0x8da6b343u + uint(cell.y) * 0xd8163841u + uint(seed) * 0xcb1ab31fu
  );

  return float(value >> 8u) / 16777216.0;
}

// Smooth value noise in [0, 1), with cells of cellSize pixels.
float noise(vec2 position, vec2 cellSize, int seed) {
  vec2 scaled = position / cellSize;
  vec2 cell = floor(scaled);
  vec2 fraction = scaled - cell;
  vec2 smoothed = fraction * fraction * (3.0 - 2.0 * fraction);
  ivec2 corner = ivec2(cell);
  float topLeft = hash(corner, seed);
  float topRight = hash(corner + ivec2(1, 0), seed);
  float bottomLeft = hash(corner + ivec2(0, 1), seed);
  float bottomRight = hash(corner + ivec2(1, 1), seed);

  return mix(mix(topLeft, topRight, smoothed.x), mix(bottomLeft, bottomRight, smoothed.x), smoothed.y);
}

// A ladder has seven tones: black, black with lo, lo, lo with hi, hi, hi with
// top, top. A tone of two inks is a checkerboard that is fixed to the screen:
// the pixel's own x + y decides which of the two it gets, the lower ink on an
// even sum. jitter roughens the border between two tones by a fixed amount per
// pixel. Tone 0 leaves the pixel as it is, so black stays black and shapes can
// overlap.
vec3 tone(vec3 below, float intensity, Ladder ladder, float jitter) {
  float level = floor(
    clamp(intensity, 0.0, 0.999) * 7.0 + jitter * (hash(currentPixel, TONE_SEED) - 0.5)
  );
  int index = int(clamp(level, 0.0, 6.0));

  if (index == 0) {
    return below;
  }

  // The rungs of the ladder are black, lo, hi and top. A tone's lower ink is
  // rung index / 2 and its upper ink rung (index + 1) / 2. The palette is
  // looked up once, not in a branch per tone, because a software renderer, as
  // in the tests, runs every branch on every pixel.
  bool isUpper = ((currentPixel.x + currentPixel.y) & 1) == 1;
  int rung = isUpper ? (index + 1) / 2 : index / 2;

  return ink(rung == 0 ? INK_BLACK : rung == 1 ? ladder.lo : rung == 2 ? ladder.hi : ladder.top);
}

// The brightness of a round light at a distance from its centre.
float glow(float d, float r) {
  return 1.0 / (1.0 + (d * d) / (r * r));
}

// The screen pixel of a point of the design of 480 × 270.
ivec2 toScreen(vec2 design) {
  return ivec2(floor(design * uSize / vec2(480.0, 270.0)));
}
`;
const MAIN = `
void main() {
  ivec2 pixel = ivec2(floor(vPosition));
  vec2 point = (vec2(pixel) + 0.5) * vec2(480.0, 270.0) / uSize;
  float t = float(uStep) / ${PICTURE_STEPS_PER_SECOND.toFixed(1)};

  currentPixel = pixel;
  finalColor = vec4(picture(pixel, point, t), 1.0);
}
`;

/** Returns the vertex and fragment source of the shader that draws a place's picture. */
export function createPictureShaderSource(picture: string): PictureShaderSource {
  return {
    vertex: VERTEX,
    fragment: `${HEADER}${SHARED}\n${picture}\n${MAIN}`,
  };
}
