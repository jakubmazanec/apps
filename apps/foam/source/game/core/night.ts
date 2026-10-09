export type PlaceId =
  | 'hlavniNadrazi'
  | 'malinovskehoNamesti'
  | 'namestiRepubliky'
  | 'rotorBar'
  | 'train'
  | 'whiskyShop'
  | 'zidenice';

export type Way = 'taxi' | 'tram' | 'walk';

/** A roll of the dice: what came up, the odds it was held against, and whether it won. */
export type Roll = {value: number; odds: number; won: boolean};

export type Night = {
  /** Minutes since midnight; 19:40 is 1180. */
  minutes: number;

  /** Money, in Kč. Never below 0. */
  money: number;

  /** The place the player is in. */
  place: PlaceId;

  /** Set by a way out: the way the player picked, and the ways that way out offers. */
  leaving: {way: Way; ways: readonly Way[]} | null;

  /** The level of drunkenness, in drinks, as it stood at the minute `at`; see `getDrunkenness`. */
  drunkenness: {level: number; at: number};

  /** The last roll, or null before any. */
  roll: Roll | null;

  /** The source of the dice: a number from 0 up to but not including 1. */
  random: () => number;
};

/** The drinks the body clears in an hour. */
export const DRINKS_PER_HOUR = 1;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

export function createNight(start: {
  place: PlaceId;
  minutes: number;
  money: number;
  drunkenness?: number;
}): Night {
  return {
    minutes: start.minutes,
    money: start.money,
    place: start.place,
    leaving: null,
    drunkenness: {level: start.drunkenness ?? 0, at: start.minutes},
    roll: null,
    random: Math.random,
  };
}

/** The level of drunkenness now: it falls with the clock and stops at 0. */
export function getDrunkenness(night: Night): number {
  return Math.max(
    0,
    night.drunkenness.level -
      ((night.minutes - night.drunkenness.at) / MINUTES_PER_HOUR) * DRINKS_PER_HOUR,
  );
}

export function addDrinks(night: Night, drinks: number): void {
  night.drunkenness = {level: getDrunkenness(night) + drinks, at: night.minutes};
}

export function roll(night: Night, odds: number): void {
  let value = night.random();

  night.roll = {value, odds, won: value < odds};
}

export function formatStatus(night: Night): string {
  // The second modulo keeps a time before midnight of the first day positive.
  let minutes = ((night.minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, '0');
  let rest = String(minutes % MINUTES_PER_HOUR).padStart(2, '0');

  return `${hours}:${rest}   ${night.money} Kč   ${getDrunkenness(night).toFixed(1)}`;
}
