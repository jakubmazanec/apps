import {type Map} from '../../engine/tiled/Map.js';

/**
 * The camera clamp shared by cameraSystem (every frame) and the travel flush
 * (presetting the camera before the first frame in a new map). Snaps to whole
 * device px, then clamps to the map bounds; a map smaller than the viewport
 * pins to the map origin.
 */
export function getClampedCameraPosition({
  map,
  playerX,
  playerY,
  viewportWidth,
  viewportHeight,
  pixelScale,
}: {
  map: Map;
  pixelScale: number;
  playerX: number;
  playerY: number;
  viewportHeight: number;
  viewportWidth: number;
}): {x: number; y: number} {
  // Snap to whole device px (1/pixelScale art px), not whole art px — art-px
  // snapping would make scrolling visibly steppier at scale > 1 than
  // 1-device-px granularity.
  let x = Math.floor((playerX - viewportWidth / 2) * pixelScale) / pixelScale;
  let y = Math.floor((playerY - viewportHeight / 2) * pixelScale) / pixelScale;

  return {
    x: Math.max(map.position.x, Math.min(map.position.x + map.width - viewportWidth, x)),
    y: Math.max(map.position.y, Math.min(map.position.y + map.height - viewportHeight, y)),
  };
}
