import {isWithin, type Span} from '../core/hours.js';
import {type Night, type PlaceId} from '../core/night.js';
import {standIn} from '../core/prose.js';

// The title of this file is stand-in text: the author replaces standIn by prose when writing the
// real title. The author's avatar keeps his name, the one exception to the rule that people have
// no names.

/** The author's avatar, the one person in the game with a real name. */
export const AUTHOR = 'Jakub';

export const AUTHOR_STORY = standIn`The author`;

export type Seat = 'hall' | 'rotor' | 'shop';

/** Where the author sits on a night that picks the seat, and his hours there. */
export const SEATS: Readonly<Record<Seat, {place: PlaceId; hours: Span}>> = {
  shop: {place: 'whiskyShopRoom', hours: [1020, 1140]}, // 17:00 to 19:00
  rotor: {place: 'rotorBarRoom', hours: [1260, 1380]}, // 21:00 to 23:00
  hall: {place: 'hlavniNadraziHall', hours: [1860, 1920]}, // 07:00 to the end
};

const SEAT_ODDS = {shop: 0.4, rotor: 0.4, hall: 0.2};

/** The night's seat: the invitation and the three places read it. */
export function getSeat(night: Night): Seat {
  return night.pick('authorTonight', SEAT_ODDS);
}

/** Whether the author is in the place now. */
export function isAuthorIn(night: Night, place: PlaceId): boolean {
  let seat = SEATS[getSeat(night)];

  return seat.place === place && isWithin(night, seat.hours);
}
