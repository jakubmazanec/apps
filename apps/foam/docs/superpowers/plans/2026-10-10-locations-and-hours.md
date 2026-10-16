# Locations and Hours (Foam Phase 5, Spec 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The city becomes six locations of ten places: each bar has its room and its street, the
main station its hall and its forecourt; a journey goes to a location and ends in its arrival place
or, when it is closed, on the street outside; the travel window's destination button says when a
location opens or closes at the minute of arrival; a bar that closes with the player indoors runs
its closing script and puts them outside; and the night starts at 16:00.

**Architecture:** `core/hours.ts` reads spans of night minutes (`[[960, 1620]]`) and formats a
clock; `core/location.ts` types a location as a group of places with an arrival, an outside and a
closing script; `locations.json` replaces `places.json` with the hours in the clock's unit, filled
by the script through the `opening_hours` library. The content is a folder per location with a file
per place; a move between places and a door that stays shut are written by hand with `onChoose` and
a function `start`. The game adds two rules only: `takeJourney` lands a closed location on its
street, and the night screen runs the closing when a window closes on a player indoors after the
hours.

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tellurion
(`Dialogue`, `Button`, `Modal`, `wrapText`), Pixi.js 8, Vitest 4 (`unit` in Node, `browser` in
Playwright's Chromium), Node 24 scripts (`.mjs` importing `.ts` through type stripping),
`opening_hours` 3.15 (dev dependency, LGPL-3.0-only), Prettier 3, Turborepo.

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-10-locations-and-hours-design.md`

Runs after the plan `apps/foam/docs/superpowers/plans/2026-10-09-actions-with-costs.md`, which is
built: `defineScript`, `formatCosts`, `formatChoice` and the checker's choice rules exist.

## Global Constraints

- Only files under `apps/foam/` change. Nothing under `apps/somewhere/` or `packages/tellurion/`.
- Work on the current branch, `somewhere-update`. Commit at the end of each task with `git add` of
  the task's own paths; a message is one short imperative sentence, with no prefix and no trailer
  lines. Never use `git stash`. Commands run from `apps/foam` unless a step says otherwise.
- **Dependencies.** Task 2 adds `opening_hours` to `apps/foam/package.json` and runs `npm install`
  once, from the repository root, which Jakub approved for this one package on 2026-10-10;
  `package-lock.json` changes only by the lines that package adds. Nothing else touches the
  dependency tree: never `npm dedupe`, never `npm run reinstall`, never delete or regenerate a
  lockfile.
- **Tests.** A task runs only the tests it touches: the unit project, or the browser files named in
  the task, plus `npm run typecheck` and `npx eslint source tests scripts`. The whole suite (about
  nine minutes) is CI's, after the last task. Lint expectation: 0 errors; the known warnings of
  earlier phases may print.
- Code style: `let` for locals, `const` only at module level; relative imports in TypeScript end in
  `.js`; a `.mjs` script imports a `.ts` file by its `.ts` name, and such a file imports nothing at
  runtime (Node resolves no `.js` specifier to a `.ts` file); comments say why and stay within 100
  columns; never remove a comment. Class members are sorted alphabetically within their group
  (`perfectionist/sort-classes`), and so are the keys of a screen's contents type. Prettier formats
  (printWidth 100, no bracket spacing, single quotes) and lint fails on a difference: run
  `npx prettier --write` on the task's files before lint. A type-only import (`import {type Night}`)
  may close a cycle: `import/no-cycle` lets it through (checked).
- `exactOptionalPropertyTypes` is on: never set an optional field to `undefined`. Build an object
  with a field only when it has a value, and type a parameter that may be passed `undefined` as
  `?: T | undefined`.
- Tests: the `vitest` object, not `vi`; every `vitest.fn` takes a type parameter; a blank line
  separates a group of `expect` lines from other statements; `describe(fn, …)` when named after a
  function; no `expect` inside `beforeAll` or `beforeEach`; game modules are imported after
  `bootGame`, never at the top of a browser test (types only at the top); every browser test file
  mocks `content/pictures/barPicture.js` with `PROOF_PICTURE`; taps go through `tap`
  (`userEvent.click`); `console.warn` for anything a browser test must print; a browser file boots
  the game once (`game.init()` runs once per page).
- `core/hours.ts`, `core/location.ts`, `core/travel.ts`, `core/checkContent.ts`,
  `core/getExpectedJourneys.ts` and everything under `content/` never import `core/game.ts`,
  directly or through a screen: the unit tests read them in Node.
- Exact values from the spec: the night runs from `NIGHT_START = 960` (Friday 16:00) to
  `NIGHT_END = 1920` (Saturday 08:00); a span's end is excluded (at 1620 Rotor Bar is closed); the
  night starts on the train at `minutes: 960` with `350` Kč and the status line reads
  `16:00   350 Kč   0.0`; the hours words are `till 03:00`, `opens 16:30` and `closed`, read at
  `night.minutes + destination.minutes`; the Whisky Shop's hours are `[[990, 1260]]` and Rotor Bar's
  `[[960, 1620]]`; the guitarist's span is `[1320, 1500]`; the door's wait is
  `Wait a while  10 min`; the stranger's change is `Give some change  20 Kč`; the ids, names, short
  names, locations, arrivals and outsides are the spec's two tables, copied exactly.
- Stand-in content keeps the limits of the place files' header comment: every text written with
  `standIn`, no word longer than 16 characters, people have no names, every node sets `speaker`,
  italic marks come in pairs, a description is two or three sentences, a scene button is one node of
  one or two. Money changes only through `price`.

## Review Focus

- **An arrival at the exact minute of a closing.** The end of a span is excluded, so a taxi that
  arrives at 03:00 ends on Dvořákova and the button read `closed`. Pinned in Task 1
  (`getHoursWords`) and Task 3 (`takeJourney` at 1620).
- **The old ids in a jump-in.** `?place=rotorBar` named a place yesterday and names a location
  today; the jump-in must drop it with its warning rather than start a night in no place. Pinned in
  Task 3 (`tests/getJumpIn.test.ts`).
- **"Wait a while" that reaches the opening.** At 16:20 the wait ends at 16:30, when the shop is
  open, so the next window must offer "Go in", not the locked text again. Pinned in Task 3
  (`tests/content.test.ts`).
- **The longest hours words on the narrowest screen.** `11 min  180 Kč  opens 16:30` is 162 art
  pixels and the destination button's label 102: the numbers must wrap inside the button and the
  button must keep the room the window gave it. Pinned in Task 5 (the game's own locations at 146 ×
  262 with the night at 16:00).
- **A door into a bar that closes under the player's hand.** The door's text was read while the bar
  was open; by the press the clock has passed the closing (a test moves it by hand, as a script's
  `onEnter` could). The room shows with its description, and when that closes the closing runs and
  the player is outside. Pinned in Task 6.

## File Structure

| File (under `apps/foam/`)                                       | Responsibility                                                                                                                                      | Task    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `source/game/core/hours.ts`                                     | New. `NIGHT_START`, `NIGHT_END`, `Span`, `isWithin`, `isOpenAt`, `getHoursWords`, `formatTime` (1); `getHoursForms` (5)                             | 1, 5    |
| `source/game/core/night.ts`                                     | `formatStatus` through `formatTime` (1); `PlaceId` holds the ten place ids (3)                                                                      | 1, 3    |
| `source/game/content/data/locations.json`                       | `places.json` moved: no `kind`, `nearestTramStop`, `openingHours`; `hours`; the station's `tramStop`                                                | 2       |
| `source/game/content/data/travel.json`                          | The journeys of the new rule, filled by the script                                                                                                  | 2       |
| `source/game/content/data/README.md`                            | The fields of `locations.json`, the rule for `hours`, the library                                                                                   | 2       |
| `source/game/core/travel.ts`                                    | `LocationEntry`, `LocationData`, `NightStart.locationData` (2); `Destination.location`, `NightStart.locations`, `getLocation`, the arrival rule (3) | 2, 3    |
| `source/game/core/getExpectedJourneys.ts`                       | The journeys between entries, by `tramStop`                                                                                                         | 2       |
| `source/game/core/checkContent.ts`                              | `locationData` and the span rule (2); `Content.locations`, the closing scripts (3); the location rules, the ways out, the check times (4)           | 2, 3, 4 |
| `scripts/fill-travel-data.mjs`                                  | `locations.json`; no nearest stop; `readOpeningHours` through the library; the tram from stop to stop                                               | 2       |
| `scripts/fetch-map-data.mjs`                                    | Reads the positions from `locations.json`                                                                                                           | 2       |
| `scripts/list-stand-ins.mjs`                                    | `locations.json` (2); the subfolders of `content/locations/` (3)                                                                                    | 2, 3    |
| `package.json`                                                  | `opening_hours` as a dev dependency                                                                                                                 | 2       |
| `source/game/core/location.ts`                                  | New. `LocationId`, `Location`                                                                                                                       | 3       |
| `source/game/core/place.ts`                                     | `outdoors`                                                                                                                                          | 3       |
| `source/game/content/locations.ts`                              | New. `locations`, and `places` derived from them                                                                                                    | 3       |
| `source/game/content/locations/*/`                              | New. Seven folders: the place files moved, three new places, seven `location.ts`                                                                    | 3       |
| `source/game/content/places.ts`, `places/`                      | Go                                                                                                                                                  | 3       |
| `source/game/content/hours.ts`                                  | New. `isOpen`                                                                                                                                       | 3       |
| `source/game/content/nightStart.ts`                             | `locationData` (2); `locations`, `places`, `minutes: 960` (3)                                                                                       | 2, 3    |
| `source/game/content/journeys.ts`                               | A journey's text names the location of `night.place`                                                                                                | 3       |
| `source/game/screens/travelWindow.ts`                           | `locationData` (2); opens from a location (3); the hours on the destination button, wrapped (5)                                                     | 2, 3, 5 |
| `source/game/screens/nightScreen.ts`                            | The travel window opened from the place's location, `takeJourney` with the start (3); the closing (6)                                               | 3, 6    |
| `tests/fixedWorld.ts`                                           | `locationData` (2); locations, the bar's pavement, hours and a closing script (3)                                                                   | 2, 3    |
| `tests/nightScreenHelpers.tsx`                                  | `getTravelParts` names the map's buttons `locations`                                                                                                | 3       |
| `docs/direction.md`, `docs/superpowers/specs/…-hours-design.md` | State that the spec is built                                                                                                                        | 7       |

---

### Task 1: The hours of the night

**Files:**

- Create: `source/game/core/hours.ts`
- Modify: `source/game/core/night.ts:41-42,80-87` (`MINUTES_PER_DAY` and the time part of
  `formatStatus` move out)
- Test: `tests/hours.test.ts` (new); `tests/night.test.ts` is unchanged and is the check for
  `formatStatus`

**Interfaces:**

- Consumes: `Night` (a type-only import from `./night.js`).
- Produces, in `core/hours.ts`:

```ts
/** The minute the night starts: Friday 16:00. */
export const NIGHT_START = 960;

/** The minute the night ends: Saturday 08:00. A span's `to` is at most this. */
export const NIGHT_END = 1920;

export type Span = readonly [from: number, to: number];

/** Whether the clock lies in the span: from its start up to, not including, its end. */
export function isWithin(night: Night, span: Span): boolean;

/** Whether a location with these hours is open at the minute; one without hours always is. */
export function isOpenAt(
  hours: ReadonlyArray<readonly number[]> | undefined,
  minutes: number,
): boolean;

/**
 * The hours as the destination button shows them at the minute: "till 03:00" inside a span,
 * "opens 16:30" before a later one, "closed" after the last, and "" without hours.
 */
export function getHoursWords(
  hours: ReadonlyArray<readonly number[]> | undefined,
  minutes: number,
): string;

/** "03:00" for 1620. `formatStatus` uses it. */
export function formatTime(minutes: number): string;
```

`night.ts` imports `formatTime` from `./hours.js`; `formatStatus` becomes
`` `${formatTime(night.minutes)}   ${night.money} Kč   ${getDrunkenness(night).toFixed(1)}` ``, and
`MINUTES_PER_DAY` moves to `hours.ts` with the modulo comment.

Decisions the spec leaves to the plan:

- `hours` is typed `ReadonlyArray<readonly number[]>`, not `readonly Span[]`: `locations.json` types
  its spans as `number[][]`, and the checker holds each to a pair. One private
  `holds(span: readonly number[], minutes: number): boolean` reads a span as
  `let [from = 0, to = 0] = span;` and returns `minutes >= from && minutes < to`; `isWithin` and
  `isOpenAt` both go through it, and `isOpenAt` is `hours === undefined || hours.some(…)`.
- `getHoursWords`: `''` for `undefined`; the span that holds the minute gives
  `` `till ${formatTime(to)}` ``; otherwise the first span whose `from` is above the minute gives
  `` `opens ${formatTime(from)}` ``; otherwise `'closed'`. The spans are in order (the checker's
  rule), so the first later span is the next opening.

- [ ] **Step 1: Write the failing tests**

`tests/hours.test.ts`:

- `describe(isWithin)`: `holds from the start of the span up to but not including its end`: with
  `GUITARIST = [1320, 1500]` and a night from
  `createNight({place: 'rotorBar', minutes, money: 350})` at 1319 → false, 1320 → true, 1499 → true,
  1500 → false.
- `describe(isOpenAt)`: `is always open without hours`: `isOpenAt(undefined, 0)` and
  `isOpenAt(undefined, 2000)` are true; `is never open with no spans`: `isOpenAt([], 1000)` is
  false; `with one span, is open from its start up to its end`: `[[960, 1620]]` at 959 false, 960
  true, 1619 true, 1620 false; `with two spans, is open in either and closed between them`:
  `[[960, 1380], [1410, 1920]]` at 1379 true, 1380 false, 1409 false, 1410 true, 1919 true, 1920
  false.
- `describe(getHoursWords)`: `says till the end of the span the minute lies in`: `[[960, 1620]]` at
  1000 → `'till 03:00'`; `[[960, 1380], [1410, 1920]]` at 1500 → `'till 08:00'`;
  `says opens before a later span`: `[[990, 1260]]` at 960 → `'opens 16:30'`;
  `[[960, 1380], [1410, 1920]]` at 1390 → `'opens 23:30'`;
  `says closed after the last span, from the exact minute of the closing`: `[[960, 1620]]` at 1620 →
  `'closed'` and at 1700 → `'closed'`; `[[990, 1260]]` at 1260 → `'closed'`;
  `says nothing without hours`: `undefined` at 1000 → `''`.
- `describe(formatTime)`: `pads hours and minutes to two digits`: 545 → `'09:05'`, 960 → `'16:00'`;
  `wraps past midnight`: 1440 → `'00:00'`, 1620 → `'03:00'`, 1920 → `'08:00'`.

Run: `npx vitest run --project unit tests/hours.test.ts` Expected: FAIL, module not found.

- [ ] **Step 2: Implement `hours.ts` and switch `formatStatus` over**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/hours.ts source/game/core/night.ts tests/hours.test.ts
npx vitest run --project unit tests/hours.test.ts tests/night.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/hours.ts source/game/core/night.ts tests/hours.test.ts
git commit -m "Read the spans of the night and format its clock"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 2: The data of the locations and the scripts that fill it

**Files:**

- Rename (`git mv`): `source/game/content/data/places.json` →
  `source/game/content/data/locations.json`
- Modify: `source/game/content/data/locations.json`, `source/game/content/data/travel.json`,
  `source/game/content/data/README.md`, `package.json`, `source/game/core/travel.ts:6-20,41-46`,
  `source/game/core/getExpectedJourneys.ts`, `source/game/core/checkContent.ts:10-18,22-23,264-302`,
  `source/game/content/nightStart.ts`,
  `source/game/screens/travelWindow.ts:30-35,290-301,372,739-743`, `scripts/fill-travel-data.mjs`,
  `scripts/fetch-map-data.mjs:1-5,14-16,135-140,243`, `scripts/list-stand-ins.mjs:54,69`
- Test: `tests/getExpectedJourneys.test.ts`, `tests/fillTravelData.test.ts`,
  `tests/fetchMapData.test.ts:15-18`, `tests/checkContent.test.ts:9,41-49,72,89-99,193-226`,
  `tests/content.test.ts:4,37,61`, `tests/travel.test.ts:17`,
  `tests/fixedWorld.ts:8-14,309-314,327-335`,
  `tests/travelWindow.browser.test.ts:5,21,24,295-298,865-866,955-960`

**Interfaces:**

- Consumes: `NIGHT_START`, `NIGHT_END` (Task 1).
- Produces, in `core/travel.ts`, replacing `PlaceEntry` and `PlaceData`:

```ts
/**
 * An entry of `locations.json`. `hours` is `number[][]` so the JSON import fits; the checker holds
 * each span to a pair of the night.
 */
export type LocationEntry = {
  address?: string;
  station?: string;

  /** The stop's name in OpenStreetMap. A location with it is a tram stop. */
  tramStop?: string;
  osmName?: string;
  position?: Position;

  /** The spans in which it is open, in night minutes. Absent: it never closes. */
  hours?: number[][];
  computed?: boolean;
};

/** The content of `locations.json`: its entries by location id. */
export type LocationData = Readonly<Record<string, LocationEntry>>;
```

`NightStart.placeData` becomes `locationData: LocationData`, documented
``/** The content of `locations.json`: the positions and the hours of the locations. */``.
`Content.placeData` becomes `locationData`. The places stay places in this task; the entries of
`locations.json` are keyed by the ids the locations will have, which are today's place ids.

`getExpectedJourneys(entries: Readonly<Record<string, {tramStop?: string}>>): ExpectedJourney[]`:
walk and taxi from every entry to every other, the tram from every entry with `tramStop` to every
other with it; the order stays from, then way (`walk`, `tram`, `taxi`), then to, in the order of the
entries. Its doc comment says so; it still imports nothing.

In `scripts/fill-travel-data.mjs`: `Lookups` loses `findTramStops`;
`export function readOpeningHours(tag)` returns the spans (`number[][]`) a tag gives for the night,
or throws what the library throws on a tag it cannot read;
`fillTravelData({locations, travel, lookups})` returns `{locations, travel, added, missing}`; its
lines start with `locations.json`.

The checker's data lines: `locations.json: no entry for "rotorBar"`,
`locations.json: "nowhere" is not a location`,
`locations.json › zidenice: no position; run the fill script`,
`locations.json › rotorBar › hours: [1620, 960] is not a span of the night`,
`locations.json › rotorBar › hours: [1200, 1300] is not after [960, 1200]`; the `kind` lines go.

Decisions the spec leaves to the plan:

- The spans of a tag are read for Friday 2026-10-09, a Friday with no Czech public holiday on it or
  on the Saturday after it, in the process's local time: `new Date(2026, 9, 9, 16)` to
  `new Date(2026, 9, 10, 8)`; a minute is `Math.round((date - midnight) / 60_000)` with
  `midnight = new Date(2026, 9, 9)`. The library is given
  `{lat: 49.19, lon: 16.61, address: {country_code: 'cz', state: 'Jihomoravský kraj'}}` as its
  nominatim object. Two intervals that touch (one ends where the next starts) are joined into one
  span, so the result is always "in order and apart" as the checker demands. The library may throw a
  string, not an `Error`; the script catches whatever comes, inside `ask`, which lists the line as
  missing.
- The span rule, in the checker: for each span of an entry's `hours`, with `[from, to] = span`, a
  span is of the night when `span.length === 2`, both are whole numbers, `from >= NIGHT_START`,
  `from < to` and `to <= NIGHT_END`; otherwise the line `… is not a span of the night`, the span
  printed as `` `[${span.join(', ')}]` ``. A span whose `from` is not above the previous span's `to`
  gives `… is not after …` with both printed the same way.

- [ ] **Step 1: Add the library and install it**

In `package.json`, add `"opening_hours": "^3.15.0"` to `devDependencies` (between `fast-png` and
`playwright`). Run `npm install` from the repository root, then `git diff --stat package-lock.json`:
the lockfile gains the entries of `opening_hours`, `i18next` and `suncalc` and loses nothing (an
install that changes other packages is reverted with `git checkout package-lock.json` and reported).
Go on once `node -e "import('opening_hours').then(() => console.log('ok'))"` prints `ok` from
`apps/foam`.

- [ ] **Step 2: Move the data by hand**

`git mv source/game/content/data/places.json source/game/content/data/locations.json`, then edit
`locations.json`: every entry loses `kind` and `nearestTramStop`; `whiskyShop` loses `openingHours`
and gains `"hours": [[990, 1260]]`; `rotorBar` loses `openingHours` and gains
`"hours": [[960, 1620]]`; `hlavniNadrazi` gains `"tramStop": "Hlavní nádraží"` after `station`.
Positions and `computed` stay. In `travel.json`, delete the `tram` objects of `hlavniNadrazi`,
`whiskyShop`, `rotorBar` and `zidenice` (six journeys); the two stops keep theirs.

- [ ] **Step 3: Write the failing tests**

`tests/getExpectedJourneys.test.ts`:
`ENTRIES = {bar: {}, station: {tramStop: 'Main'}, north: {tramStop: 'North'}, south: {tramStop: 'South'}}`;
`returns the journeys the data has to hold, in order` expects, in this order: `bar walk station`,
`bar walk north`, `bar walk south`, `bar taxi station`, `bar taxi north`, `bar taxi south`,
`station walk bar`, `station walk north`, `station walk south`, `station tram north`,
`station tram south`, `station taxi bar`, `station taxi north`, `station taxi south`,
`north walk bar`, `north walk station`, `north walk south`, `north tram station`,
`north tram south`, `north taxi bar`, `north taxi station`, `north taxi south`, `south walk bar`,
`south walk station`, `south walk north`, `south tram station`, `south tram north`,
`south taxi bar`, `south taxi station`, `south taxi north`. The second test becomes
`an entry without a tramStop has no tram journey, to or from`: no line of `format(ENTRIES)` that
contains `tram` contains `bar`.

`tests/fillTravelData.test.ts`: `createLookups` loses `findTramStops`; the entries lose `kind` and
`nearestTramStop` everywhere; the lines read `locations.json › …`; the result is `result.locations`.

- `takes the mean of the points as a missing position`: `{stop: {tramStop: 'A'}}` gives
  `{tramStop: 'A', position: {latitude: 49.100_02, longitude: 16.500_02}, computed: true}`.
- The nearest-stop test goes.
- `turns the opening hours of the nearest thing within 150 m into spans`: `findNamed` answers
  `[{position: at(200), openingHours: '24/7'}, {position: at(100), openingHours: 'Mo-Su 16:30-21:00'}]`
  for `{bar: {osmName: 'Bar', position: BRNO}}`: `hours` is `[[990, 1260]]`, `computed` true, and
  `added` contains `locations.json › bar › hours`; with only the thing at 200 m, `hours` is
  undefined and `missing` contains `locations.json › bar › hours`.
- `lists a tag the library cannot read as missing`: `findNamed` answers
  `[{position: BRNO, openingHours: 'nonsense'}]`: the entry is unchanged (`toEqual` the input) and
  `missing` contains `locations.json › bar › hours`.
- `computes walking and taxi journeys from routes, and the tram from stop to stop without a lookup`:
  entries `{one: {position: a}, x: {tramStop: 'X', position: a}, y: {tramStop: 'Y', position: b}}`
  with today's `a`, `b` and `route`: `one.walk.x` is `{minutes: 25, computed: true}`, `one.taxi.x`
  is `{minutes: 15, price: 200, computed: true}`, `x.tram.y` is
  `{minutes: 22, price: 25, computed: true}` (`getTramJourney(0, getDistance(a, b))`), `one.tram` is
  undefined, `x.tram.one` is undefined, `route` was called 12 times, and `getCalls(lookups)` equals
  `route.mock.calls.length`.
- `keeps the values that are there`: `one` has `osmName: 'One'`, `position`, `hours: [[960, 1200]]`;
  `two` has `position`; travel as today: nothing added, nothing missing, no lookup called.
- `lists a rejected position, goes on, and lists the journeys that need it`: entries
  `{one: {address: 'A 1'}, two: {address: 'B 2'}}`; the expectations as today, with
  `result.locations`.
- `does not change its input` and `asks one thing at a time`: the entries lose `kind`; the lookups
  of the second lose `findTramStops`.
- New `describe(readOpeningHours)`:
  `reads a Friday night from the tag, past midnight into Saturday`:
  `'Mo-Th 16:00-01:00, Fr 16:00-03:00, Sa 17:00-03:00'` → `[[960, 1620]]`; `'Mo-Su 16:30-21:00'` →
  `[[990, 1260]]`; `'24/7'` → `[[960, 1920]]`;
  `gives one span for each stretch of the night, and none for a day shift`:
  `'Fr 16:00-20:00; Sa 00:00-03:00'` → `[[960, 1200], [1440, 1620]]`; `'Mo-Th 10:00-12:00'` → `[]`;
  `reads a public holiday rule for a Friday that is none`: `'Mo-Su 10:00-02:00; PH off'` →
  `[[960, 1560]]`; `throws on a tag it cannot read`:
  `expect(() => readOpeningHours('nonsense')).toThrow()`. These values are what the library's
  documentation implies; the test is the proof. A value that comes out otherwise is read by hand
  against the tag before the expectation moves.

`tests/fetchMapData.test.ts:15-18`: the two entries lose `kind`.

`tests/checkContent.test.ts`: `PlaceData` → `LocationData`; the fixture becomes
`locationData = {zidenice: {position}, rotorBar: {position, hours: [[960, 1620]]}, namestiRepubliky: {tramStop: 'Náměstí Republiky', position}}`;
`check` takes `locationData`; the lines of `reports a place without an entry, but not the train`,
`reports an entry without a place` (now `… is not a location`) and
`reports an entry without a position` read `locations.json`; the `kind` test goes; new
`reports a span that is not of the night, and one that is not after the span before it`: with
`rotorBar.hours = [[1620, 960], [900, 1000], [960, 1921], [960]]` the lines contain
`locations.json › rotorBar › hours: [1620, 960] is not a span of the night`,
`… [900, 1000] is not a span of the night`, `… [960, 1921] is not a span of the night` and
`… [960] is not a span of the night`; with `[[960, 1200], [1200, 1300]]` they contain
`locations.json › rotorBar › hours: [1200, 1300] is not after [960, 1200]`.

`tests/content.test.ts`: imports `locationData` from `../source/game/content/data/locations.json`,
passes it to `checkContent` and expects `nightStart.locationData` to be it. `tests/travel.test.ts`:
`locationData: {}`. `tests/fixedWorld.ts`: `fixedLocationData: LocationData` with
`[FIXED_BAR]: {position: at(-300, -200)}`, `[FIXED_SQUARE]: {position: at(300, -200)}`,
`[FIXED_STOP]: {tramStop: 'The stop', position: at(0, 300)}`, and `fixedStart.locationData`.
`tests/travelWindow.browser.test.ts`: the import is `locationData` from `locations.json`, the type
`LocationData`, `fixedLocationData`, `start.locationData` in `getLight`, and the two starts built
with `locationData`.

Run:
`npx vitest run --project unit tests/getExpectedJourneys.test.ts tests/fillTravelData.test.ts tests/checkContent.test.ts`
Expected: FAIL (the old rule's order, `findTramStops` called, `places.json` in the lines).

- [ ] **Step 4: Implement the types, the rule, the checker's data rules and the scripts**

As in Interfaces and the decisions. `fill-travel-data.mjs`: the header comment names
`locations.json` and the hours; the `Lookups` typedef drops `findTramStops`; the position query
order stays `address`, `station`, `tramStop`; the nearest-stop block goes; the hours block runs for
an entry with `osmName`, a `position` and no `hours`, asks `findNamed` as today, takes the nearest
thing within `OPENING_HOURS_RADIUS` that has `openingHours`, converts its tag with
`readOpeningHours` inside the `ask` callback, and writes `entry.hours` with `computed: true`; a tram
journey between two entries with `tramStop` is
`getTramJourney(0, getDistance(start.position, end.position))`; `realLookups.findTramStops` goes;
the main block reads and writes `locations.json`. `fetch-map-data.mjs`: the header comment, the
`LocationData` typedef, the parameter `locations` and the file name. `list-stand-ins.mjs`:
`readJson('locations.json')` and `Locations not checked:`. `travelWindow.ts`: `LocationData`,
`start.locationData`. `nightStart.ts`: `import locationData from './data/locations.json'` and the
field.

`README.md`: `locations.json` holds one entry per location on the map (the train has none), by
location id. The field table: `address`, `station`, `tramStop` (the author; the stop's name in
OpenStreetMap; a location with it is a tram stop, and a tram ride goes from stop to stop), `osmName`
(the author, optional, for the hours), `position` (the script), `hours` (either: the spans of the
Friday night in which it is open, in night minutes from 16:00 = 960 to 08:00 = 1920, the end of a
span excluded, as `[[960, 1620]]`; no `hours` means it never closes; the script converts
OpenStreetMap's `opening_hours` tag through the `opening_hours` library for a Friday with no public
holiday, and a tag it cannot read is listed for the author to write by hand), `computed` (the
script). The `nearestTramStop` and `openingHours` rows go. The sources paragraph: positions, hours
and routes.

- [ ] **Step 5: Fill the journeys from OpenStreetMap**

Run: `node scripts/fill-travel-data.mjs` Expected: `Added travel.json › …` for 24 journeys (the
station by tram to both stops, both stops by tram to the station, and the 20 on foot and by taxi
between the four other locations and the stops and between the stops), nothing missing, exit 0. A
busy server ends the run with missing lines and exit code 1: wait a minute and run it again, at most
five times; if lines are still missing, stop and report them. Then run it again: it prints nothing
and `git diff --exit-code source/game/content/data` after that run shows only the changes of this
task. `node scripts/list-stand-ins.mjs` prints `Locations not checked:   6 of 6` and
`Journeys not checked: 66 of 66`.

- [ ] **Step 6: Check and commit**

```bash
npx prettier --write source/game/core source/game/content scripts tests package.json
npx vitest run --project unit
npx vitest run --project browser tests/travelWindow.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add package.json ../../package-lock.json source/game/core source/game/content scripts tests
git commit -m "Keep the locations' data with their hours and the journeys of the new rule"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 3: Locations: the model, the content and the fixed world

**Files:**

- Create: `source/game/core/location.ts`, `source/game/content/locations.ts`,
  `source/game/content/hours.ts`, and under `source/game/content/locations/`: `train/location.ts`,
  `zidenice/location.ts`, `hlavniNadrazi/location.ts`, `hlavniNadrazi/forecourt.ts`,
  `whiskyShop/location.ts`, `whiskyShop/street.ts`, `rotorBar/location.ts`, `rotorBar/street.ts`,
  `namestiRepubliky/location.ts`, `malinovskehoNamesti/location.ts`
- Rename (`git mv`, so the history follows): `content/places/train.ts` →
  `content/locations/train/train.ts`; `places/zidenice.ts` → `locations/zidenice/zidenice.ts`;
  `places/hlavniNadrazi.ts` → `locations/hlavniNadrazi/hall.ts`; `places/whiskyShop.ts` →
  `locations/whiskyShop/room.ts`; `places/rotorBar.ts` → `locations/rotorBar/room.ts`;
  `places/namestiRepubliky.ts` → `locations/namestiRepubliky/stop.ts`;
  `places/malinovskehoNamesti.ts` → `locations/malinovskehoNamesti/stop.ts`
- Delete: `source/game/content/places.ts`
- Modify: `source/game/core/place.ts`, `source/game/core/night.ts:1-8`,
  `source/game/core/travel.ts`, `source/game/core/checkContent.ts`,
  `source/game/content/nightStart.ts`, `source/game/content/journeys.ts`,
  `source/game/screens/travelWindow.ts`, `source/game/screens/nightScreen.ts:440-479,485-495`,
  `scripts/list-stand-ins.mjs`
- Test: `tests/travel.test.ts`, `tests/checkContent.test.ts`, `tests/content.test.ts`,
  `tests/getJumpIn.test.ts`, `tests/listStandIns.test.ts`, `tests/fixedWorld.ts`,
  `tests/nightScreenHelpers.tsx:477-563`, `tests/nightScreen.browser.test.ts` (no change expected),
  `tests/nightScreenNarrow.browser.test.ts:265-269`, `tests/nightScreenPlaces.browser.test.ts`,
  `tests/travelWindow.browser.test.ts`, `tests/jumpIn.browser.test.ts:30,53`,
  `tests/mainMenu.browser.test.tsx:552-564`

**Interfaces:**

- Consumes: `isOpenAt`, `Span`, `isWithin` (Task 1); `LocationEntry`, `LocationData` (Task 2);
  `defineScript`, `createWayOut`, `standIn`.
- Produces:
  - `core/location.ts`: `LocationId` and `Location`, exactly the spec's block with its doc comments.
  - `core/place.ts`: `Place` gains `outdoors: boolean`, documented
    `/** Whether the place is outdoors: walk and taxi are offered only outdoors, and a location closes only on a player indoors. */`,
    after `shortName`.
  - `core/night.ts`: `PlaceId` is the union of the ten ids of the spec's table, sorted.
  - `core/travel.ts`:
    `Destination = {location: Location; way: Way; minutes: number; price: number}`; `NightStart`
    gains `locations: Readonly<Record<string, Location>>`
    (`/** The locations of the night, by id. */`) before `places`, whose comment becomes
    `/** The places of every location, by id; content/locations.ts derives them once. */`;
    `getLocation(start: NightStart, place: PlaceId): Location | undefined`
    (`/** The location whose places hold the place. It searches start.locations, so a test that writes into nightStart is seen. */`);
    `getDestinations(start: NightStart, from: LocationId, way: Way): Destination[]`
    (`start.locations[to]`; the warning reads `No location "${to}" for the journey …`; the sort is
    by minutes, then `location.name`);
    `takeJourney(start: NightStart, night: Night, destination: Destination): void` exactly the
    spec's block.
  - `content/locations.ts`: `export const locations: Record<LocationId, Location>` and
    `export const places: Readonly<Record<string, Place>>`, the latter
    `Object.fromEntries(Object.values(locations).flatMap((location) => location.places.map((place) => [place.id, place])))`.
  - `content/hours.ts`: `export function isOpen(night: Night, location: LocationId): boolean` with
    the spec's doc comment; it imports `./data/locations.json` into a
    `const locationData: LocationData` (the JSON's own type has no key for the train) and returns
    `isOpenAt(locationData[location]?.hours, night.minutes)`. It never imports `nightStart`.
  - A place file exports its place under its place id (`train`, `zidenice`, `hlavniNadraziHall`,
    `hlavniNadraziForecourt`, `whiskyShopRoom`, `whiskyShopStreet`, `rotorBarRoom`,
    `rotorBarStreet`, `namestiRepubliky`, `malinovskehoNamesti`); a `location.ts` exports its
    location under its location id. Where the two ids are one word (the train, Židenice, the two
    stops), `location.ts` imports the place as `import {train as place} from './train.js'`.
  - `nightStart`:
    `{locations, places, locationData, travel, map, place: 'train', minutes: 960, money: 350}`.
  - `tests/fixedWorld.ts` exports `FIXED_PAVEMENT = 'testPavement' as PlaceId` beside the four place
    ids, `FIXED_BAR_LOCATION = 'testBar' as LocationId`, `FIXED_SQUARE_LOCATION`,
    `FIXED_STOP_LOCATION` and `FIXED_BROKEN_LOCATION` (the same strings as the places), and
    `fixedLocations: Record<string, Location>`; `fixedStart` gains `locations`.
  - `tests/nightScreenHelpers.tsx`: `getTravelParts` returns `allLocations` and `locations` in place
    of `allPlaces` and `places`; its comment names the locations.

The content, in the spec's table; new texts below are the stand-in, written with `standIn` and
wrapped as the files wrap today. The rooms keep `barPicture`; the hall, the stops, the train and the
three new places `standInPicture`. Indoors: the train, the hall, the two rooms; every other place is
outdoors. The header comment of a moved file stays.

- **The train** (`train/train.ts`): as today; the door's `hlavniNadrazi` node sets
  `night.place = 'hlavniNadraziHall'`.
- **Brno-Židenice** (`zidenice/zidenice.ts`): as today; the underpass is
  ``createWayOut({…, text: standIn`The stairs lead down and out to the street.`, ways: ['walk', 'taxi']})``.
- **The hall** (`hlavniNadrazi/hall.ts`): today's place with `id: 'hlavniNadraziHall'`; the board
  and the hall as today; `doors` becomes `defineScript` with one node, speaker `DOORS`, text
  `The doors slide apart, and the cold of the forecourt comes in.`, and one choice
  `{text: 'Go out', onChoose: (night) => { night.place = 'hlavniNadraziForecourt'; }}`.
- **Nádražní** (`hlavniNadrazi/forecourt.ts`): `id: 'hlavniNadraziForecourt'`, `name: 'Nádražní'`.
  Description, speaker `Nádražní`:
  `The forecourt is a strip of wet paving between the station and the tram stop, with a line of taxis idling at the kerb. Trams pull in and out under the wires, and everybody here is on the way somewhere else.`
  "The doors" (0.3, 0.3):
  `The doors slide apart, and the warmth and the noise of the hall come out to meet you.`, one
  choice `Go in` to `hlavniNadraziHall`. "A stranger" (0.7, 0.55), `start: 'stranger'`:
  `A man in a thin jacket steps up and asks for twenty crowns for a ticket home. He has asked everybody else already.`
  with `{text: 'Give some change', price: 20, next: 'given'}` and `{text: 'Walk on'}`; `given`,
  speaker `A stranger`:
  `He takes the coins without looking at them and is gone before you can change your mind.` "The
  street" (0.5, 0.8): `createWayOut` with
  `The street runs past the stop in both directions, and the taxis wait at the kerb.`, ways
  `['walk', 'tram', 'taxi']`.
- **The Whisky Shop's room** (`whiskyShop/room.ts`): today's place with `id: 'whiskyShopRoom'`; the
  shelves, the shopkeeper and the regulars as today; the door is one node, speaker `DOOR`,
  `The door opens onto Vranovská, and the cold comes in with the sound of a tram.`, one choice
  `Go out` to `whiskyShopStreet`.
- **Vranovská** (`whiskyShop/street.ts`): `id: 'whiskyShopStreet'`, `name: 'Vranovská'`.
  Description, speaker `Vranovská`:
  `Vranovská is a long street of old houses in Husovice, with the tram line down the middle and a few shop windows still lit. The wind comes straight along it from the river.`
  "The Whisky Shop" (0.3, 0.3),
  `start: (night) => isOpen(night, 'whiskyShop') ? 'open' : night.minutes < 990 ? 'early' : 'locked'`
  as the spec writes it, speaker `The Whisky Shop` on all three: `open`,
  `Warm light and the smell of oak come through the door whenever somebody opens it.`, choices
  `Go in` to `whiskyShopRoom` and `{text: 'Stay outside'}`; `early`,
  `The door is locked, and a card on the glass gives the hours: half past four until nine. Somebody is wiping the counter inside.`,
  choices
  `{text: 'Wait a while', minutes: 10, next: (night) => (isOpen(night, 'whiskyShop') ? 'open' : 'early')}`
  and `{text: 'Leave it'}`; `locked`,
  `The door is locked, and the shelves stand dark behind the glass. The card gives the hours: half past four until nine.`
  "The window" (0.7, 0.55):
  `Bottles stand lit in the shop window, each turned so that its label faces the street. One of them costs more than your whole night.`
  "The street" (0.5, 0.8): `createWayOut` with
  `The street runs on under the tram wires, and the lit windows thin out towards the river.`, ways
  `['walk', 'taxi']`.
- **Rotor Bar's room** (`rotorBar/room.ts`): today's place with `id: 'rotorBarRoom'`; the bar as
  today; the smokers go to Dvořákova; the corner table gains the guitarist:
  `const GUITARIST: Span = [1320, 1500];`,
  `start: (night) => (isWithin(night, GUITARIST) ? 'guitarist' : 'table')`, and two nodes with
  speaker `TABLE`: `guitarist`,
  `A man with a guitar has the corner table to himself and plays to nobody in particular, songs that everybody half knows. His case lies on the spare chair.`,
  choices `{text: 'Ask for a song', minutes: 10, next: 'song'}` and `{text: 'Leave him to it'}`;
  `song`,
  `He nods, finds the chords and plays it through, a little slower than you remember it. The next table sings the last verse with him.`;
  `table`, `welcomed`, `brushedOff` and `spilled` as today. The door is the spec's example: speaker
  `DOOR`, `The door lets in the cold and the sound of a tram in Dvořákova street.`, one choice
  `Go out` to `rotorBarStreet`. Spots: the bar (0.22, 0.51), the table (0.7, 0.84), the door (0.91,
  0.4).
- **Dvořákova** (`rotorBar/street.ts`): `id: 'rotorBarStreet'`, `name: 'Dvořákova'`. Description,
  speaker `Dvořákova`:
  `Dvořákova is a short street in the centre, lit by the sign over the bar and the shelter of a tram stop at the corner. A few people stand about in the cold with their glasses.`
  "Rotor Bar" (0.3, 0.3): the spec's example,
  `start: (night) => (isOpen(night, 'rotorBar') ? 'open' : 'locked')`, speaker `Rotor Bar`, the
  spec's two texts, `open` with `Go in` to `rotorBarRoom` and `{text: 'Stay outside'}`. "The
  smokers" (0.7, 0.55): today's script with `Leave them to it` in place of `Go back in`. "The
  street" (0.5, 0.8): `createWayOut` with
  `The street runs out to the square at one end and down towards the station at the other.`, ways
  `['walk', 'taxi']`.
- **The stops** (`namestiRepubliky/stop.ts`, `malinovskehoNamesti/stop.ts`): as today.
- **The locations** (`*/location.ts`): the spec's table; Rotor Bar's `closing` is the spec's
  example; the Whisky Shop's, speaker `Closing time`:
  `The shopkeeper counts the till and looks at you over his glasses until you understand. He holds the door, and the lock turns behind you.`
  The five others have no `outside` and no `closing`.
- **`journeys.ts`**: `getDestination` returns
  `getLocation(nightStart, night.place)?.name ?? 'the next place'`.

The screens, as far as the model needs (the hours on the button are Task 5, the closing Task 6):

- `travelWindow.ts`: `TravelJourney.from: LocationId`; `#from: LocationId | null`; `MapPlace`
  becomes `MapLocation`, `#places` `#locations` (the entries of `locationData` with a position whose
  id is in `start.locations`), `#placeButtons` `#locationButtons`, `#createPlaceButtons`
  `#createLocationButtons`, `#placeButtonCorners` `#locationButtonCorners`, `#selectPlace`
  `#selectLocation`; `#roomDestinations` from `Object.values(start.locations)`;
  `destination.location.name` and `.id`; the warning
  `No position for "${location.id}": it has no button on the map.` The comments say location where
  they said place.
- `nightScreen.ts`: a module function `getLocationOf(place: Place): Location` that returns
  `getLocation(nightStart, place.id)` or throws
  ``new Error(`The place "${place.id}" is in no location!`)`` (the checker holds every place to one;
  the error screen shows the impossible); `openTravel(screen, from: LocationId, …)`; `actOnNight`
  opens the travel window with `getLocationOf(place).id`; `createTravelWindow`'s `onClosed` calls
  `takeJourney(nightStart, screen.contents.night, destination)`.

The checker, as far as the model needs (the new rules are Task 4): `Content` becomes
`{locations, places, journeys, locationData, travel, map}`; the check nights are still one per place
of `content.places` at `CHECK_MINUTES`; each location with a `closing` is checked with
``checkScript(`${id}${SEPARATOR}closing`, location.closing)``; the entry rules run over the ids of
`content.locations` (`OFF_THE_MAP` holds the train's location id) and an entry whose id is in no
location gives `… is not a location`.

The fixed world (`tests/fixedWorld.ts`):

- The bar's door keeps its three choices; the first becomes
  `{text: 'Go out', onChoose: (night) => { night.place = FIXED_PAVEMENT; }, next: 'outside'}`, and
  the `outside` node's text becomes
  `'The cold wakes you at once. You stand a minute under the sign and breathe.'` (a test taps that
  choice and reads the node after it).
- A new place `testPavement`: `id: FIXED_PAVEMENT`, `name: 'The pavement'`, `outdoors: true`,
  `PROOF_PICTURE`; description, speaker `The pavement`:
  `'The pavement outside the bar is narrow and wet, and the sign over the door hums to itself. A taxi idles at the corner with its light on.'`;
  a spot `The bar` (0.3, 0.3) whose script is
  `start: (night) => (isOpenAt(fixedLocationData[FIXED_BAR_LOCATION]?.hours, night.minutes) ? 'open' : 'locked')`
  with `open` (speaker `The bar`,
  `'Warm air and the radio come out whenever somebody opens the door.'`, choices
  `{text: 'Go in', onChoose: (night) => { night.place = FIXED_BAR; }}` and `{text: 'Stay outside'}`)
  and `locked` (`'The door is locked, and the chairs stand on the tables behind the glass.'`); a
  spot `The street` (0.5, 0.8), `createWayOut` with `'The street runs off towards the square.'` and
  ways `['walk', 'taxi']`.
- `outdoors`: the bar false; the pavement, the square, the stop and the broken place true.
- `fixedLocations`:
  `[FIXED_BAR_LOCATION]: {id, name: BAR_NAME, places: [testBar, testPavement], arrival: FIXED_BAR, outside: FIXED_PAVEMENT, closing}`
  with `closing` a `defineScript` of one node, speaker `Closing time`,
  `'The radio goes off and the lights come up, and the bartender holds the door for you without a word.'`;
  the square, the stop and the broken place each `{id, name, places: [place], arrival}`.
  `fixedPlaces` gains `[FIXED_PAVEMENT]: testPavement`.
- `fixedLocationData[FIXED_BAR_LOCATION]` gains `hours: [[960, 1380], [1410, 1920]]` (closed from
  23:00 to 23:30; the night starts at 19:40 and the tests stay before 23:00 unless they move the
  clock).
- `fixedTravel`: the bar's and the square's `tram` go; the rest stays (the tram only from the stop,
  which reaches no other stop).
- `fixedStart`: `locations: fixedLocations` before `places`.

`scripts/list-stand-ins.mjs`: reads `content/locations/` with `readdir(…, {withFileTypes: true})`,
takes each folder in sorted order and each `.ts` file in it in sorted order, named
`` `${folder}/${file}` ``; then `journeys.ts`; `NAME_WIDTH` becomes 34 (the longest name is
`malinovskehoNamesti/location.ts`, 31). The header comment names the location folders.

- [ ] **Step 1: Write the failing unit tests**

`tests/travel.test.ts`, rewritten: `createPlace(id, name)` gains `outdoors: true`;
`createLocation(id: LocationId, name: string, places: Place[], arrival: PlaceId, outside?: PlaceId): Location`;
`START` has `locations` `rotorBar` ("Alpha", places `rotorBarRoom` and `rotorBarStreet`, arrival the
room, outside the street), `zidenice` ("Beta", one place), `hlavniNadrazi` ("Gamma", the hall and
the forecourt, arrival the forecourt); `places` derived from them as `content/locations.ts` does;
`locationData: {rotorBar: {hours: [[960, 1620]]}}`; today's `travel`.

- `describe(getDestinations)`:
  `by walk it gives the nearest location first, then by name, and warns once` (ids
  `['zidenice', 'rotorBar', 'hlavniNadrazi']`, prices `[0, 0, 0]`, the warning contains `nowhere`);
  `by tram it gives nothing, and from a location without travel too`.
- `describe(takeJourney)`: `arrives at the arrival while the location is open`: the taxi at 1180 →
  minutes 1191, money 180, place `rotorBarRoom`;
  `arrives outside while closed, at the exact minute of the closing and before the opening`: at 1609
  the taxi lands at 1620 on `rotorBarStreet`; at 940 (a jump-in before the night) at 951 on
  `rotorBarStreet`; `arrives at the arrival of a location without hours`: the walk to
  `hlavniNadrazi` ends on `hlavniNadraziForecourt`;
  `reads the hours at the minute of arrival, not of departure`: at 1615 (open) the taxi lands at
  1626 on `rotorBarStreet`.
- `describe(getLocation)`: `finds the location of a place`: `getLocation(START, 'rotorBarStreet')`
  is `START.locations.rotorBar`; `gives undefined for a place in no location`:
  `getLocation(START, 'whiskyShopRoom')` is undefined.

`tests/checkContent.test.ts`: `createPlace(id, name, outdoors, shortName?)`; the places are `train`
(indoors), `zidenice`, `rotorBarRoom` ("Rotor Bar", indoors), `rotorBarStreet` ("Dvořákova"),
`namestiRepubliky` (short name as today); `locations: Record<string, Location>` with `train`,
`zidenice`, `rotorBar` (the room and the street, arrival the room, outside the street,
`closing: oneNode('Closing.', 'Closing time')`) and `namestiRepubliky`; `check` takes `locations`;
`withZidenice` stays. New: `reports a fault of a closing script`:
`locations: {...locations, rotorBar: {...locations.rotorBar!, closing: oneNode('Closing.', '')}}`
gives `rotorBar › closing › start: no speaker`. The text-function test counts `5 * 3` calls (five
places, three levels, one time; Task 4 raises it).

`tests/content.test.ts`: imports `locations`, `places` from `../source/game/content/locations.js`
and `Dialogue` from `tellurion`; a helper `getPlace(id: PlaceId): Place` that throws when
`places[id]` is undefined, and `getSpotScript(place: Place, label: string)` likewise.

- `the game's content has no problem`:
  `checkContent({locations, places, journeys, locationData, travel, map})` is `[]`.
- `locations holds the seven locations, each with the places of the spec`: for each id of the spec's
  table, `locations[id].id` is the id and `locations[id].places.map((place) => place.id)` is the
  spec's list (`hlavniNadrazi` → `['hlavniNadraziHall', 'hlavniNadraziForecourt']`, and so on);
  `arrival` and `outside` as the table; `whiskyShop` and `rotorBar` have a `closing`, the others
  none.
- `places holds the ten places by their ids` (the sorted list of the spec's table, and
  `place.id === id`); the overlap test runs over `Object.values(places)` as today.
- `a night starts on the train at 16:00 with 350 Kč`: `minutes` 960; `nightStart.locations`,
  `places` and `locationData` are the imported objects.
- `the train's door leads to the hall`: a `Dialogue` on the train's `The door` script with
  `createNight({place: 'train', minutes: 960, money: 350})`: `advance()`, `choose(1)`; `night.place`
  is `'hlavniNadraziHall'`.
- `Vranovská's door waits before the opening, opens at 16:30 and is locked from 21:00`: a `Dialogue`
  on `whiskyShopStreet`'s `The Whisky Shop` script at 980:
  `visibleChoices.map((choice) => choice.text)` is `['Wait a while', 'Leave it']`; `advance()` then
  `choose(0)`: the night is at 990 and the choices are `['Go in', 'Stay outside']`; a fresh dialogue
  at 990 and one at 1259 offer `['Go in', 'Stay outside']`; one at 1260 offers no choice and its
  `pageText` contains `locked`.
- `Rotor Bar's corner table seats the guitarist from 22:00 to 01:00`: a `Dialogue` on the room's
  `The corner table` script at 1320 and at 1499 offers `['Ask for a song', 'Leave him to it']`; at
  1319 and at 1500 `['Take the spare chair', 'Leave them to it']`.

`tests/getJumpIn.test.ts`: `places` from `../source/game/content/locations.js`; every
`place=rotorBar` becomes `place=rotorBarRoom` and every expected `place: 'rotorBar'`
`'rotorBarRoom'`; new `gives null for the id of a location, which is not a place`:
`getJumpIn('?place=rotorBar', places)` is null and `warn` was called once with a string containing
`"rotorBar"`.

`tests/listStandIns.test.ts`: new `describe(listStandIns)`,
`lists the files of every location folder, the journeys and the data`: the lines of
`await listStandIns()` include one starting with each of `train/train.ts`, `rotorBar/room.ts`,
`rotorBar/street.ts`, `rotorBar/location.ts`, `journeys.ts` and `Locations not checked:`.

Run:
`npx vitest run --project unit tests/travel.test.ts tests/checkContent.test.ts tests/content.test.ts tests/getJumpIn.test.ts tests/listStandIns.test.ts`
Expected: FAIL (no `getLocation`, no `locations` export, the old ids).

- [ ] **Step 2: Implement the model, the content, the fixed world and the minimal screens**

As in Interfaces. Move the files with `git mv` first, then edit. Then run the unit tests above.
Expected: PASS; a line from the checker names what to fix in the content, not in the checker.

- [ ] **Step 3: Bring the browser tests in line**

Only the ids and the names change here; the new behaviour gets its tests in Tasks 5 and 6.

- `tests/nightScreenHelpers.tsx`: `getTravelParts` as in Interfaces.
- `tests/nightScreenPlaces.browser.test.ts`: `pickDestination(travelWindow, location: LocationId)`
  reads `getTravelParts(travelWindow).locations.get(location)` and its error says "location";
  `startJourney(choice, destination: LocationId)`; the calls pass `FIXED_BAR_LOCATION`; the journey
  test still ends with `waitForPlace(harness, FIXED_BAR)` (the room, open at 19:46) and the status
  `'19:46   230 Kč   0.0'`.
- `tests/travelWindow.browser.test.ts`: `from` is a `LocationId` (`FIXED_STOP_LOCATION` by default,
  `FIXED_BAR_LOCATION` where `FIXED_BAR` was passed as `from`); `getPlaceButton` becomes
  `getLocationButton` over `getTravelParts(…).locations`; `parts.places`/`allPlaces` become
  `locations`/`allLocations`; `getFixedPlace(FIXED_BAR)` in the `onClosed` expectations becomes
  `fixedLocations[FIXED_BAR_LOCATION]` under the key `location`; the narrowest-screen test builds
  `gameStart = {...nightStart, locations, places, travel, locationData: gameData, map}` from
  `content/locations.js` and takes `froms` from the entries whose id is in `locations`.
- `tests/nightScreenNarrow.browser.test.ts:265-269`: the door's labels are
  `['Go out', 'Knock on the\nglass  5 min  60%', 'Stay']`.
- `tests/jumpIn.browser.test.ts`: `url.searchParams.set('place', 'rotorBarRoom')` and
  `expect(nightScreen.contents.place?.id).toBe('rotorBarRoom')`.
- `tests/mainMenu.browser.test.tsx:552-564`, in `New Game shows the night screen in the train`:
  `readText(nightScreen.contents.statusText)` is `'16:00   350 Kč   0.0'` (`readText` from the
  helpers): the game's own night starts at 16:00.

Run:
`npx vitest run --project browser tests/nightScreenPlaces.browser.test.ts tests/travelWindow.browser.test.ts tests/nightScreenNarrow.browser.test.ts tests/jumpIn.browser.test.ts tests/nightScreen.browser.test.ts tests/mainMenu.browser.test.tsx`
Expected: PASS.

- [ ] **Step 4: List the stand-ins**

Run: `node scripts/list-stand-ins.mjs` Expected: a line for each of the seventeen files under
`content/locations/`, `journeys.ts`, `Locations not checked:   6 of 6` and
`Journeys not checked: 66 of 66`.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write source scripts tests
npm run typecheck
npx eslint source tests scripts
git add -A source/game scripts tests
git commit -m "Group the places into locations with a street outside each bar"
```

Expected: typecheck 0; eslint 0 errors.

### Task 4: The checker knows the locations, their hours and the ways out

**Files:**

- Modify: `source/game/core/checkContent.ts`
- Test: `tests/checkContent.test.ts`; `tests/content.test.ts` must still give `[]`

**Interfaces:**

- Consumes: `NIGHT_START`, `NIGHT_END`, `isOpenAt` (Task 1); `Location`, `Place.outdoors`,
  `createNight`, `Way`.
- Produces: `checkContent(content: Content): string[]` with the lines below. `CHECK_MINUTES` goes;
  `getCheckTimes(locationData: LocationData): number[]` (module function) returns, ascending and
  without doubles, each half hour from `NIGHT_START` up to but not including `NIGHT_END`, and for
  each span `[from, to]` of each entry's `hours` the minutes `from - 1`, `from`, `to - 1` and `to`
  that lie in `NIGHT_START ≤ t ≤ NIGHT_END`. The doc comment of `checkContent` says a function is
  called with each check night: once per place, time and level.

The structure:

- `checkScript(name, script, home: Place | null)`: `nights` is one `createNight` per place id of
  `content.places`, per time and per level; `home` is the place whose description or scene button
  the script is, `null` for a journey and a closing script.
- `checkNode(path, node, nights, home)`: as today, and for each choice, when `home !== null` and the
  choice has `onChoose`, the way out: a fresh
  `createNight({place: home.id, minutes: NIGHT_START, money: CHECK_MONEY})` is handed to
  `choice.onChoose`, and when `night.leaving` is set, with `{way} = night.leaving` and `where` the
  choice's path: `walk` or `taxi` on a place that is not outdoors gives
  `` `${where}: ${way} is offered indoors` ``; `tram` on a place that is not outdoors, or whose
  location's entry has no `tramStop`, gives `` `${where}: the tram does not stop here` ``.
- The location rules, each one line, run once over `content.places` and `content.locations`:

| Rule                                            | Line                                                          |
| ----------------------------------------------- | ------------------------------------------------------------- |
| A place in no location                          | `rotorBarStreet: in no location`                              |
| A place in two or more (ids joined with `and`)  | `rotorBarStreet: in rotorBar and whiskyShop`                  |
| The arrival is not one of the location's places | `rotorBar: arrival "whiskyShopRoom" is not one of its places` |
| Hours (an entry with `hours`) but no `closing`  | `rotorBar: hours but no closing`                              |
| Hours but no `outside`                          | `rotorBar: hours but no outside`                              |
| An `outside` that is not one of its places      | `rotorBar: outside "zidenice" is not one of its places`       |
| An `outside` that is not outdoors               | `rotorBar: outside "rotorBarRoom" is not outdoors`            |
| No hours and a `closing`                        | `zidenice: a closing but no hours`                            |
| No hours and an `outside`                       | `zidenice: an outside but no hours`                           |

The rules of Tasks 2 and 3 stay, and so do the words, the titles, the labels, the positions, the
map's cover and the journeys.

- [ ] **Step 1: Write the failing tests**

`tests/checkContent.test.ts`, with the fixture of Task 3 (five places, four locations, Rotor Bar's
hours `[[960, 1620]]`):

- `checks every script at each half hour and both sides of every opening and closing`: the
  text-function test becomes `toHaveBeenCalledTimes(5 * 34 * 3)` with the comment: 32 half hours
  from 16:00 to 07:30, and of the edges 959, 960, 1619 and 1620 of Rotor Bar's hours, 960 is a half
  hour and 959 lies before the night.
- `follows a door that branches on the hours on both sides of the closing`: a description with
  `start: (night) => ({speaker: 'Door', text: night.minutes === 1619 ? 'A supercalifragilistic word.' : night.minutes === 1620 ? 'Fine *odd.' : 'Fine.'})`:
  the lines contain
  `zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit` and
  `zidenice › description › start: page 1 has 1 italic marks`.
- `reports a place in no location and a place in two`: with `locations.zidenice.places = []` the
  lines contain `zidenice: in no location`; with `rotorBarStreet` also in `namestiRepubliky`'s
  places, `rotorBarStreet: in rotorBar and namestiRepubliky`.
- `reports an arrival and an outside that are not the location's places, and an outside indoors`:
  `rotorBar` with `arrival: 'zidenice'` → `rotorBar: arrival "zidenice" is not one of its places`;
  with `outside: 'zidenice'` → `rotorBar: outside "zidenice" is not one of its places`; with
  `outside: 'rotorBarRoom'` → `rotorBar: outside "rotorBarRoom" is not outdoors`.
- `reports hours without a closing or an outside, and a closing or an outside without hours`:
  `rotorBar` without `closing` → `rotorBar: hours but no closing`; without `outside` →
  `rotorBar: hours but no outside`; `zidenice` with `closing: oneNode('Closing.', 'Closing time')` →
  `zidenice: a closing but no hours`; with `outside: 'zidenice'` →
  `zidenice: an outside but no hours`.
- `reports walk and taxi indoors, and the tram where no tram stops`: `rotorBarRoom` with a spot
  `The door` whose script is
  `createWayOut({speaker: 'The door', text: 'A door.', ways: ['walk', 'tram', 'taxi']})` gives
  `rotorBarRoom › The door › start › "Walk": walk is offered indoors`,
  `rotorBarRoom › The door › start › "Take a taxi": taxi is offered indoors` and
  `rotorBarRoom › The door › start › "Take the tram": the tram does not stop here`; `rotorBarStreet`
  with the same spot gives only
  `rotorBarStreet › The door › start › "Take the tram": the tram does not stop here`;
  `namestiRepubliky` with it gives none of the three.
- `gives no line for good content` stays; the fixture's own scene button (`The door`, one node)
  offers no way out.

Run: `npx vitest run --project unit tests/checkContent.test.ts` Expected: the new tests FAIL (no
lines; 15 calls).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/checkContent.ts tests/checkContent.test.ts
npx vitest run --project unit tests/checkContent.test.ts tests/content.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/checkContent.ts tests/checkContent.test.ts
git commit -m "Check the locations, their hours and the ways out at every hour of the night"
```

Expected: PASS (the game's content keeps its ways out where they belong; a line names what to fix in
`content/locations/`, in which case fix it and `git add` it too); typecheck 0; eslint 0 errors.

### Task 5: The travel window shows when a destination opens or closes

**Files:**

- Modify: `source/game/core/hours.ts`,
  `source/game/screens/travelWindow.ts:84-94,146-155,174-201,512-524,683-706`
- Test: `tests/hours.test.ts`, `tests/travelWindow.browser.test.ts`

**Interfaces:**

- Consumes: `getHoursWords` (Task 1); `NightStart.locationData`; `TravelJourney.night`.
- Produces, in `core/hours.ts`:

```ts
/**
 * Every form the hours words can take, for the room they need: "till" with the end of each span,
 * "opens" with the start of each, and "closed"; [""] without hours.
 */
export function getHoursForms(hours: ReadonlyArray<readonly number[]> | undefined): string[];
```

`DestinationLabel` gains `numbersLineCount: number` (`NO_LABEL` has 1), and
`getDestinationLabel(destination, room, hoursWords: string)` builds the numbers from
`formatCosts(destination)` and the words. `setDestinationLabel` sets the numbers' layout to
`{width: numbersWidth, height: numbersLineCount * LINE_HEIGHT}`.

Decisions the spec leaves to the plan:

- The numbers are the costs and the hours words two spaces apart when that fits the room the numbers
  have, else the costs on one line and the words under them (`${costs}\n${words}`); the words are
  never split from each other. The room is the label's width on a narrow screen; on a wide one it is
  the label's width less `NAME_GAP` and the width of the name's widest word, so the name always
  keeps room for its words. The name is then wrapped into the label's width less the numbers' widest
  line and `NAME_GAP`, as today. The label's height counts `nameLineCount + numbersLineCount` lines
  on a narrow screen and the larger of the two on a wide one. On the narrowest screen
  `11 min  180 Kč  opens 16:30` (162 art pixels) has 102, so it takes two lines; `4 min  till 23:00`
  (102) takes one.
- `#layOut` measures every destination of `#roomDestinations` with every form of
  `getHoursForms(this.#start.locationData[destination.location.id]?.hours)`, and the tallest sets
  the room. `#showSelection` reads the words with
  `getHoursWords(hours, (this.#night?.minutes ?? 0) + this.#selected.minutes)`.

- [ ] **Step 1: Write the failing tests**

`tests/hours.test.ts`, `describe(getHoursForms)`:
`gives till for each end, opens for each start, and closed`: `[[960, 1380], [1410, 1920]]` →
`['till 23:00', 'till 08:00', 'opens 16:00', 'opens 23:30', 'closed']`;
`gives one empty form without hours`: `undefined` → `['']`.

`tests/travelWindow.browser.test.ts` (the fixed bar is closed from 23:00 to 23:30; from the stop the
walk to the bar takes 4 minutes and the taxi 5):

- New, after `a destination the night cannot pay is greyed out, and the window opens on Back`:
  `the destination button says when the bar closes or opens at the minute of arrival, and keeps its size`:
  with `night = {...contents.night, minutes: 1370}` (22:50), `openTravel('walk', {night})` reads
  `['The bar', '4 min  till 23:00']`; `waitForPanel(opened, WIDE_WINDOW)` and the destination's box
  is taken; the square's button then reads `['The square by the\nold market', '7 min']`; a new
  window with `minutes: 1380` (23:00, closed) reads `['The bar', '4 min  opens 23:30']`; with
  `minutes: 1920` (08:00, after the last span) `['The bar', '4 min  closed']`; with `minutes: 1376`
  (arrival at 23:00 exactly) `['The bar', '4 min  opens 23:30']`; after `waitForPanel` each
  destination button's box equals the one taken.
- In `the game's own places fit the narrowest screen` (renamed `… locations …`): the night is
  `{...harness.nightScreen.contents.night, minutes: 960}`, passed to `showJourney`, so the Whisky
  Shop reads `opens 16:30` from the places that reach it before 16:30 and Rotor Bar `till 03:00`;
  the numbers' box must lie inside the destination's box as today, and, new, the numbers' text of a
  destination whose words are not empty contains the words (`readText(numbers)` matches
  `/till|opens|closed/`); the test counts at least one such destination over the loop.
- `DESTINATION_HEIGHT` stays 40: the comment gains that the bar's `5 min  90 Kč  till 23:00` is 144
  art pixels and wraps under the name to two lines, three with the name, on each of the four
  screens.

Run:
`npx vitest run --project unit tests/hours.test.ts && npx vitest run --project browser tests/travelWindow.browser.test.ts`
Expected: FAIL (no `getHoursForms`; no words on the button).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/hours.ts source/game/screens/travelWindow.ts tests/hours.test.ts tests/travelWindow.browser.test.ts
npx vitest run --project unit tests/hours.test.ts
npx vitest run --project browser tests/travelWindow.browser.test.ts tests/nightScreenPlaces.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/hours.ts source/game/screens/travelWindow.ts tests/hours.test.ts tests/travelWindow.browser.test.ts
git commit -m "Show when a destination opens or closes on the travel window"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 6: A location closes with the player indoors

**Files:**

- Modify: `source/game/screens/nightScreen.ts:481-514` (`actOnNight`)
- Test: `tests/nightScreenPlaces.browser.test.ts`, `tests/jumpIn.browser.test.ts`

**Interfaces:**

- Consumes: `isOpenAt` (Task 1); `getLocationOf`, `Location.closing`, `Location.outside`,
  `Place.outdoors` (Task 3); `openStory`, `prepareNextPlace`, `getNextPlace` as today.
- Produces: `actOnNight` gains the closing after the way out, as the spec's block: when the place
  shown is the night's place and no way out is set, and the place is not outdoors, and
  `isOpenAt(nightStart.locationData[location.id]?.hours, night.minutes)` is false for
  `location = getLocationOf(place)`, then `night.place = location.outside` and
  `openStory(screen, location.closing)`; a location without `closing` or `outside` throws
  ``new Error(`"${location.id}" has closed with no closing script or no outside!`)``, which
  `onUpdate` sends to the error screen. The comment on `actOnNight` gains the order: a place the
  night moved the player to, then a way out, then the closing; a way out exists only outdoors and a
  closing only indoors, so the last two never meet.

- [ ] **Step 1: Write the failing browser tests**

`tests/nightScreenPlaces.browser.test.ts`, a new `describe('the bar and its pavement')` before
`the dimmed scene`, whose tests follow each other in order. `nightStart.minutes` is set by hand
before a `restartAt` where a time is named, and put back to the fixed start's 1180 in a `finally`.

- `Go out from the room shows the pavement with its description`: `restartAt(harness, FIXED_BAR)`,
  `closeStory()`, `openSpot('The door')`, `pressThrough`, the first button reads `Go out`, Enter,
  `pressThrough` and Enter close the window, `waitForPlace(harness, FIXED_PAVEMENT)`; the
  description's speaker is `The pavement` and `contents.night.place` is `FIXED_PAVEMENT`.
- `Go in works while the bar is open`: `closeStory()`, `openSpot('The bar')`, `pressThrough`, the
  buttons read `['Go in', 'Stay outside']`, Enter on the first, `waitForNoStoryWindow`,
  `waitForPlace(harness, FIXED_BAR)`.
- `the door shows its locked text while the bar is closed`: `closeStory()`, Go out as above to the
  pavement, `closeStory()`; `contents.night.minutes = 1385` (23:05); `openSpot('The bar')`,
  `pressThrough`: `storyWindow.text` contains `locked` and `getWindowParts(…).buttons` is `[]`;
  Enter closes it; `contents.place?.id` stays `FIXED_PAVEMENT`.
- `a door into a bar that closes under the player's hand`: at 1379 on the pavement (set by hand),
  `openSpot('The bar')`, `pressThrough` (the `open` text); `contents.night.minutes = 1380`; Enter on
  `Go in`; `waitForPlace(harness, FIXED_BAR)` (the room's description opens); `closeStory()`; then
  `vitest.waitFor` until `getStoryWindow(harness).dialogue.node?.speaker` is `Closing time`;
  `contents.night.place` is `FIXED_PAVEMENT` already; `closeStory()`;
  `waitForPlace(harness, FIXED_PAVEMENT)`.
- `a choice that crosses the closing runs to its end, then the closing script, then the pavement`:
  `nightStart.minutes = 1375` (22:55), `restartAt(harness, FIXED_BAR)`, `closeStory()`,
  `openSpot('The bartender')`, Enter, ArrowDown, Enter (the beer, 10 minutes); `pressThrough` and
  Enter close the beer's text; `vitest.waitFor` the window whose speaker is `Closing time`;
  `readText(contents.statusText)` is `'23:05   305 Kč   1.0'` and `contents.place?.id` is still
  `FIXED_BAR` (the room stays under the closing's window); `closeStory()`;
  `waitForPlace(harness, FIXED_PAVEMENT)`; the pavement's description is open.
- `a journey that arrives after the closing ends on the pavement`: `nightStart.minutes = 1370`,
  `restartAt(harness, FIXED_SQUARE)`, `closeStory()`, `startJourney('Walk', FIXED_BAR_LOCATION)` (12
  minutes, arrival 23:02), `endStory`, `waitForPlace(harness, FIXED_PAVEMENT)`; the journey's text
  named the location: `storyWindow.dialogue.pageText` contained `The bar`.

`tests/jumpIn.browser.test.ts`: the boot's address becomes `place=rotorBarRoom`, `time=04:00`,
`money=120`, `drunkenness=2.5`; the first test expects `'04:00   120 Kč   2.5'`; new, after it,
`the closing runs after the description of a closed bar`: `pressThrough` and Enter on the
description; `vitest.waitFor` a story window whose speaker is `Closing time`; `pressThrough` and
Enter; `waitForPlace(harness, 'rotorBarStreet')`.

Run:
`npx vitest run --project browser tests/nightScreenPlaces.browser.test.ts tests/jumpIn.browser.test.ts`
Expected: the new tests FAIL (no closing script opens; the room stays).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/nightScreen.ts tests/nightScreenPlaces.browser.test.ts tests/jumpIn.browser.test.ts
npx vitest run --project browser tests/nightScreenPlaces.browser.test.ts tests/jumpIn.browser.test.ts tests/nightScreen.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/nightScreen.ts tests/nightScreenPlaces.browser.test.ts tests/jumpIn.browser.test.ts
git commit -m "Close a location with the player indoors"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 7: Whole check and hand-over

**Files:** `docs/direction.md`, `docs/superpowers/specs/2026-10-10-locations-and-hours-design.md`.

- [ ] **Step 1: Run everything once**

From the repository root: `npx turbo run typecheck lint test --filter=foam --concurrency=1`
Expected: every task succeeds (this is the one full run; CI repeats it). Then
`git diff --stat f673ea40 -- apps/somewhere packages/tellurion` prints nothing.

- [ ] **Step 2: State that the spec is built**

- `docs/direction.md`: in the phase 5 list, item 3 ends "It is built:" with links to the spec and to
  this plan, as item 2 does. The paragraph "Two things wait for later phases" loses its first item
  (the opening hours are read now); if one item is left, the sentence says so.
- The spec's status: "implemented by
  [2026-10-10-locations-and-hours.md](../plans/2026-10-10-locations-and-hours.md)".

```bash
git add docs/direction.md docs/superpowers/specs/2026-10-10-locations-and-hours-design.md
git commit -m "State that locations and hours are built"
```

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build: every step of the spec's "What the player sees" in a wide window and in one narrower
than 240 art pixels; the Whisky Shop's locked door before 16:30 and after 21:00, and the wait that
opens it; Rotor Bar's guitarist at 22:00; a journey to Rotor Bar after 03:00 that ends on Dvořákova;
the destination button's words on a phone, where `opens 16:30` goes under the costs; and how
`node scripts/fill-travel-data.mjs` lists a tag the library cannot read when a location gets an
`osmName` and no `hours`.
