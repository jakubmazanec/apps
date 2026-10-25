import {hash} from './hash.js';
import {formatTime} from './hours.js';
import {type LogEntry, logStory} from './log.js';
import {type Collection} from './stories.js';

export type PlaceId =
  | 'hlavniNadraziForecourt'
  | 'hlavniNadraziHall'
  | 'malinovskehoNamesti'
  | 'namestiRepubliky'
  | 'rotorBarRoom'
  | 'rotorBarStreet'
  | 'train'
  | 'whiskyShopRoom'
  | 'whiskyShopStreet'
  | 'zidenice';

export type Way = 'taxi' | 'tram' | 'walk';

/** A roll of the dice: what came up, the odds it was held against, and whether it won. */
export type Roll = {value: number; odds: number; won: boolean};

export type Quest = {
  /** The bottle for the birthday is in the bag. */
  hasBottle: boolean;

  /** The bottle was handed over at the birthday. */
  bottleGiven: boolean;

  /** The friend gave the player the keys. */
  hasKeys: boolean;

  /** A ticket for the morning train is in the pocket. */
  hasTicket: boolean;
};

export type MoneyRange = {min: number; max: number; step: number};

export type Night = {
  /** The whole number that stands for the night: `random` is a hash of it. */
  seed: number;

  /** The dice rolled so far; the key of the next roll. */
  rolls: number;

  /**
   * A number from 0 up to 1 for the seed and the keys, the same every time: content reads what
   * varies by the night with a fixed key, `night.random('money')`, and `roll` reads the dice with
   * `'roll'` and the count. The checker and the tests replace it with a function that returns a
   * fixed value.
   */
  random: (...keys: Array<number | string>) => number;

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

  /**
   * Every text read and every choice taken, with its time; the story window and the night screen
   * write it.
   */
  log: LogEntry[];

  /**
   * The player's collection; shared by every night of the player, read and written by the
   * helpers.
   */
  collection: Collection;

  /** The stories this night achieved, with the clock, in the order found. */
  stories: Array<{title: string; minutes: number}>;

  /** What the night has done about its three threads; content writes it in effects. */
  quest: Quest;
};

/** The drinks the body clears in an hour. */
export const DRINKS_PER_HOUR = 1;

const MINUTES_PER_HOUR = 60;

export function createNight(
  {
    seed,
    ...start
  }: {
    seed: number;
    place: PlaceId;
    minutes: number;
    money: MoneyRange | number;
    drunkenness?: number;
    quest?: Partial<Quest>;
  },
  collection?: Collection,
): Night {
  let random: Night['random'] = (...keys) => hash(seed, ...keys);

  return {
    seed,
    rolls: 0,
    random,
    minutes: start.minutes,
    // The count of steps is floored, so a step that does not divide the range never draws past max.
    money:
      typeof start.money === 'number' ?
        start.money
      : start.money.min +
        start.money.step *
          Math.floor(
            random('money') *
              (Math.floor((start.money.max - start.money.min) / start.money.step) + 1),
          ),
    place: start.place,
    leaving: null,
    drunkenness: {level: start.drunkenness ?? 0, at: start.minutes},
    roll: null,
    log: [],
    collection: collection ?? {titles: []},
    stories: [],
    quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false, ...start.quest},
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
  let value = night.random('roll', night.rolls);

  night.rolls += 1;
  night.roll = {value, odds, won: value < odds};
}

function readTitle(title: string[] | string): string {
  if (typeof title !== 'string') {
    throw new Error("A story's title has several pages!");
  }

  return title;
}

/**
 * Records the story, once across all runs: a title already in the collection does nothing. The
 * title is a one-page text, as `standIn` writes it; a text of several pages throws.
 */
export function findStory(night: Night, title: string[] | string): void {
  let text = readTitle(title);

  if (night.collection.titles.includes(text)) {
    return;
  }

  night.collection.titles.push(text);
  night.stories.push({title: text, minutes: night.minutes});
  logStory(night, text);
}

/** Whether the story is in the collection, from this night or an earlier one. */
export function hasStory(night: Night, title: string[] | string): boolean {
  return night.collection.titles.includes(readTitle(title));
}

export function formatStatus(night: Night): string {
  return `${formatTime(night.minutes)}   ${night.money} Kč   ${getDrunkenness(night).toFixed(1)}`;
}
