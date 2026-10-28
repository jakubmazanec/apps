/** Today's date in the player's local time as one number: 20261025 for 25 October 2026. */
export function todaySeed(): number {
  let now = new Date();

  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The date number as the Collection window writes it: 27 Oct 2026 for 20261027. */
export function formatDate(date: number): string {
  let year = Math.floor(date / 10000);
  let month = Math.floor(date / 100) % 100;
  let day = date % 100;

  return `${day} ${MONTHS[month - 1]} ${year}`;
}
