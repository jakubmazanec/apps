import {isWithin, type Span} from '../core/hours.js';
import {type Night} from '../core/night.js';
import {standIn} from '../core/prose.js';

// The titles of this file are stand-in text: the author replaces standIn by prose when writing
// the real titles. They keep the limits of the content files: no word is longer than 16 characters.

/** The friend is in Rotor's back room from 17:00 to 20:00. */
export const FRIEND_EARLY: Span = [1020, 1200];

/** And again from 23:00 until the bar closes. */
export const FRIEND_LATE: Span = [1380, 1620];

/** The birthday at Rotor's long table. */
export const PARTY: Span = [1200, 1500];

export const BOTTLE_PRICE = 250;
export const TICKET_PRICE = 300;

/** The minutes a failed search for the friend costs, on top of the choice's own. */
export const SEARCH_HOUR = 60;

export const KEYS_STORY = standIn`The keys`;
export const BIRTHDAY_STORY = standIn`The birthday`;

/** Whether the friend is in the back room now. */
export function isFriendIn(night: Night): boolean {
  return isWithin(night, FRIEND_EARLY) || isWithin(night, FRIEND_LATE);
}
