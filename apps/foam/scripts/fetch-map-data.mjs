// Fetch Foam's map: the streets, railway, rivers, parks and tram lines around the places, from
// OpenStreetMap through Overpass, into source/game/content/data/map.json, in whole metres from an
// origin in the middle of the places. Nobody edits the file; the script writes it anew. The data
// is OpenStreetMap's; see source/game/content/data/README.md for the credit and the licence.
// Usage: node scripts/fetch-map-data.mjs

import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import {getMapPoint, getMapPosition} from '../source/game/core/getMapPoint.ts';
import {formatData, USER_AGENT} from './fill-travel-data.mjs';

/**
 * @typedef {import('../source/game/core/travel.ts').MapData} MapData
 * @typedef {import('../source/game/core/travel.ts').PlaceData} PlaceData
 * @typedef {import('../source/game/core/getMapPoint.ts').MapPoint} MapPoint
 * @typedef {{id: number; geometry?: Array<{lat: number; lon: number}>}} OverpassWay
 * @typedef {(query: string) => Promise<OverpassWay[]>} Request
 */

// Metres around the places' box; covers the widest map a supported screen shows.
export const MAP_MARGIN = 2000;
export const SIMPLIFY_METRES = 5; // under half an art pixel at the sharpest scale

/** @type {Array<{layer: 'minorStreets' | 'mainStreets' | 'railway' | 'rivers' | 'parks' | 'tramLines'; selector: string}>} */
export const LAYER_QUERIES = [
  {
    layer: 'minorStreets',
    selector: 'way[highway~"^(tertiary|residential|unclassified|pedestrian|living_street)$"]',
  },
  {layer: 'mainStreets', selector: 'way[highway~"^(motorway|trunk|primary|secondary)$"]'},
  {layer: 'railway', selector: 'way[railway=rail][!service]'},
  {layer: 'rivers', selector: 'way[waterway=river][!tunnel]'},
  {layer: 'parks', selector: 'way[leisure=park]'},
  {layer: 'tramLines', selector: 'way[railway=tram][!service]'},
];

const POSITION_DECIMALS = 100_000;
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const RETRY_PAUSE_SECONDS = 30;
const MAX_ATTEMPTS = 5;
const dataDir = fileURLToPath(new URL('../source/game/content/data/', import.meta.url));

/**
 * Metres from a point to a segment; a segment of length 0 measures to its point.
 * @param {MapPoint} point
 * @param {MapPoint} start
 * @param {MapPoint} end
 */
function getSegmentDistance(point, start, end) {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  let lengthSquared = dx * dx + dy * dy;
  let t =
    lengthSquared === 0 ? 0 : (
      Math.max(
        0,
        Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
      )
    );

  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Douglas–Peucker: no dropped point lies more than `tolerance` from the result; both ends stay.
 * @param {MapPoint[]} points
 * @param {number} tolerance
 * @returns {MapPoint[]}
 */
function simplify(points, tolerance) {
  let keep = points.map((_, index) => index === 0 || index === points.length - 1);
  let ranges = [[0, points.length - 1]];

  for (let range = ranges.pop(); range !== undefined; range = ranges.pop()) {
    let [first, last] = range;
    let farthest = -1;
    let farthestDistance = tolerance;

    for (let index = first + 1; index < last; index += 1) {
      let distance = getSegmentDistance(points[index], points[first], points[last]);

      if (distance > farthestDistance) {
        farthest = index;
        farthestDistance = distance;
      }
    }

    if (farthest !== -1) {
      keep[farthest] = true;
      ranges.push([first, farthest], [farthest, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

/**
 * A way as a flat list of whole metres, or undefined when nothing of a line is left.
 * @param {OverpassWay} way
 * @param {MapData['origin']} origin
 * @param {boolean} isPark
 */
function getLine(way, origin, isPark) {
  let geometry = way.geometry ?? [];
  let first = geometry[0];
  let last = geometry.at(-1);

  if (
    isPark &&
    (first === undefined || last === undefined || first.lat !== last.lat || first.lon !== last.lon)
  ) {
    return undefined;
  }

  let points = simplify(
    geometry.map(({lat, lon}) => getMapPoint({latitude: lat, longitude: lon}, origin)),
    SIMPLIFY_METRES,
  )
    .map(({x, y}) => ({x: Math.round(x), y: Math.round(y)}))
    .filter(
      ({x, y}, index, all) => index === 0 || x !== all[index - 1].x || y !== all[index - 1].y,
    );

  if (points.length < (isPark ? 4 : 2)) {
    return undefined;
  }

  return points.flatMap(({x, y}) => [x, y]);
}

/**
 * The map around the places, one request per layer.
 * @param {PlaceData} places
 * @param {Request} request
 * @returns {Promise<MapData>}
 */
export async function fetchMapData(places, request) {
  let positions = Object.values(places).flatMap((place) =>
    place.position === undefined ? [] : [place.position],
  );
  let latitudes = positions.map(({latitude}) => latitude);
  let longitudes = positions.map(({longitude}) => longitude);
  // Rounded first: the checker rounds from the stored origin, so every point is measured from it.
  let origin = {
    latitude:
      Math.round(((Math.min(...latitudes) + Math.max(...latitudes)) / 2) * POSITION_DECIMALS) /
      POSITION_DECIMALS,
    longitude:
      Math.round(((Math.min(...longitudes) + Math.max(...longitudes)) / 2) * POSITION_DECIMALS) /
      POSITION_DECIMALS,
  };
  let points = positions.map((position) => getMapPoint(position, origin));
  let xs = points.map(({x}) => Math.round(x));
  let ys = points.map(({y}) => Math.round(y));
  let box = {
    left: Math.min(...xs) - MAP_MARGIN,
    top: Math.min(...ys) - MAP_MARGIN,
    right: Math.max(...xs) + MAP_MARGIN,
    bottom: Math.max(...ys) + MAP_MARGIN,
  };
  let southWest = getMapPosition({x: box.left, y: box.bottom}, origin);
  let northEast = getMapPosition({x: box.right, y: box.top}, origin);
  let area = `(${[southWest.latitude, southWest.longitude, northEast.latitude, northEast.longitude]
    .map((degrees) => degrees.toFixed(5))
    .join(',')})`;
  let map = {
    origin,
    box,
    minorStreets: [],
    mainStreets: [],
    railway: [],
    rivers: [],
    parks: [],
    tramLines: [],
  };

  for (let {layer, selector} of LAYER_QUERIES) {
    let ways = await request(`[out:json][timeout:25];${selector}${area};out geom;`);

    map[layer] = ways
      .toSorted((a, b) => a.id - b.id)
      .map((way) => getLine(way, origin, layer === 'parks'))
      .filter((line) => line !== undefined);
  }

  return map;
}

/**
 * Posts one query to Overpass and returns the `elements` of the answer.
 * @param {string} query
 * @param {{fetch: typeof fetch; wait: (seconds: number) => Promise<void>}} environment
 * @returns {Promise<OverpassWay[]>}
 */
export async function sendOverpassQuery(query, {fetch: send, wait}) {
  for (let attempt = 1; ; attempt += 1) {
    let response = await send(OVERPASS, {
      method: 'POST',
      headers: {'User-Agent': USER_AGENT}, // the wiki asks every client to name itself
      body: new URLSearchParams({data: query}),
    });
    let text = await response.text();

    // 429 means no slot was free within 15 s, 504 that the server was too busy for the query's
    // declared size; the wiki says to pause 30 s before a new request.
    if ((response.status === 429 || response.status === 504) && attempt < MAX_ATTEMPTS) {
      await wait(RETRY_PAUSE_SECONDS);
    } else {
      // A busy Overpass server answers with an XML or HTML page, with any status; any other
      // error (400 for a bad query) would repeat, so it ends the run.
      if (!response.ok || !text.startsWith('{')) {
        throw new Error(`Overpass answered ${response.status}: ${text.slice(0, 80)}`);
      }

      let answer = JSON.parse(text);

      // Overpass reports a runtime error, such as a query timeout, in `remark` with status 200 and
      // the elements found so far; partial data must never be written.
      if (answer.remark !== undefined) {
        throw new Error(`Overpass remarked: ${answer.remark}`);
      }

      return answer.elements;
    }
  }
}

/** @type {Request} */
function realRequest(query) {
  return sendOverpassQuery(query, {
    fetch,
    wait: (seconds) =>
      new Promise((resolve) => {
        setTimeout(resolve, seconds * 1000);
      }),
  });
}

if (process.argv[1] === import.meta.filename) {
  try {
    let places = JSON.parse(await readFile(`${dataDir}places.json`, 'utf8'));
    let map = await fetchMapData(places, realRequest);
    let file = `${dataDir}map.json`;
    let text = await formatData(map, file);

    await writeFile(file, text);

    for (let {layer} of LAYER_QUERIES) {
      // eslint-disable-next-line no-console -- the script's report
      console.log(`${layer}: ${map[layer].length} lines`);
    }

    // eslint-disable-next-line no-console -- the script's report
    console.log(`map.json: ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`);
  } catch (error) {
    // eslint-disable-next-line no-console -- the script's report
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
