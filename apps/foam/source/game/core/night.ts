export type PlaceId =
  | 'hlavniNadrazi'
  | 'malinovskehoNamesti'
  | 'namestiRepubliky'
  | 'rotorBar'
  | 'train'
  | 'whiskyShop'
  | 'zidenice';

export type Way = 'taxi' | 'tram' | 'walk';

export type Night = {
  /** Minutes since midnight; 19:40 is 1180. */
  minutes: number;

  /** Money, in Kč. */
  money: number;

  /** State of mind, shown as written. */
  stateOfMind: string;

  /** The place the player is in. */
  place: PlaceId;

  /** Set by a way out: the way the player picked, and the ways that way out offers. */
  leaving: {way: Way; ways: readonly Way[]} | null;
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

export function createNight(start: {place: PlaceId; minutes: number; money: number}): Night {
  return {
    minutes: start.minutes,
    money: start.money,
    stateOfMind: 'Sober',
    place: start.place,
    leaving: null,
  };
}

export function formatStatus(night: Night): string {
  // The second modulo keeps a time before midnight of the first day positive.
  let minutes = ((night.minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, '0');
  let rest = String(minutes % MINUTES_PER_HOUR).padStart(2, '0');

  return `${hours}:${rest}   ${night.money} Kč   ${night.stateOfMind}`;
}
