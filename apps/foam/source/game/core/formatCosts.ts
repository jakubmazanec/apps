/** "10 min  45 Kč  60%": the numbers that are there, two spaces apart. A price of 0 is left out. */
export function formatCosts(costs: {
  minutes?: number | undefined;
  price?: number | undefined;
  odds?: number | undefined;
}): string {
  let {minutes, odds, price} = costs;
  let parts: string[] = [];

  if (minutes !== undefined) {
    parts.push(`${minutes} min`);
  }

  if (price !== undefined && price > 0) {
    parts.push(`${price} Kč`);
  }

  if (odds !== undefined) {
    parts.push(`${Math.round(odds * 100)}%`);
  }

  return parts.join('  ');
}
