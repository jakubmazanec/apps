// Imports nothing, not even a type: scripts/fill-travel-data.mjs reads this file in Node.
export type ExpectedJourney = {from: string; way: 'taxi' | 'tram' | 'walk'; to: string};

/**
 * The journeys the travel data has to hold. On foot and by taxi: from every entry to every other.
 * By tram: from every entry with a `tramStop` to every other entry with one. In the order of the
 * entries, then of the ways (`walk`, `tram`, `taxi`), then of the entries again.
 */
export function getExpectedJourneys(
  entries: Readonly<Record<string, {tramStop?: string}>>,
): ExpectedJourney[] {
  let journeys: ExpectedJourney[] = [];
  let list = Object.entries(entries);

  for (let [from, start] of list) {
    for (let way of ['walk', 'tram', 'taxi'] as const) {
      for (let [to, end] of list) {
        let isRide = start.tramStop !== undefined && end.tramStop !== undefined;

        if (to !== from && (way !== 'tram' || isRide)) {
          journeys.push({from, way, to});
        }
      }
    }
  }

  return journeys;
}
