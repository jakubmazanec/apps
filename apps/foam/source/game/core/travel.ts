import {type Night, type PlaceId, type Way} from './night.js';
import {type Place} from './place.js';

export type Position = {latitude: number; longitude: number};

/** An entry of `places.json`. `kind` is a string so the JSON import fits; see the checker. */
export type PlaceEntry = {
  kind: string;
  address?: string;
  station?: string;
  tramStop?: string;
  osmName?: string;
  position?: Position;
  nearestTramStop?: {name: string; position: Position};
  openingHours?: string;
  computed?: boolean;
};

/** The content of `places.json`: its entries by place id. */
export type PlaceData = Readonly<Record<string, PlaceEntry>>;

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

export type Destination = {place: Place; way: Way; minutes: number; price: number};

export type NightStart = {
  /** The places of the night, by id. */
  places: Readonly<Record<string, Place>>;

  /** The content of `places.json`: the positions of the places. */
  placeData: PlaceData;

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

/** The destinations from a place by a way, nearest first, then by name. */
export function getDestinations(start: NightStart, from: PlaceId, way: Way): Destination[] {
  let journeys = start.travel[from]?.[way] ?? {};
  let destinations: Destination[] = [];

  for (let [to, journey] of Object.entries(journeys)) {
    let place = start.places[to];

    if (place === undefined) {
      console.warn(`No place "${to}" for the journey ${from} › ${way} › ${to}.`);
    } else {
      destinations.push({place, way, minutes: journey.minutes, price: journey.price ?? 0});
    }
  }

  return destinations.sort(
    (a, b) => a.minutes - b.minutes || a.place.name.localeCompare(b.place.name),
  );
}

/** Adds the journey's minutes, takes its price and sets the night's place. */
export function takeJourney(night: Night, destination: Destination): void {
  night.minutes += destination.minutes;
  night.money -= destination.price;
  night.place = destination.place.id;
}

/** "35 min", or "11 min  170 Kč" for a journey with a price. */
export function formatJourney(destination: Destination): string {
  let {minutes, price} = destination;

  return price > 0 ? `${minutes} min  ${price} Kč` : `${minutes} min`;
}
