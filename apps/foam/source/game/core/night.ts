export type Night = {
  /** Minutes since midnight; 19:40 is 1180. */
  minutes: number;

  /** Money, in Kč. */
  money: number;

  /** State of mind, shown as written. */
  stateOfMind: string;
};

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

// Sample values: the hours of the night are decided in phases 4 and 5.
export function createNight(): Night {
  return {minutes: 1180, money: 350, stateOfMind: 'Sober'};
}

export function formatStatus(night: Night): string {
  // The second modulo keeps a time before midnight of the first day positive.
  let minutes = ((night.minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, '0');
  let rest = String(minutes % MINUTES_PER_HOUR).padStart(2, '0');

  return `${hours}:${rest}   ${night.money} Kč   ${night.stateOfMind}`;
}
