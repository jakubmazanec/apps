// Imports nothing, not even a type: scripts/fill-travel-data.mjs reads this file in Node.
export type ExpectedJourney = {from: string; way: 'taxi' | 'tram' | 'walk'; to: string};

/**
 * The journeys the travel data has to hold. On foot and by taxi: from every entry to every other
 * place. By tram: from every entry to every other stop, except from a place to its own nearest
 * stop.
 */
export function getExpectedJourneys(
  places: Readonly<
    Record<string, {kind: string; tramStop?: string; nearestTramStop?: {name: string}}>
  >,
): ExpectedJourney[] {
  let journeys: ExpectedJourney[] = [];
  let entries = Object.entries(places);

  for (let [from, start] of entries) {
    for (let way of ['walk', 'tram', 'taxi'] as const) {
      let kind = way === 'tram' ? 'stop' : 'place';

      for (let [to, end] of entries) {
        let isOwnStop =
          way === 'tram' &&
          start.nearestTramStop !== undefined &&
          end.tramStop === start.nearestTramStop.name;

        if (to !== from && end.kind === kind && !isOwnStop) {
          journeys.push({from, way, to});
        }
      }
    }
  }

  return journeys;
}
