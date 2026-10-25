/** Today's date in the player's local time as one number: 20261025 for 25 October 2026. */
export function todaySeed(): number {
  let now = new Date();

  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}
