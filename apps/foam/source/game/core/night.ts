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
};

/** The drinks the body clears in an hour. */
export const DRINKS_PER_HOUR = 1;

const MINUTES_PER_HOUR = 60;

export function createNight(
  start: {
    place: PlaceId;
    minutes: number;
    money: number;
    drunkenness?: number;
  },
  collection?: Collection,
): Night {
  return {
    minutes: start.minutes,
    money: start.money,
    place: start.place,
    leaving: null,
    drunkenness: {level: start.drunkenness ?? 0, at: start.minutes},
    roll: null,
    random: Math.random,
    log: [],
    collection: collection ?? {titles: []},
    stories: [],
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
