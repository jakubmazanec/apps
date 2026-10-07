import {type PlaceId} from './night.js';
import {type Place} from './place.js';

const TIME_FORM = /^(\d{2}):(\d{2})$/;
const MONEY_FORM = /^-?\d+$/;
const MINUTES_IN_DAY = 1440;

function readTime(value: string): number | null {
  let match = TIME_FORM.exec(value);

  if (match === null) {
    return null;
  }

  let hours = Number(match[1]);
  let minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return null;
  }

  // A night runs past midnight: a time before noon is after it.
  return hours * 60 + minutes + (hours < 12 ? MINUTES_IN_DAY : 0);
}

/**
 * Reads the start of a night from an address's query, or returns null when it names no known
 * place.
 */
export function getJumpIn(
  search: string,
  places: Readonly<Record<string, Place>>,
): {place: PlaceId; minutes?: number; money?: number} | null {
  let parameters = new URLSearchParams(search);
  let place = parameters.get('place');

  if (place === null) {
    return null;
  }

  if (!Object.hasOwn(places, place)) {
    // eslint-disable-next-line no-console -- the address is the only place to say what was wrong
    console.warn(`The jump-in ignores the unknown place "${place}".`);

    return null;
  }

  let jumpIn: {place: PlaceId; minutes?: number; money?: number} = {place: place as PlaceId};
  let time = parameters.get('time');
  let money = parameters.get('money');

  if (time !== null) {
    let minutes = readTime(time);

    if (minutes === null) {
      // eslint-disable-next-line no-console -- see above
      console.warn(`The jump-in ignores the time "${time}": it is not HH:MM, 00:00 to 23:59.`);
    } else {
      jumpIn.minutes = minutes;
    }
  }

  if (money !== null) {
    if (MONEY_FORM.test(money)) {
      jumpIn.money = Number(money);
    } else {
      // eslint-disable-next-line no-console -- see above
      console.warn(`The jump-in ignores the money "${money}": it is not a whole number.`);
    }
  }

  return jumpIn;
}
