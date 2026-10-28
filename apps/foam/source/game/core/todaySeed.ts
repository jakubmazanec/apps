/** Today's date in the player's local time as one number: 20261025 for 25 October 2026. */
export function todaySeed(): number {
  let now = new Date();

  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The date number as the Collection window writes it: 27 Oct 2026 for 20261027. */
export function formatDate(date: number): string {
  return `${date % 100} ${MONTHS[(Math.floor(date / 100) % 100) - 1]} ${Math.floor(date / 10000)}`;
}
