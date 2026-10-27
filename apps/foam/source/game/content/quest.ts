import {isWithin, type Span} from '../core/hours.js';
import {type Night} from '../core/night.js';
import {standIn} from '../core/prose.js';

// The titles of this file are stand-in text: the author replaces standIn by prose when writing
// the real titles. They keep the limits of the content files: no word is longer than 16 characters.

/** The friend's hours in Rotor's back room: an early visit, and a late one till the bar closes. */
export type FriendEvening = {early: Span; late: Span};

export const FRIEND_EVENINGS: Readonly<Record<'later' | 'sooner' | 'usual', FriendEvening>> = {
  usual: {early: [1020, 1200], late: [1380, 1620]}, // 17:00 to 20:00, 23:00 to close
  sooner: {early: [960, 1080], late: [1320, 1620]}, // 16:00 to 18:00, 22:00 to close
  later: {early: [1140, 1260], late: [1440, 1620]}, // 19:00 to 21:00, 00:00 to close
};

const FRIEND_ODDS = {usual: 0.5, sooner: 0.25, later: 0.25};

/** The birthday at Rotor's long table. */
export const PARTY: Span = [1200, 1500];

export const BOTTLE_PRICE = 250;
export const TICKET_PRICE = 300;

/** The minutes a failed search for the friend costs, on top of the choice's own. */
export const SEARCH_HOUR = 60;

export const KEYS_STORY = standIn`The keys`;
export const BIRTHDAY_STORY = standIn`The birthday`;

/** The night's evening: the back room, the hints and `isFriendIn` read it. */
export function getFriendEvening(night: Night): FriendEvening {
  return FRIEND_EVENINGS[night.pick('friend', FRIEND_ODDS)];
}

/** Whether the friend is in the back room now. */
export function isFriendIn(night: Night): boolean {
  let {early, late} = getFriendEvening(night);

  return isWithin(night, early) || isWithin(night, late);
}
