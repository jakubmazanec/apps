import {type Night} from './night.js';

/** The minute the night starts: Friday 16:00. */
export const NIGHT_START = 960;

/** The minute the night ends: Saturday 08:00. A span's `to` is at most this. */
export const NIGHT_END = 1920;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

export type Span = readonly [from: number, to: number];

// A span is read from the content's `number[]`, which the checker holds to a pair.
function holds(span: readonly number[], minutes: number): boolean {
  let [from = 0, to = 0] = span;

  return minutes >= from && minutes < to;
}

/** Whether the clock lies in the span: from its start up to, not including, its end. */
export function isWithin(night: Night, span: Span): boolean {
  return holds(span, night.minutes);
}

/** Whether a location with these hours is open at the minute; one without hours always is. */
export function isOpenAt(
  hours: ReadonlyArray<readonly number[]> | undefined,
  minutes: number,
): boolean {
  return hours === undefined || hours.some((span) => holds(span, minutes));
}

/**
 * The hours as the destination button shows them at the minute: "till 03:00" inside a span,
 * "opens 16:30" before a later one, "closed" after the last, and "" without hours.
 */
export function getHoursWords(
  hours: ReadonlyArray<readonly number[]> | undefined,
  minutes: number,
): string {
  if (hours === undefined) {
    return '';
  }

  let current = hours.find((span) => holds(span, minutes));

  if (current !== undefined) {
    return `till ${formatTime(current[1] ?? 0)}`;
  }

  // The spans are in order, so the first one that starts later is the next opening.
  let next = hours.find((span) => (span[0] ?? 0) > minutes);

  return next === undefined ? 'closed' : `opens ${formatTime(next[0] ?? 0)}`;
}

/** "03:00" for 1620. `formatStatus` uses it. */
export function formatTime(minutes: number): string {
  // The second modulo keeps a time before midnight of the first day positive.
  let inDay = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let hours = String(Math.floor(inDay / MINUTES_PER_HOUR)).padStart(2, '0');
  let rest = String(inDay % MINUTES_PER_HOUR).padStart(2, '0');

  return `${hours}:${rest}`;
}
