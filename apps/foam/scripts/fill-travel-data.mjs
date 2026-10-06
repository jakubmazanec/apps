// Fill Foam's travel data: the positions, nearest tram stops and opening hours of
// source/game/content/data/places.json, and the journeys of travel.json, from OpenStreetMap. A
// value that is already there is never changed, so a run on complete files changes nothing. A
// value it writes is marked "computed": true until the author has checked it. The servers' data is
// OpenStreetMap's; see source/game/content/data/README.md for the credit and the licence.
// Usage: node scripts/fill-travel-data.mjs

import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
// eslint-disable-next-line import/no-extraneous-dependencies -- a dev tool script, like the atlas
import prettier from 'prettier';

import {getExpectedJourneys} from '../source/game/core/getExpectedJourneys.ts';

/**
 * @typedef {import('../source/game/core/travel.ts').Position} Position
 * @typedef {import('../source/game/core/travel.ts').PlaceEntry} PlaceEntry
 * @typedef {import('../source/game/core/travel.ts').Journey} Journey
 * @typedef {{metres: number; seconds: number}} Route
 * @typedef {{address: string} | {station: string} | {tramStop: string}} PositionQuery
 * @typedef {{
 *   findPositions: (query: PositionQuery) => Promise<Position[]>;
 *   findTramStops: (position: Position) => Promise<{name: string; position: Position}[]>;
 *   findNamed: (
 *     name: string,
 *     position: Position,
 *   ) => Promise<{position: Position; openingHours?: string}[]>;
 *   route: (profile: 'car' | 'foot', from: Position, to: Position) => Promise<Route>;
 * }} Lookups
 */

// Stand-in values until the author tunes them.
export const TRAM_WAIT_MINUTES = 5;
export const TAXI_WAIT_MINUTES = 5;
export const TRAM_METRES_PER_MINUTE = 300;
export const WALK_METRES_PER_MINUTE = 80;
export const DETOUR = 1.3; // streets are longer than the straight line
export const TICKET_PRICE = 25; // Kč
export const TAXI_BASE_FARE = 60; // Kč
export const TAXI_PRICE_PER_KILOMETRE = 36; // Kč
export const OPENING_HOURS_RADIUS = 150; // metres
export const USER_AGENT = 'Foam travel data (https://github.com/jakubmazanec/apps)';

const EARTH_RADIUS = 6_371_000; // metres
const POSITION_DECIMALS = 100_000;
const BOX = '(49.10,16.45,49.30,16.75)'; // Brno
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const ROUTING = 'https://routing.openstreetmap.de';
const dataDir = fileURLToPath(new URL('../source/game/content/data/', import.meta.url));

/**
 * Metres along the earth's surface between two points (haversine).
 * @param {Position} from
 * @param {Position} to
 */
export function getDistance(from, to) {
  let toRadians = (degrees) => (degrees * Math.PI) / 180;
  let deltaLatitude = toRadians(to.latitude - from.latitude);
  let deltaLongitude = toRadians(to.longitude - from.longitude);
  let a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(a));
}

/** @param {Route} route */
export function getWalkJourney({seconds}) {
  return {minutes: Math.max(1, Math.round(seconds / 60))};
}

/** @param {Route} route */
export function getTaxiJourney({metres, seconds}) {
  let fare = TAXI_BASE_FARE + (TAXI_PRICE_PER_KILOMETRE * metres) / 1000;

  return {
    minutes: Math.max(1, Math.round(TAXI_WAIT_MINUTES + seconds / 60)),
    price: Math.round(fare / 10) * 10,
  };
}

/**
 * @param {number} walkMetres
 * @param {number} rideMetres
 */
export function getTramJourney(walkMetres, rideMetres) {
  let minutes =
    (walkMetres * DETOUR) / WALK_METRES_PER_MINUTE +
    TRAM_WAIT_MINUTES +
    (rideMetres * DETOUR) / TRAM_METRES_PER_MINUTE;

  return {minutes: Math.max(1, Math.round(minutes)), price: TICKET_PRICE};
}

/** @param {Position} position */
function roundPosition({latitude, longitude}) {
  return {
    latitude: Math.round(latitude * POSITION_DECIMALS) / POSITION_DECIMALS,
    longitude: Math.round(longitude * POSITION_DECIMALS) / POSITION_DECIMALS,
  };
}

/** @param {Position[]} points */
function getMean(points) {
  let sum = (/** @type {keyof Position} */ key) =>
    points.reduce((total, point) => total + point[key], 0);

  return roundPosition({
    latitude: sum('latitude') / points.length,
    longitude: sum('longitude') / points.length,
  });
}

/**
 * Works out what the data lacks, with `lookups` asking the servers one thing at a time. Returns
 * filled copies; the input stays as it was. `added` and `missing` name the values.
 * @param {{
 *   places: Readonly<Record<string, PlaceEntry>>;
 *   travel: Readonly<Record<string, Record<string, Record<string, Journey>>>>;
 *   lookups: Lookups;
 * }} data
 */
export async function fillTravelData({places, travel, lookups}) {
  let filledPlaces = /** @type {Record<string, PlaceEntry>} */ (structuredClone(places));
  let filledTravel = /** @type {Record<string, Record<string, Record<string, Journey>>>} */ (
    structuredClone(travel)
  );
  let added = /** @type {string[]} */ ([]);
  let missing = /** @type {string[]} */ ([]);
  /**
   * Asks, and turns a rejection or an empty answer into undefined.
   * @template T
   * @param {string} line
   * @param {() => Promise<T[]>} lookup
   * @returns {Promise<T[] | undefined>}
   */
  let ask = async (line, lookup) => {
    try {
      let answer = await lookup();

      if (answer !== undefined && answer.length !== 0) {
        return answer;
      }
    } catch {
      // The line goes to `missing` below.
    }

    missing.push(line);

    return undefined;
  };

  for (let [id, entry] of Object.entries(filledPlaces)) {
    if (entry.position === undefined) {
      let query =
        entry.address === undefined ?
          entry.station === undefined ?
            {tramStop: entry.tramStop ?? ''}
          : {station: entry.station}
        : {address: entry.address};
      let points = await ask(`places.json › ${id} › position`, async () =>
        lookups.findPositions(query),
      );

      if (points !== undefined) {
        entry.position = getMean(points);
        entry.computed = true;
        added.push(`places.json › ${id} › position`);
      }
    }

    if (
      entry.kind === 'place' &&
      entry.position !== undefined &&
      entry.nearestTramStop === undefined
    ) {
      let {position} = entry;
      let stops = await ask(`places.json › ${id} › nearestTramStop`, async () =>
        lookups.findTramStops(position),
      );

      if (stops !== undefined) {
        let [nearest] = stops.toSorted(
          (a, b) => getDistance(position, a.position) - getDistance(position, b.position),
        );

        entry.nearestTramStop = {
          name: nearest?.name ?? '',
          position: roundPosition(nearest?.position ?? position),
        };
        entry.computed = true;
        added.push(`places.json › ${id} › nearestTramStop`);
      }
    }

    if (
      entry.osmName !== undefined &&
      entry.position !== undefined &&
      entry.openingHours === undefined
    ) {
      let {osmName, position} = entry;
      let found = await ask(`places.json › ${id} › openingHours`, async () => {
        let things = await lookups.findNamed(osmName, position);

        return things
          .filter(
            (thing) =>
              thing.openingHours !== undefined &&
              getDistance(position, thing.position) <= OPENING_HOURS_RADIUS,
          )
          .toSorted(
            (a, b) => getDistance(position, a.position) - getDistance(position, b.position),
          );
      });

      if (found !== undefined) {
        entry.openingHours = found[0]?.openingHours;
        entry.computed = true;
        added.push(`places.json › ${id} › openingHours`);
      }
    }
  }

  for (let {from, way, to} of getExpectedJourneys(filledPlaces)) {
    if (filledTravel[from]?.[way]?.[to] === undefined) {
      let line = `travel.json › ${from} › ${way} › ${to}`;
      let start = filledPlaces[from];
      let end = filledPlaces[to];

      if (start === undefined || end === undefined) {
        throw new Error(`No entry for ${line}.`);
      }

      let journey;

      if (way === 'tram') {
        let stop = start.kind === 'stop' ? start : start.nearestTramStop;
        let canWalk = start.kind === 'stop' || start.position !== undefined;

        if (stop?.position !== undefined && end.position !== undefined && canWalk) {
          let walk = start.kind === 'stop' ? 0 : getDistance(start.position, stop.position);

          journey = getTramJourney(walk, getDistance(stop.position, end.position));
        }
      } else if (start.position !== undefined && end.position !== undefined) {
        let profile = way === 'walk' ? 'foot' : 'car';
        let routes = await ask(line, async () => [
          await lookups.route(profile, start.position, end.position),
        ]);

        if (routes !== undefined) {
          journey = way === 'walk' ? getWalkJourney(routes[0]) : getTaxiJourney(routes[0]);
        }
      }

      if (journey === undefined) {
        // A route lookup that failed has listed itself already.
        if (!missing.includes(line)) {
          missing.push(line);
        }
      } else {
        filledTravel[from] ??= {};
        filledTravel[from][way] ??= {};
        filledTravel[from][way][to] = {...journey, computed: true};
        added.push(line);
      }
    }
  }

  return {places: filledPlaces, travel: filledTravel, added, missing};
}

/**
 * The file's text in the form Prettier keeps: one line for each journey and position.
 * @param {unknown} data
 * @param {string} file
 */
export async function formatData(data, file) {
  return prettier.format(JSON.stringify(data), {
    ...(await prettier.resolveConfig(file)),
    filepath: file,
  });
}

/** @param {string} text */
function escapeQuery(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('"', String.raw`\"`);
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function fetchJson(url, options) {
  let response = await fetch(url, {
    ...options,
    headers: {...options?.headers, 'User-Agent': USER_AGENT},
  });
  let body = await response.text();

  // A busy Overpass server answers with an XML or HTML page, with any status.
  if (!response.ok || !body.startsWith('{')) {
    throw new Error(`${url} answered ${response.status}: ${body.slice(0, 80)}`);
  }

  return JSON.parse(body);
}

/** @param {string} query */
async function queryOverpass(query) {
  let body = new URLSearchParams({data: `[out:json][timeout:25];${query}out center tags;`});
  let {elements} = await fetchJson(OVERPASS, {method: 'POST', body});

  return elements.map((element) => ({
    position: {
      latitude: element.lat ?? element.center.lat,
      longitude: element.lon ?? element.center.lon,
    },
    tags: element.tags ?? {},
  }));
}

/** @type {Lookups} */
export const realLookups = {
  async findPositions(query) {
    let selector;

    if (query.address !== undefined) {
      let split = query.address.lastIndexOf(' ');
      let street = escapeQuery(query.address.slice(0, split));
      let streetNumber = escapeQuery(query.address.slice(split + 1));

      selector = `nwr["addr:street"="${street}"]["addr:streetnumber"="${streetNumber}"]`;
    } else if (query.station === undefined) {
      selector = `node[railway=tram_stop][name="${escapeQuery(query.tramStop)}"]`;
    } else {
      selector = `nwr[railway~"^(station|halt)$"][name="${escapeQuery(query.station)}"]`;
    }

    let found = await queryOverpass(`${selector}${BOX};`);

    return found.map(({position}) => position);
  },

  async findTramStops({latitude, longitude}) {
    let found = await queryOverpass(
      `node(around:1000,${latitude},${longitude})[railway=tram_stop];`,
    );

    return found
      .filter(({tags}) => tags.name !== undefined)
      .map(({position, tags}) => ({name: tags.name, position}));
  },

  async findNamed(name, {latitude, longitude}) {
    let found = await queryOverpass(
      `nwr(around:150,${latitude},${longitude})[name~"^${escapeQuery(name)}$",i];`,
    );

    return found.map(({position, tags}) => ({position, openingHours: tags.opening_hours}));
  },

  async route(profile, from, to) {
    let coordinates = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    let {routes} = await fetchJson(
      `${ROUTING}/routed-${profile}/route/v1/driving/${coordinates}?overview=false`,
    );

    return {metres: routes[0].distance, seconds: routes[0].duration};
  },
};

if (process.argv[1] === import.meta.filename) {
  let placesFile = `${dataDir}places.json`;
  let travelFile = `${dataDir}travel.json`;
  let places = JSON.parse(await readFile(placesFile, 'utf8'));
  let travel = JSON.parse(await readFile(travelFile, 'utf8'));
  let result = await fillTravelData({places, travel, lookups: realLookups});

  if (result.added.some((line) => line.startsWith('places.json'))) {
    await writeFile(placesFile, await formatData(result.places, placesFile));
  }

  if (result.added.some((line) => line.startsWith('travel.json'))) {
    await writeFile(travelFile, await formatData(result.travel, travelFile));
  }

  for (let line of result.added) {
    // eslint-disable-next-line no-console -- the script's report
    console.log(`Added ${line}`);
  }

  for (let line of result.missing) {
    // eslint-disable-next-line no-console -- the script's report
    console.error(`Missing ${line}`);
  }

  if (result.missing.length > 0) {
    process.exitCode = 1;
  }
}
