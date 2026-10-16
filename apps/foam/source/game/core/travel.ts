import {formatCosts} from './formatCosts.js';
import {isOpenAt} from './hours.js';
import {type Location, type LocationId} from './location.js';
import {type Night, type PlaceId, type Way} from './night.js';
import {type Place} from './place.js';

export type Position = {latitude: number; longitude: number};

/**
 * An entry of `locations.json`. `hours` is `number[][]` so the JSON import fits; the checker holds
 * each span to a pair of the night.
 */
export type LocationEntry = {
  address?: string;
  station?: string;

  /** The stop's name in OpenStreetMap. A location with it is a tram stop. */
  tramStop?: string;
  osmName?: string;
  position?: Position;

  /** The spans in which it is open, in night minutes. Absent: it never closes. */
  hours?: number[][];
  computed?: boolean;
};

/** The content of `locations.json`: its entries by location id. */
export type LocationData = Readonly<Record<string, LocationEntry>>;

/** The content of `map.json`. */
export type MapData = {
  origin: Position;
  box: {left: number; top: number; right: number; bottom: number};
  minorStreets: number[][];
  mainStreets: number[][];
  railway: number[][];
  rivers: number[][];
  parks: number[][];
  tramLines: number[][];
};

export type Journey = {minutes: number; price?: number; computed?: boolean};
export type Travel = Readonly<
  Record<string, Partial<Record<Way, Readonly<Record<string, Journey>>>>>
>;

export type Destination = {location: Location; way: Way; minutes: number; price: number};

/** The way as the travel window's row and a logged travel name it. */
export const WAY_WORDS: Readonly<Record<Way, string>> = {walk: 'Walk', tram: 'Tram', taxi: 'Taxi'};

/** "Walk to Rotor Bar  12 min  25 Kč": the way, the destination and its numbers. */
export function formatTravel(destination: Destination): string {
  let costs = formatCosts(destination);
  let words = `${WAY_WORDS[destination.way]} to ${destination.location.name}`;

  return costs === '' ? words : `${words}  ${costs}`;
}

export type NightStart = {
  /** The locations of the night, by id. */
  locations: Readonly<Record<string, Location>>;

  /** The places of every location, by id; content/locations.ts derives them once. */
  places: Readonly<Record<string, Place>>;

  /** The content of `locations.json`: the positions and the hours of the locations. */
  locationData: LocationData;

  travel: Travel;

  /** The content of `map.json`. */
  map: MapData;

  /** The place a night starts in. */
  place: PlaceId;

  minutes: number;
  money: number;

  /** The level of drunkenness the night starts at, in drinks; 0 when absent. */
  drunkenness?: number;
};

/**
 * The location whose places hold the place. It searches start.locations, so a test that writes into
 * nightStart is seen.
 */
export function getLocation(start: NightStart, place: PlaceId): Location | undefined {
  return Object.values(start.locations).find((location) =>
    location.places.some(({id}) => id === place),
  );
}

/** The destinations from a location by a way, nearest first, then by name. */
export function getDestinations(start: NightStart, from: LocationId, way: Way): Destination[] {
  let journeys = start.travel[from]?.[way] ?? {};
  let destinations: Destination[] = [];

  for (let [to, journey] of Object.entries(journeys)) {
    let location = start.locations[to];

    if (location === undefined) {
      console.warn(`No location "${to}" for the journey ${from} › ${way} › ${to}.`);
    } else {
      destinations.push({location, way, minutes: journey.minutes, price: journey.price ?? 0});
    }
  }

  return destinations.sort(
    (a, b) => a.minutes - b.minutes || a.location.name.localeCompare(b.location.name),
  );
}

/** Adds the minutes, takes the price, and puts the player at the arrival or, closed, outside. */
export function takeJourney(start: NightStart, night: Night, destination: Destination): void {
  let {location, minutes, price} = destination;

  night.minutes += minutes;
  night.money -= price;
  night.place =
    (
      location.outside === undefined ||
      isOpenAt(start.locationData[location.id]?.hours, night.minutes)
    ) ?
      location.arrival
    : location.outside;
}
