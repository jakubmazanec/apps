# Locations and hours (Foam phase 5, spec 3 of 4): design

Date: 2026-10-10. App: `apps/foam`. Status: implemented by
[2026-10-10-locations-and-hours.md](../plans/2026-10-10-locations-and-hours.md). It is the third of
phase 5's four specs in the [direction document](../../direction.md). It builds on spec 2,
[actions with costs, odds and conditions](2026-10-09-actions-with-costs-design.md). The fourth spec,
the end of the night and the log, follows this one.

## Background

Specs 1 and 2 of phase 5 left a night that can be spent: a choice has a price, minutes, drinks, odds
and a condition on drunkenness, the story window greys out what the night cannot pay, the status
line shows the clock, the money and the level, and a `next` can be a function of the night. But
nothing in the night depends on the hour, and the city is seven flat places:

- A place is one picture with its buttons. A bar is one room; its door is the way out, and it offers
  walk, tram and taxi, as every way out does.
- A tram ride "from Rotor Bar" exists in `travel.json`: the fill script adds the walk to the bar's
  nearest stop into its minutes. A tram stop can be reached only by tram.
- `places.json` holds the opening hours of the two bars in OpenStreetMap's notation, and nothing
  reads them. Rotor Bar's Friday is `Fr 16:00-03:00`, past midnight into Saturday.
- The night starts on the train at 17:00 (`minutes: 1020`).

The direction document's Locations, Travel and Hours rows, agreed when phase 5 was cut into four
specs, say what this spec builds: the map shows locations; a location is a group of places, each
outdoors or indoors; a journey ends at the location's arrival place, or on the street outside when a
bar is closed, where the door does not open; when a location closes with the player indoors, its
closing script runs and ends with the player outside; walk and taxi are offered only outdoors, and
the tram only at a tram stop; the night runs from Friday 16:00 to Saturday 08:00.

Three things shape this spec:

- **Use what exists.** A move between the places of a location, a door that stays shut and a person
  who comes at a certain hour are written by hand with what scripts already have: `onChoose`, a
  function `start` or `next`, `isVisible`. The game adds rules only where a forgotten line would
  break the night: the arrival at a closed bar, and the closing.
- **The night is a budget, so the player sees the hours.** The travel window shows when a bar opens
  or closes, next to the minutes and the price of the journey there.
- **The data holds only what the game plays.** A location's hours are the spans of one Friday night,
  in the unit of the clock. The full notation of OpenStreetMap is read by the script that fills the
  data, not by the game.

## Decisions (from brainstorming)

1. **A folder per location, a file per place.** `content/locations/rotorBar/` holds `location.ts`
   (the name, the places, the arrival place, the place outside and the closing script) and one file
   for each place. A tram stop is a folder with two small files.
2. **The train is a location** of one place, off the map, so every place has a location.
3. **A move between places is written by hand.** A choice's `onChoose` sets `night.place`; a door
   into a location that closes branches on `isOpen`. No new field on the choice and no door helper.
4. **Hours are spans of the Friday night, in night minutes:** `"hours": [[960, 1620]]` is Friday
   16:00 to Saturday 03:00. The fill script converts OpenStreetMap's tag with the `opening_hours`
   library, which only the script uses.
5. **The game notices a closing when a window closes,** so the action that crosses the closing time
   finishes first. It moves the player to the location's `outside` place and opens the location's
   closing script, which is text.
6. **The destination button shows the hours** at the minute of arrival: `till 03:00`, `opens 16:30`
   or `closed`.
7. **People who are there only at certain hours are met through the things,** by hand: a thing's
   script branches on `isWithin`. Scene buttons do not come and go.
8. **The places of the first version:** each bar is its room and its street; the main station is its
   hall and its forecourt, Nádražní, which is also the tram stop Hlavní nádraží. The direction
   document's Places row gains that third tram stop.
9. **A bar that opens later in the night** can be waited for: Vranovská's locked door offers
   `Wait a while  10 min` before 16:30.

## Design

### What the player sees

1. The night starts on the train at 16:00. The status line reads `16:00   350 Kč   0.0`.
2. "Ride on to the main station" ends in the main station's hall; "Get off at Brno-Židenice" ends on
   Židenice's platform, as today.
3. A bar is two places. In the room, "The door" offers "Go out", and the street comes in through
   black with its description. On the street, the bar's door offers "Go in" while the bar is open;
   while it is closed it says so, and there is no "Go in". Before 16:30 the Whisky Shop's door
   offers `Wait a while  10 min` beside "Leave it".
4. The main station is two places. The hall's doors lead out to Nádražní, the forecourt, and its
   doors lead back in.
5. A way out is a thing in an outdoor place: the bars' streets, Nádražní, Židenice and the two tram
   stops. It offers walk and taxi, and the tram as well at Nádražní, Náměstí Republiky and
   Malinovského náměstí. A room and the hall have no way out of their own; their door leads outside.
6. The travel window's map shows the six locations on the map. The destination button reads, for
   example, `Rotor Bar  12 min  till 03:00`, `Whisky Shop  10 min  160 Kč  opens 16:30` or
   `Rotor Bar  12 min  closed`, read at the minute the journey would arrive. A station or a stop
   shows no hours.
7. A journey to an open bar ends in its room; to a closed bar, on its street. A journey to the main
   station ends on Nádražní.
8. When a bar closes while the player is in its room, the action that crossed the closing time runs
   to the end of its text. When its window closes, the bar's closing script opens; when that closes,
   the bar's street comes in through black with its description.
9. At Rotor Bar's corner table, a guitarist sits from 22:00 to 01:00; at other hours the table is
   today's strangers with the spare chair.

What does not change: the night has no end yet (spec 4), the place button, the status line, the
menu, the story window and the fades. A move between places goes through black, as every change of
place does today.

### Files

| File                                       | Change                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `source/game/core/location.ts`             | New. `LocationId`, `Location`                                                                                    |
| `source/game/core/place.ts`                | `outdoors`                                                                                                       |
| `source/game/core/night.ts`                | `PlaceId` holds the ten place ids; `formatStatus` formats the time through `formatTime`                          |
| `source/game/core/hours.ts`                | New. `Span`, `isWithin`, `isOpenAt`, `getHoursWords`, `formatTime`                                               |
| `source/game/core/travel.ts`               | `LocationEntry`, `LocationData`; `NightStart` with locations; `getLocation`; destinations are locations; arrival |
| `source/game/core/getExpectedJourneys.ts`  | The journeys between locations, by `tramStop`                                                                    |
| `source/game/core/checkContent.ts`         | Locations, hours, ways out by the kind of place, check nights at many times                                      |
| `source/game/content/locations.ts`         | New. `locations`, and `places` derived from them                                                                 |
| `source/game/content/locations/*/`         | New. Seven folders: today's place files moved into them, the new places, `location.ts`                           |
| `source/game/content/places.ts`, `places/` | Go                                                                                                               |
| `source/game/content/hours.ts`             | New. `isOpen`                                                                                                    |
| `source/game/content/nightStart.ts`        | `locations`, `places`, `locationData`; `minutes: 960`                                                            |
| `source/game/content/journeys.ts`          | A journey's text names the location of `night.place`                                                             |
| `source/game/content/data/locations.json`  | `places.json` moved, without `kind`, `nearestTramStop` and `openingHours`, with `hours`                          |
| `source/game/content/data/travel.json`     | The journeys of the new rule                                                                                     |
| `source/game/content/data/README.md`       | The fields of `locations.json`, the rule for `hours`, the library                                                |
| `source/game/screens/travelWindow.ts`      | Opens from a location; the hours on the destination button                                                       |
| `source/game/screens/nightScreen.ts`       | The closing; the travel window opened from the place's location                                                  |
| `scripts/fill-travel-data.mjs`             | `locations.json`; no nearest stop; hours through the library                                                     |
| `scripts/fetch-map-data.mjs`               | Reads the positions from `locations.json`                                                                        |
| `scripts/list-stand-ins.mjs`               | Reads `content/locations/` with its subfolders, and `locations.json`                                             |
| `package.json`                             | `opening_hours` as a dev dependency                                                                              |
| `tests/fixedWorld.ts`                      | Locations, a bar with a street, hours and a closing script                                                       |

The seven place files move with `git mv`, so their history follows them.

### Locations and places (`core/location.ts`, `core/place.ts`)

```ts
export type LocationId =
  | 'hlavniNadrazi'
  | 'malinovskehoNamesti'
  | 'namestiRepubliky'
  | 'rotorBar'
  | 'train'
  | 'whiskyShop'
  | 'zidenice';

export type Location = {
  id: LocationId;

  /** The real name. The destination button and a journey's text show it. */
  name: string;

  places: Place[];

  /** Where a journey ends while the location is open. */
  arrival: PlaceId;

  /**
   * A location with hours: its outdoor place, where a journey ends while it is closed and where
   * the game puts the player when it closes.
   */
  outside?: PlaceId;

  /** A location with hours: runs when it closes with the player indoors. */
  closing?: RunnableDialogueScript<Night>;
};
```

`Place` gains `outdoors: boolean`: walk and taxi are offered only outdoors. `PlaceId` stays in
`night.ts`, and `night.place` stays a place id. A location has no short name: the map's buttons have
no names, and the destination button wraps a long name.

`NightStart` holds `locations: Readonly<Record<string, Location>>` and `places`, the places of all
locations by id, which `content/locations.ts` derives once. `getLocation(start, place)` in
`core/travel.ts` returns the location whose `places` hold the place, or `undefined`. It searches
`start.locations`, so a test that writes into `nightStart` is seen.

The ids and the names:

| Place id                 | Name on the place button                    | Location              | Outdoors |
| ------------------------ | ------------------------------------------- | --------------------- | -------- |
| `train`                  | The train                                   | `train`               | no       |
| `zidenice`               | Brno-Židenice                               | `zidenice`            | yes      |
| `hlavniNadraziHall`      | Brno hlavní nádraží (short: Hlavní nádraží) | `hlavniNadrazi`       | no       |
| `hlavniNadraziForecourt` | Nádražní                                    | `hlavniNadrazi`       | yes      |
| `whiskyShopRoom`         | The Whisky Shop Brno (short: Whisky Shop)   | `whiskyShop`          | no       |
| `whiskyShopStreet`       | Vranovská                                   | `whiskyShop`          | yes      |
| `rotorBarRoom`           | Rotor Bar                                   | `rotorBar`            | no       |
| `rotorBarStreet`         | Dvořákova                                   | `rotorBar`            | yes      |
| `namestiRepubliky`       | Náměstí Republiky (short: Nám. Republiky)   | `namestiRepubliky`    | yes      |
| `malinovskehoNamesti`    | Malinovského náměstí (short: Malinovského)  | `malinovskehoNamesti` | yes      |

The locations:

| Location              | Name                 | Places              | Arrival                  | Outside            | Hours                        |
| --------------------- | -------------------- | ------------------- | ------------------------ | ------------------ | ---------------------------- |
| `train`               | The train            | the train           | `train`                  |                    |                              |
| `zidenice`            | Brno-Židenice        | the platform        | `zidenice`               |                    |                              |
| `hlavniNadrazi`       | Brno hlavní nádraží  | the hall, Nádražní  | `hlavniNadraziForecourt` |                    |                              |
| `whiskyShop`          | The Whisky Shop Brno | the room, Vranovská | `whiskyShopRoom`         | `whiskyShopStreet` | 16:30–21:00, `[[990, 1260]]` |
| `rotorBar`            | Rotor Bar            | the room, Dvořákova | `rotorBarRoom`           | `rotorBarStreet`   | 16:00–03:00, `[[960, 1620]]` |
| `namestiRepubliky`    | Náměstí Republiky    | the stop            | `namestiRepubliky`       |                    |                              |
| `malinovskehoNamesti` | Malinovského náměstí | the stop            | `malinovskehoNamesti`    |                    |                              |

The hours belong to the data (`locations.json`), not to `Location`; the table shows them for the
reader.

### The content (`content/locations/`)

```
content/locations.ts
content/locations/train/location.ts                 train.ts
content/locations/zidenice/location.ts              zidenice.ts
content/locations/hlavniNadrazi/location.ts         hall.ts, forecourt.ts
content/locations/whiskyShop/location.ts            room.ts, street.ts
content/locations/rotorBar/location.ts              room.ts, street.ts
content/locations/namestiRepubliky/location.ts      stop.ts
content/locations/malinovskehoNamesti/location.ts   stop.ts
```

A location file:

```ts
// content/locations/rotorBar/location.ts
const closing = defineScript({
  start: {
    speaker: 'Closing time',
    text: standIn`
      The lights come up and the bartender starts putting chairs on the tables. Nobody argues,
      and somebody holds the door for you.
    `,
  },
});

export const rotorBar: Location = {
  id: 'rotorBar',
  name: 'Rotor Bar',
  places: [rotorBarRoom, rotorBarStreet],
  arrival: 'rotorBarRoom',
  outside: 'rotorBarStreet',
  closing,
};
```

A move between places, by hand. The room's door:

```ts
// content/locations/rotorBar/room.ts
const door = defineScript({
  start: {
    speaker: DOOR,
    text: standIn`The door lets in the cold and the sound of a tram in Dvořákova street.`,
    choices: [
      {
        text: 'Go out',
        onChoose: (night) => {
          night.place = 'rotorBarStreet';
        },
      },
    ],
  },
});
```

"Go out" costs nothing and is always offered, so it is the node's way out that costs nothing. The
street's door, open or locked:

```ts
// content/locations/rotorBar/street.ts
const door = defineScript({
  start: (night) => (isOpen(night, 'rotorBar') ? 'open' : 'locked'),
  nodes: {
    open: {
      speaker: ROTOR_BAR,
      text: standIn`Music and warm air come through the door whenever somebody opens it.`,
      choices: [
        {
          text: 'Go in',
          onChoose: (night) => {
            night.place = 'rotorBarRoom';
          },
        },
        {text: 'Stay outside'},
      ],
    },
    locked: {
      speaker: ROTOR_BAR,
      text: standIn`The door is locked. Through the glass, the chairs stand on the tables.`,
    },
  },
});
```

What each place holds, all in stand-in text with today's limits (no word longer than 16 characters,
people without names, a `speaker` on every node, italic marks in pairs, a description of two or
three sentences, a scene button of one node of one or two):

| Place                | Things                                                                                                                                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The train            | As today; "Ride on to the main station" moves the player to `hlavniNadraziHall`                                                                                                                                                                                                                |
| Brno-Židenice        | As today; the underpass offers walk and taxi, and its text no longer mentions trams                                                                                                                                                                                                            |
| Brno hlavní nádraží  | Today's place, as the hall: the board and the hall as today; "The doors" offer "Go out" to Nádražní                                                                                                                                                                                            |
| Nádražní             | New. A description of the forecourt, its tram stop and the line of taxis. "The doors": "Go in" to the hall. "A stranger": asks for money for a ticket, `Give some change  20 Kč` or "Walk on". "The street": the way out, walk, tram and taxi                                                  |
| The Whisky Shop Brno | Today's place, as the room: the shelves, the shopkeeper and the two regulars as today; "The door" offers "Go out" to Vranovská                                                                                                                                                                 |
| Vranovská            | New. A description of the street in Husovice. "The Whisky Shop": the door, open ("Go in", "Stay outside"), before 16:30 locked with the hours on the glass (`Wait a while  10 min`, "Leave it"), after 21:00 locked. "The window": bottles lit in the shop window. "The street": walk and taxi |
| Rotor Bar            | Today's place, as the room: the bar as today; the corner table with the guitarist from 22:00 to 01:00 (`Ask for a song  10 min`, "Leave him to it") and today's strangers at other hours; "The door" offers "Go out" to Dvořákova; the smokers move to Dvořákova                               |
| Dvořákova            | New. A description of the street outside Rotor Bar. "Rotor Bar": the door, open or locked. "The smokers": today's scene, with "Leave them to it" as its free choice instead of "Go back in". "The street": walk and taxi                                                                       |
| Náměstí Republiky    | As today                                                                                                                                                                                                                                                                                       |
| Malinovského náměstí | As today                                                                                                                                                                                                                                                                                       |

The closing scripts: Rotor Bar's above; the Whisky Shop's, the shopkeeper counting the till and
looking over his glasses until the player understands. The Whisky Shop's door branches three ways:

```ts
start: (night) =>
  isOpen(night, 'whiskyShop') ? 'open'
  : night.minutes < 990 ? 'early'
  : 'locked',
```

The guitarist's span is a constant of the room's file: `const GUITARIST: Span = [1320, 1500];`, read
with `isWithin(night, GUITARIST)` in the corner table's `start`.

The rooms keep the bar picture; the hall keeps the stand-in picture; Nádražní, Vranovská and
Dvořákova show the stand-in picture (black with one lamp). Real pictures stay a later spec, as the
direction document says.

`nightStart` starts the night on the train at 16:00:

```ts
export const nightStart: NightStart = {
  locations,
  places,
  locationData,
  travel,
  map,
  place: 'train',
  minutes: 960,
  money: 350,
};
```

### Hours (`core/hours.ts`, `content/hours.ts`)

A span is two night minutes: from 960 to 1439 is Friday, from 1440 to 1920 Saturday up to 08:00. The
end is not included: at 03:00 (1620) Rotor Bar is closed.

```ts
export type Span = readonly [from: number, to: number];

/** Whether the clock lies in the span. */
export function isWithin(night: Night, [from, to]: Span): boolean;

/** Whether a location with these hours is open at the minute; one without hours always is. */
export function isOpenAt(hours: readonly Span[] | undefined, minutes: number): boolean;

/**
 * The hours as the destination button shows them at the minute: "till 03:00" inside a span,
 * "opens 16:30" before a later one, "closed" after the last, and "" without hours.
 */
export function getHoursWords(hours: readonly Span[] | undefined, minutes: number): string;

/** "03:00" for 1620. `formatStatus` uses it. */
export function formatTime(minutes: number): string;
```

`hours.ts` in `core` knows nothing of the content. The doors' helper is in `content/hours.ts`:

```ts
/** Whether the location is open now, by its hours in locations.json. */
export function isOpen(night: Night, location: LocationId): boolean;
```

It imports `data/locations.json` itself, not `nightStart`: `nightStart` imports the locations, they
import their place files, and those import `isOpen`, which would close a cycle.
`nightStart.locationData` is the same object, so a test that writes into it changes what `isOpen`
reads.

### The data (`locations.json`, `travel.json`)

`places.json` moves to `locations.json`: one entry per location on the map, by location id; the
train has none, as today.

| Field                                                   | Meaning                                                                                                        |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `address`, `station`, `osmName`, `position`, `computed` | As today                                                                                                       |
| `tramStop`                                              | The stop's name in OpenStreetMap. A location with it is a tram stop. The main station gains `"Hlavní nádraží"` |
| `hours`                                                 | The spans in which it is open, in night minutes. No `hours`: it never closes                                   |

`kind` goes: the main station is a station and a stop, which one kind cannot say. `nearestTramStop`
goes: a tram ride starts at a stop. `openingHours` goes, replaced by `hours`; the two strings of
today become `[[960, 1620]]` for Rotor Bar and `[[990, 1260]]` for the Whisky Shop, by hand. Rotor
Bar's entry, before and after:

```json
"rotorBar": {"kind": "place", "address": "Dvořákova 12", "osmName": "Rotor bar", "position": {…},
  "computed": true, "openingHours": "Mo-Th 16:00-01:00, Fr 16:00-03:00, Sa 17:00-03:00",
  "nearestTramStop": {"name": "Malinovského náměstí", "position": {…}}}

"rotorBar": {"address": "Dvořákova 12", "osmName": "Rotor bar", "position": {…}, "computed": true,
  "hours": [[960, 1620]]}
```

In `core/travel.ts`, `PlaceEntry` becomes `LocationEntry` and `PlaceData` becomes `LocationData`.
`hours` is typed `number[][]`, so the JSON import fits; the checker checks that each span is a pair.

`getExpectedJourneys` gets the new rule: walk and taxi from every entry to every other entry, the
tram from every entry with `tramStop` to every other one with it. `travel.json` changes accordingly:

| Journeys                                                                               | Change                                                       | Count |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----- |
| By tram from Rotor Bar, the Whisky Shop and Židenice                                   | Removed                                                      | 4     |
| By tram from the main station                                                          | Deleted and computed again from stop to stop, without a walk | 2     |
| By tram to the main station, from both stops                                           | New                                                          | 2     |
| By tram between the two stops                                                          | Kept                                                         | 2     |
| On foot and by taxi from the other four locations to both stops, and between the stops | New                                                          | 20    |
| Every other journey on foot and by taxi                                                | Kept                                                         |       |

`map.json` does not change: no position is new.

### The scripts

**`fill-travel-data.mjs`** reads and writes `locations.json`. A position comes from `address`, then
`station`, then `tramStop`. It looks up no nearest stop; a tram journey is
`getTramJourney(0, distance)`, today's formula without a walk. For an entry with `osmName` and no
`hours`, it looks the tag up as today and asks the `opening_hours` library for the open intervals
from 16:00 of a fixed Friday with no public holiday to 08:00 of the Saturday after it, with the
Czech country code so that `PH` rules read; it writes them as night minutes, with `computed`. A tag
the library cannot read is listed as missing, as a failed lookup is, and the author writes `hours`
by hand. It still never changes a value that is there. The library is a dev dependency of
`apps/foam` (5 MB, LGPL-3.0) and never reaches the game's bundle.

The plan runs the script once for the 20 new journeys on foot and by taxi, which needs the routing
service; the 4 tram journeys come from distances.

**`fetch-map-data.mjs`** reads the positions from `locations.json`. **`list-stand-ins.mjs`** reads
`content/locations/` with its subfolders, and counts the computed entries of `locations.json` and
`travel.json`.

### Travel (`core/travel.ts`)

```ts
export type Destination = {location: Location; way: Way; minutes: number; price: number};

/** The destinations from a location by a way, nearest first, then by name. */
export function getDestinations(start: NightStart, from: LocationId, way: Way): Destination[];

/** Adds the minutes, takes the price, and puts the player at the arrival or, closed, outside. */
export function takeJourney(start: NightStart, night: Night, destination: Destination): void {
  let {location} = destination;

  night.minutes += destination.minutes;
  night.money -= destination.price;
  night.place =
    (
      location.outside === undefined ||
      isOpenAt(start.locationData[location.id]?.hours, night.minutes)
    ) ?
      location.arrival
    : location.outside;
}
```

"Closed" is read at the minute of arrival. A journey's text (`content/journeys.ts`) names the
location of `night.place`, so a walk that ends on Dvořákova because Rotor Bar is closed reads "…the
way to Rotor Bar".

### The travel window (`screens/travelWindow.ts`)

`open({from, way, ways, night})` takes the location of the place shown. The light is at that
location's position, and the map's buttons are the locations of `locationData`, as today's entries
are.

The destination button adds the hours words to the numbers, two spaces apart:
`formatCosts(destination)` and then `getHoursWords(hours, night.minutes + minutes)` when it is not
empty. The numbers keep their place: beside the name on a wide screen, on a line of their own on a
narrow one.

The button's room is computed once, when the window is built, from every destination of every
location, as today. For each destination it measures the longest form its words can take: `till`
with the end of each of its spans, `opens` with the start of each, and `closed`. The button then
never grows when the clock moves.

Greying is unchanged: only a journey the night cannot pay is greyed out. A closed location is
selected and taken like an open one.

### The night screen (`screens/nightScreen.ts`)

`actOnNight` gains the closing, after the way out:

```ts
if (place !== null && night.place === place.id) {
  if (night.leaving !== null) {
    openTravel(screen, getLocation(nightStart, place.id).id, night.leaving);
    night.leaving = null;
  } else if (isClosedAround(place)) {
    let location = getLocation(nightStart, place.id);

    night.place = location.outside;
    openStory(screen, location.closing);
  }

  return;
}
```

`isClosedAround(place)` is true when the place is indoors and its location's hours are closed at
`night.minutes`. Setting `night.place` before the window opens is what a script's `onEnter` does
today: the street is built while the closing window is open (`prepareNextPlace`), the window closes
into black (`onClosing` sees the change), and `actOnNight` then shows the street with its
description. The order of `actOnNight` is: a place the night moved the player to, then a way out,
then the closing. A way out exists only outdoors and a closing only indoors, so the last two never
meet.

The check runs after every window: a beer, a description, a door. A jump-in to a closed bar's room
(`/?place=rotorBarRoom&time=04:00`) shows the room's description, and the closing runs when it ends.

### The jump-in (`core/getJumpIn.ts`)

Unchanged in code. `place` takes the ten place ids of `nightStart.places`.

### The checker (`core/checkContent.ts`)

`Content` becomes `{locations, places, journeys, locationData, travel, map}`.

**Check nights.** Today each script is checked at 17:00, at three levels of drunkenness, once per
place. The times become each half hour from 16:00 to 07:30, and both sides of every opening and
closing in `locationData` (a span's `from − 1`, `from`, `to − 1` and `to`, inside the night), each
with the three levels, once per place. A door, a person or a closing script that branches on the
clock is then followed on both sides of every edge the data has. The closing scripts are checked
like any other script, under `<location> › closing`.

**Ways out.** For each scene button of a place, the checker calls every choice's `onChoose` on a
fresh check night and reads `night.leaving`. Walk and taxi may be offered only when that place is
outdoors, and the tram only when it is outdoors in a location whose entry has `tramStop`.

**New rules**, each reported as one line:

| Rule                                                                                 | Example of a report                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Every place is in exactly one location                                               | `rotorBarStreet: in rotorBar and whiskyShop`                                         |
| The arrival is one of the location's places                                          | `rotorBar: arrival "whiskyShopRoom" is not one of its places`                        |
| A location with hours has a closing script                                           | `rotorBar: hours but no closing`                                                     |
| A location with hours has an `outside` that is one of its outdoor places             | `rotorBar: outside "rotorBarRoom" is not outdoors`                                   |
| A location without hours has no `closing` and no `outside`                           | `zidenice: a closing but no hours`                                                   |
| Each span is two whole numbers, 960 ≤ from < to ≤ 1920, the spans in order and apart | `locations.json › rotorBar › hours: [1620, 960] is not a span of the night`          |
| An entry for every location on the map, and none for another id                      | `locations.json: no entry for "rotorBar"`                                            |
| Walk and taxi only outdoors                                                          | `rotorBarRoom › The door › start › "Walk": walk is offered indoors`                  |
| The tram only outdoors at a stop                                                     | `rotorBarStreet › The street › start › "Take the tram": the tram does not stop here` |

The existing rules stay: the journeys `travel.json` must hold (now by the new rule), the way out
that costs nothing, words, titles, labels, positions and the map's cover. The train's location is
off the map, as the train is today.

### The tests' fixed world (`tests/fixedWorld.ts`)

The fixed world gets locations. The bar becomes a location of two places, its room (today's
`testBar`) and a new street, with hours and a closing script, so the browser tests drive a real
door, a real closed arrival and a real closing. The square, the stop and the broken place are each a
location of one place. Its travel follows the new rule: the tram only from the stop.

## Error handling

| What goes wrong                                                          | In CI               | In the running game                                                                               |
| ------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| A location with hours lacks `closing` or `outside`                       | The checker fails   | The closing throws, and the error screen shows it, as for a journey to an unknown place           |
| A door moves the player into a closed location (its condition forgotten) | Not checked         | The room shows with its description; when that closes, the closing runs and the player is outside |
| A script moves the player to a place the content lacks                   | The types fail      | `console.warn`, and the night stays where it was, as today                                        |
| A span out of the night or out of order                                  | The checker fails   | `isOpenAt` reads the spans as written                                                             |
| A tag the library cannot read                                            | The script lists it | No `hours` until the author writes them: the location never closes                                |
| A way out offers the tram where no tram stops                            | The checker fails   | The travel window opens with no destination by tram, as for any way without one                   |
| A journey arrives after 08:00                                            | Not checked         | The button says `closed`; spec 4 ends the night                                                   |
| A location's entry lacks a position                                      | The checker fails   | The travel window warns and leaves its button out, as today                                       |

## Testing

Unit tests, in `tests/`:

- **`hours.test.ts`.** New. `isWithin` at both edges. `isOpenAt` without hours, with one span and
  with two, at both edges. `getHoursWords` gives `till`, `opens` and `closed`, an arrival at the
  exact minute of the closing gives `closed`, and no hours give `""`. `formatTime` pads and wraps
  past midnight.
- **`travel.test.ts`.** Destinations are locations, nearest first. `takeJourney` arrives at
  `arrival` while open, at `outside` while closed and before the opening, at `arrival` for a
  location without hours, and reads the hours at the minute of arrival. `getLocation` finds a
  place's location.
- **`getExpectedJourneys.test.ts`.** The new rule, with the main station a station and a stop.
- **`checkContent.test.ts`.** A sample that breaks each new rule, and the line it must report; a
  door that branches on `isOpen` is followed on both sides of the hours.
- **`content.test.ts`.** The game's content gives the empty list; every location has the places of
  the tables above; the train's door leads to the hall. Run through a `Dialogue`: Vranovská's door
  offers `Wait a while` at 16:20, "Go in" at 16:30 and at 20:59, and its locked text at 21:00; Rotor
  Bar's corner table starts with the guitarist at 22:00 and at 00:59, and with the strangers at
  21:59 and at 01:00.
- **`fillTravelData.test.ts`.** `locations.json` in and out; no nearest-stop lookup; a tag turned
  into spans; an unreadable tag listed as missing; the tram from stop to stop.
- **`listStandIns.test.ts`.** Files in subfolders are counted.
- **`getJumpIn.test.ts`.** The new place ids.

Browser tests, in `tests/`:

- **`nightScreenPlaces.browser.test.ts`.** "Go out" from the fixed bar's room shows its street with
  its description. "Go in" works while the bar is open; while it is closed the door shows its locked
  text. A night in the room just before the closing, with a choice that takes ten minutes, opens the
  closing script after the choice's window and ends on the street. A journey that arrives after the
  closing ends on the street. The game's own night starts at 16:00.
- **`travelWindow.browser.test.ts`.** The light is at the location. The destination button shows
  `till`, `opens` and `closed` at the right minutes, and keeps its size as the words change. The
  test of the game's own places on the narrowest screen covers the locations, with the longest form
  of their hours words.
- **`jumpIn.browser.test.ts`.** A jump-in to `rotorBarRoom` at 04:00 runs the closing after the
  description.

The lessons of the earlier phases' reviews hold for every new test and button: closing guards, the
focus kept when a list is rebuilt, sizes that do not jump, an exact screen size through the
viewport, and taps through `userEvent.click`.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- `node scripts/list-stand-ins.mjs` prints the list, with the new places.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- The end of the night at 08:00 and the log (spec 4).
- A general action to wait, beyond the Whisky Shop's door.
- Scene buttons that come and go.
- A field on the choice or a helper for moving between places or for doors.
- The hours shown anywhere but the destination button.
- Real pictures of the new places.
- Days other than Friday, and holidays in the game.
- Where the acknowledgment of OpenStreetMap is shown.
- Changes to Somewhere and to Tellurion.

## Rejected

- **Place files kept flat, with a location field and one list of locations.** A location's facts
  would be split from its places, and a place and its location would name each other, two facts that
  must agree.
- **One file per location with all its places.** It drops one file per place, and a bar's file would
  grow to many hundred lines with real text.
- **A door that moves the player without opening a window.** Every scene button opens a window with
  text and options.
- **A closed door greyed out.** The door does not open: the player tries it and reads why.
- **A `to` field on the choice, and a `createDoor` helper.** New API before real content has shown
  what doors need; the moves are written by hand for now.
- **OpenStreetMap's notation in the data, read by the game,** with a reader of its own for part of
  the notation or with the `opening_hours` library in the bundle. The first is a parser for a
  notation that is mostly about other days; the second ships 5 MB under LGPL-3.0 and needs a
  calendar date.
- **Hours as strings (`"16:00-03:00"`), as hour and minute tuples, or as clock numbers (`1600`).**
  Night minutes are the clock's own unit.
- **The closing script moving the player by hand.** A forgotten line would leave the player indoors
  in a closed bar and open the closing again after every window.
- **Nothing about the hours in the travel window,** or only `closed`. The night is a budget, and a
  walk of half an hour to a locked door, or no way to plan around a closing, is unfair, not a story.
- **People as scene buttons that come and go.** The picture has no people, and the night screen
  would need buttons that change, with their order, focus and fades.
- **No tram at the main station.** The station's forecourt is a tram stop in Brno, and a player who
  arrives by train goes on into the city from it.
- **A short name on the location.** Nothing would show it.
