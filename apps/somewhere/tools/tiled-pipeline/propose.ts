import {type TilesetImage} from './pixels.js';

export type TileComparison = {
  difference: number;
  isRecolour: boolean;
  isEmptyPair: boolean;
};

/* eslint-disable no-bitwise -- packing the 4 colour channels into one comparable integer needs
   real shifts and ORs */
function packColor(pixels: Uint8Array, index: number): number {
  return (
    ((pixels[index * 4] as number) << 24) |
    ((pixels[index * 4 + 1] as number) << 16) |
    ((pixels[index * 4 + 2] as number) << 8) |
    (pixels[index * 4 + 3] as number)
  );
}
/* eslint-enable no-bitwise */

// Difference over the UNION of the two masks, so a frame that grows or shrinks
// is not scored against the smaller one. A recolour applies a consistent
// substitution across the whole sprite; an animation frame differs in a
// spatially localized part of it, so a bijection over the shared mask is the
// discriminator that separates the two.
export function compareTiles(a: Uint8Array, b: Uint8Array): TileComparison {
  let union = 0;
  let differing = 0;
  let forward = new Map<number, number>();
  let backward = new Map<number, number>();
  let bijective = true;

  for (let index = 0; index < a.length / 4; index++) {
    let alphaA = a[index * 4 + 3] as number;
    let alphaB = b[index * 4 + 3] as number;

    if (alphaA === 0 && alphaB === 0) {
      continue;
    }

    union += 1;

    let colorA = packColor(a, index);
    let colorB = packColor(b, index);

    // An unchanged pixel is still evidence for the mapping: a colour that
    // stays itself here contradicts that same colour being substituted for
    // something else elsewhere, which is what separates a true recolour (one
    // consistent function over every occurrence of a colour) from a moving
    // localized patch built from only two colours (which would otherwise look
    // "bijective" purely by having no conflicting pixels among the few that
    // differ).
    if (colorA === colorB) {
      let mapped = forward.get(colorA);
      let reverse = backward.get(colorA);

      if (
        (mapped !== undefined && mapped !== colorA) ||
        (reverse !== undefined && reverse !== colorA)
      ) {
        bijective = false;
      }

      forward.set(colorA, colorA);
      backward.set(colorA, colorA);

      continue;
    }

    differing += 1;

    if (alphaA === 0 || alphaB === 0) {
      bijective = false;

      continue;
    }

    let mapped = forward.get(colorA);
    let reverse = backward.get(colorB);

    if (
      (mapped !== undefined && mapped !== colorB) ||
      (reverse !== undefined && reverse !== colorA)
    ) {
      bijective = false;
    }

    forward.set(colorA, colorB);
    backward.set(colorB, colorA);
  }

  return {
    difference: union === 0 ? 0 : differing / union,
    isRecolour: differing > 0 && bijective,
    isEmptyPair: union === 0,
  };
}

// Measured on the real atlas: adjacent fire frames share 0.53-0.95 of their
// quantized palette, while unrelated neighbours that happen to sit next to
// each other in the atlas share 0.00-0.01. The cut sits far from both sides.
const MINIMUM_PALETTE_OVERLAP = 0.3;
// Measured on the real atlas: slices of one wide drawing (tent roofs, building
// walls) join at 0.75-1.0, real animation strips at 0.00-0.44 (frames are
// standalone sprites, so nothing lines up across the tile boundary).
const MAXIMUM_SEAM_CONTINUITY = 0.7;
// Colour distance under which two seam pixels count as the same paint. Pixel
// art shades in steps well above this, so it tolerates antialiasing without
// merging distinct colours.
const SEAM_COLOR_TOLERANCE = 90;

// How much the last column of `a` reads as the drawing continued by the first
// column of `b`. Adjacent slices of one wide structure are cut from a single
// continuous picture, so the two columns hold the same paint; two frames of an
// animation are separate drawings of a sprite, so they do not line up. Rows
// transparent on both sides say nothing and are skipped; a seam with no
// opaque rows at all is scored 0, because two sprites that never touch their
// shared edge cannot be slices of one drawing.
function seamContinuity(
  a: Uint8Array,
  b: Uint8Array,
  tileWidth: number,
  tileHeight: number,
): number {
  let counted = 0;
  let continuous = 0;

  for (let y = 0; y < tileHeight; y++) {
    let indexA = (y * tileWidth + tileWidth - 1) * 4;
    let indexB = y * tileWidth * 4;
    let opaqueA = (a[indexA + 3] as number) > 0;
    let opaqueB = (b[indexB + 3] as number) > 0;

    if (!opaqueA && !opaqueB) {
      continue;
    }

    counted += 1;

    if (
      opaqueA &&
      opaqueB &&
      Math.abs((a[indexA] as number) - (b[indexB] as number)) +
        Math.abs((a[indexA + 1] as number) - (b[indexB + 1] as number)) +
        Math.abs((a[indexA + 2] as number) - (b[indexB + 2] as number)) <
        SEAM_COLOR_TOLERANCE
    ) {
      continuous += 1;
    }
  }

  return counted === 0 ? 0 : continuous / counted;
}

// Histogram intersection over opaque pixels, with channels quantized to
// 32 levels so shading and dithering count as the same colour. Frames of one
// sprite repaint the same material and keep their palette; two different
// sprites that happen to be neighbours in the atlas do not.
function paletteOverlap(a: Uint8Array, b: Uint8Array): number {
  let histogram = (pixels: Uint8Array) => {
    let counts = new Map<number, number>();
    let total = 0;

    for (let index = 0; index < pixels.length / 4; index++) {
      if ((pixels[index * 4 + 3] as number) === 0) {
        continue;
      }

      /* eslint-disable no-bitwise -- quantizing three channels into one map key needs shifts */
      let key =
        (((pixels[index * 4] as number) >> 3) << 10) |
        (((pixels[index * 4 + 1] as number) >> 3) << 5) |
        ((pixels[index * 4 + 2] as number) >> 3);
      /* eslint-enable no-bitwise */

      counts.set(key, (counts.get(key) ?? 0) + 1);
      total += 1;
    }

    return {counts, total};
  };
  let histogramA = histogram(a);
  let histogramB = histogram(b);

  if (histogramA.total === 0 || histogramB.total === 0) {
    return 0;
  }

  let overlap = 0;

  for (let [key, count] of histogramA.counts) {
    overlap += Math.min(
      count / histogramA.total,
      (histogramB.counts.get(key) ?? 0) / histogramB.total,
    );
  }

  return overlap;
}

export function proposeAnimationRegions({
  image,
  minimumFrameDifference,
  minimumFrames = 3,
}: {
  image: TilesetImage;
  minimumFrameDifference: number;
  minimumFrames?: number;
}): Array<{start: number; frames: number; duration: number}> {
  let proposals: Array<{start: number; frames: number; duration: number}> = [];
  let runStart = 0;
  let runLength = 1;
  let flush = () => {
    // The exact-0 rejection below reads "pairwise" as adjacent pairs only, which
    // a run of three or more tiles outgrows: it can walk away from a tile and
    // come straight back to it. A run whose last image is the same picture as
    // its first is a variant block scanned in raster order, walking into a
    // variant and back out of it, not a frame strip; so it is the same
    // "duplicate tiles rather than frames" case, measured across the span's two
    // ends instead of between neighbours.
    //
    // Only the closing frame is compared, not every pair in the run.
    // buildAnimationFrames emits region.start + index, so a region is a
    // contiguous span and cannot reference a tile id twice the way a Tiled frame
    // list can. Baking the reversed frames into consecutive tiles is therefore
    // the only way to author a ping-pong for this tool, and rejecting every
    // repeat would reject precisely that layout. The cost of what is left: a
    // strip genuinely authored to end on its own first frame is refused, and has
    // to be written into the config by hand.
    if (
      runLength >= minimumFrames &&
      compareTiles(image.getTilePixels(runStart), image.getTilePixels(runStart + runLength - 1))
        .difference !== 0
    ) {
      // 150 ms is a placeholder: the detector cannot know timing from pixels.
      proposals.push({start: runStart, frames: runLength, duration: 150});
    }

    runLength = 1;
  };

  // A frame pair redraws one sprite in a new pose: most union pixels change
  // (fire measures 0.77-1.0 between adjacent frames) but the palette stays.
  // The false positives all fail one of the two gates: slices of one wide
  // drawing (tents 0.59, couch 0.44) and same-material variants (drawers
  // 0.46-0.67) differ too little, and unrelated atlas neighbours that differ
  // enough (potion vs fish, 1.0) share no palette. A similarity CEILING —
  // "frames are nearly identical" — has this backwards and can never see the
  // fire while admitting the furniture.
  for (let tileId = 1; tileId < image.tileCount; tileId++) {
    let previous = image.getTilePixels(tileId - 1);
    let current = image.getTilePixels(tileId);
    let comparison = compareTiles(previous, current);
    let continues =
      !comparison.isEmptyPair &&
      !comparison.isRecolour &&
      comparison.difference >= minimumFrameDifference &&
      comparison.difference > 0 &&
      paletteOverlap(previous, current) >= MINIMUM_PALETTE_OVERLAP &&
      seamContinuity(previous, current, image.tileWidth, image.tileHeight) <
        MAXIMUM_SEAM_CONTINUITY;

    if (continues) {
      runLength += 1;

      continue;
    }

    flush();
    runStart = tileId;
  }

  flush();

  return proposals;
}
