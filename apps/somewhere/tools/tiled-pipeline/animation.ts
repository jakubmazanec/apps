import {type AnimationRegion} from './config.js';

export type AnimationFrame = {
  tileid: number;
  duration: number;
};

export function buildAnimationFrames(region: AnimationRegion): AnimationFrame[] {
  return Array.from({length: region.frames}, (unused, index) => ({
    tileid: region.start + index,
    duration: region.duration,
  }));
}

// Only the carrier animates in this engine, so a map cell placing a later frame
// renders static.
export function animatedTileIds(regions: AnimationRegion[]): Set<number> {
  return new Set(regions.map((region) => region.start));
}

export function validateAnimationRegions(regions: AnimationRegion[], tileCount: number): string[] {
  let messages: string[] = [];
  let claimed = new Map<number, number>();

  for (let region of regions) {
    let last = region.start + region.frames - 1;

    if (region.frames < 2) {
      messages.push(`Animation region at tile ${region.start} needs at least 2 frames!`);
    }

    if (!Number.isInteger(region.duration) || region.duration < 1) {
      messages.push(
        `Animation region at tile ${region.start} needs a positive integer duration, found ${region.duration}!`,
      );
    }

    if (region.start < 0 || last >= tileCount) {
      messages.push(
        `Animation region ${region.start}..${last} is out of range for a tileset of ${tileCount} tiles!`,
      );

      continue;
    }

    for (let tileId = region.start; tileId <= last; tileId++) {
      let owner = claimed.get(tileId);

      if (owner === undefined) {
        claimed.set(tileId, region.start);
      } else {
        messages.push(
          `Animation regions at tiles ${owner} and ${region.start} overlap on tile ${tileId}!`,
        );
      }
    }
  }

  return messages;
}
