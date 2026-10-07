// Imports nothing, not even a type: scripts/fetch-map-data.mjs reads this file in Node.

/** Metres from the map's origin: x to the east, y to the south. */
export type MapPoint = {x: number; y: number};

const METRES_PER_DEGREE_OF_LATITUDE = 111_132;
const METRES_PER_DEGREE_AT_EQUATOR = 111_320;

/** A latitude and longitude as metres from `origin`: x to the east, y to the south. */
export function getMapPoint(
  position: {latitude: number; longitude: number},
  origin: {latitude: number; longitude: number},
): MapPoint {
  return {
    x:
      (position.longitude - origin.longitude) *
      METRES_PER_DEGREE_AT_EQUATOR *
      Math.cos((origin.latitude * Math.PI) / 180),
    y: (origin.latitude - position.latitude) * METRES_PER_DEGREE_OF_LATITUDE,
  };
}

/** Metres from `origin` as a latitude and longitude: the inverse of `getMapPoint`. */
export function getMapPosition(
  point: MapPoint,
  origin: {latitude: number; longitude: number},
): {latitude: number; longitude: number} {
  return {
    latitude: origin.latitude - point.y / METRES_PER_DEGREE_OF_LATITUDE,
    longitude:
      origin.longitude +
      point.x / (METRES_PER_DEGREE_AT_EQUATOR * Math.cos((origin.latitude * Math.PI) / 180)),
  };
}
