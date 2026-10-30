# Places and Travel (Foam Phase 4, Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A night starts on the train and moves between seven real places of Brno: a way out in a
place opens a travel window that lists where walking, the tram or a taxi lead, and a pick takes the
journey's minutes and money and shows the destination.

**Architecture:** The content is TypeScript: one file per place under `content/places/`, written
with the `standIn` tag, plus two JSON files of travel data that a Node script first fills from
OpenStreetMap. `content/nightStart.ts` is the one value the night screen reads; tests swap a fixed
world into it. Scripts only change the night (`night.place`, `night.leaving`), and the night screen
acts on those once a story window has closed. A checker (`core/checkContent.ts`) runs over the
content in the unit tests.

**Tech Stack:** TypeScript, Pixi.js 8, Tellurion (`Dialogue`, `Modal`, `Panel`, `Button`,
`Container`, `Text`, `wrapText`), Vitest 4 (`unit` in Node, `browser` in Chromium), Node 24 scripts
(`.mjs`, importing `.ts` through type stripping), Prettier 3, OpenStreetMap (Overpass and
`routing.openstreetmap.de`).

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-06-places-and-travel-design.md`

Runs after the Tellurion plan `docs/superpowers/plans/2026-10-06-dialogue-choice-effect.md`: the way
out's choices use `onChoose`.

## Global Constraints

- Only files under `apps/foam/` change. Nothing under `apps/somewhere/` or `packages/tellurion/`.
- Work on the current branch, `somewhere-update`. Commit at the end of each task; a message is one
  short imperative sentence, with no prefix and no trailer lines. Never use `git stash`. Commands
  run from `apps/foam` unless a step says otherwise.
- Code style: `let` for locals, `const` only at module level; relative imports in TypeScript end in
  `.js`; a `.mjs` script imports a `.ts` file by its `.ts` name, as `scripts/generate-ui-atlas.mjs`
  imports `palette.ts`; comments say why and stay within 100 columns.
- Tests: the `vitest` object, not `vi`; `describe(fn, …)` when named after a function; no `expect`
  inside `beforeAll` or `beforeEach`; a test file without JSX is `.ts`; game modules are imported
  after `bootGame`, never at the top of a browser test; `vitest.mock(import(…))` with a cast stub;
  `console.warn` (not `console.log`) for anything a browser test must print. Lint expectation: 0
  errors; the known warnings of earlier phases may print.
- Modules under `content/` and the `core/` modules named in this plan never import `core/game.ts`
  (directly or through a screen): the unit tests read them in Node.
- Ids and names: the spec's table of places, copied exactly (`train`, `zidenice`, `hlavniNadrazi`,
  `whiskyShop`, `rotorBar`, `namestiRepubliky`, `malinovskehoNamesti`; names, short names and
  description titles as listed there).
- A night starts in `'train'` at `1020` (17:00) with `350` Kč. `stateOfMind: 'Sober'`.
- Labels: the way out's choices "Walk", "Take the tram", "Take a taxi", "Stay"; the travel window's
  titles "On foot", "By tram", "By taxi"; its way buttons "Walk", "Tram", "Taxi"; its last button
  "Back"; journey speakers "On foot", "The tram", "The taxi". `formatJourney` gives `"35 min"` or
  `"11 min  170 Kč"` (two spaces).
- Label room on the narrowest screen (146 art pixels, 6 a character): 19 for a window's title, 14
  for the place button, 21 for a scene button; 16 for a word.
- Fill-script constants, stand-in values: a wait of 5 minutes for a tram and for a taxi; 300 metres
  a minute for a tram; 80 metres a minute on foot over 1.3 times the straight line; 25 Kč a ticket;
  60 Kč plus 36 Kč a kilometre for a taxi, rounded to 10 Kč; 150 m for opening hours; positions to
  five decimals; every journey at least one minute.
- Stand-in text: every text written with `standIn`; a description is two or three sentences; a scene
  button is one node of one or two sentences; people have no names; real places, streets and stops
  keep theirs; no word longer than 16 characters; every node sets `speaker`; italic marks come in
  pairs on each page.
- The game never talks to a map or routing server. Only `scripts/fill-travel-data.mjs` does, one
  request at a time, with a `User-Agent` that names it.
- Every button of a fading window does nothing once its window is closing or closed. Every action
  started from `onUpdate` checks `screen.state === 'shown'`.

## Review Focus

- **The menu opened over a story window that is fading out.** Escape in the 200 ms fade opens the
  menu above the closing window; if the screen then showed a place or opened the travel window, the
  new description or window would lie above the menu. The night screen therefore acts on the night
  in `onUpdate`, once no overlay is open. Pinned in Task 5 with direct calls (no timing).
- **A resize while no place is shown.** During a journey there is no place button, picture or scene
  button; turning a phone then must not throw, and the status line takes the place button's spot.
  Pinned in Task 7.
- **The game's own scene buttons on a narrow screen.** The checker holds label lengths, not
  overlaps; the spot positions of the seven places must keep their buttons apart at 480 × 270, 195 ×
  350 and 146 × 262. Pinned in Task 4 (unit test, 6 art pixels a character).
- **The game's longest destination list on the narrowest screen.** The window does not scroll; the
  list with the most destinations of the game's own data must fit 146 × 262. Pinned in Task 6.
- **Jump-in values at their edges.** `12:00` is 720 and `00:00` is 1440; `7:30`, `24:00`, `12:60`,
  `1e3` and `12.5` are other forms and are dropped. Pinned in Task 8.

## File Structure

| File (under `apps/foam/`)                                   | Responsibility                                                         | Task    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| `source/game/core/night.ts`                                 | `PlaceId`, `Way`, `Night.place`, `Night.leaving`, `createNight(start)` | 1       |
| `source/game/core/place.ts`                                 | New. `Spot`, `Place`                                                   | 1       |
| `source/game/core/prose.ts`                                 | New. `prose`, `standIn`                                                | 1       |
| `source/game/core/createWayOut.ts`                          | New. `leaveBy`, `createWayOut`                                         | 1       |
| `source/game/core/travel.ts`                                | New. Data types, `NightStart`, destinations, journeys                  | 1       |
| `source/game/core/getExpectedJourneys.ts`                   | New. Which journeys the data holds; imports nothing                    | 1       |
| `scripts/fill-travel-data.mjs`                              | New. Fills the data files                                              | 2       |
| `source/game/content/data/places.json`, `travel.json`       | New. The travel data                                                   | 2       |
| `source/game/content/data/README.md`                        | New. Sources, credit, how to run the script                            | 2       |
| `source/game/core/getSceneArea.ts`                          | Gains the window sizes, so Node can read them                          | 3       |
| `source/game/core/getLabelRoom.ts`                          | New. Label room on a screen width                                      | 3       |
| `source/game/core/checkContent.ts`                          | New. The checker                                                       | 3       |
| `source/game/content/places/*.ts`, `places.ts`              | New. The seven places and their record                                 | 4       |
| `source/game/content/journeys.ts`, `nightStart.ts`          | New. One script per way; what a night starts with                      | 4       |
| `source/game/content/pictures/`                             | `barPicture.ts` moved here; new `standInPicture.ts`                    | 4       |
| `scripts/list-stand-ins.mjs`                                | New. What is left to write and to check                                | 4       |
| `source/game/screens/nightScreen.ts`                        | Shows the night's place, changes place (5); travel and journeys (7)    | 1, 5, 7 |
| `source/game/content/samplePlace.ts`                        | Removed; its content moves to `tests/fixedWorld.ts`                    | 5       |
| `source/game/screens/travelWindow.ts`                       | New. `TravelWindow`                                                    | 6       |
| `source/game/core/getJumpIn.ts`, `source/routes/_index.tsx` | The jump-in                                                            | 8       |
| `docs/direction.md`                                         | States what is built                                                   | 9       |

---

### Task 1: The night's model: places, texts, ways out and journeys

**Files:**

- Modify: `source/game/core/night.ts`, `source/game/screens/nightScreen.ts` (the two `createNight()`
  calls), `tests/night.test.ts`
- Create: `source/game/core/place.ts`, `source/game/core/prose.ts`,
  `source/game/core/createWayOut.ts`, `source/game/core/travel.ts`,
  `source/game/core/getExpectedJourneys.ts`
- Test: `tests/prose.test.ts`, `tests/createWayOut.test.ts`, `tests/travel.test.ts`,
  `tests/getExpectedJourneys.test.ts`

**Interfaces:**

- Consumes: `onChoose` on `DialogueChoice` (Tellurion plan).
- Produces:
  - `night.ts`: `PlaceId`, `Way = 'taxi' | 'tram' | 'walk'`, `Night` with `place: PlaceId` and
    `leaving: {way: Way; ways: readonly Way[]} | null`, all exactly as the spec's block;
    `createNight(start: {place: PlaceId; minutes: number; money: number}): Night`. `formatStatus`
    unchanged.
  - `place.ts`: `Spot` and `Place` as the spec's block (`Place.id`, `name`, `shortName?`,
    `description`, `picture`, `spots`). The `Spot` doc keeps samplePlace's sentence that a spot lies
    on its thing in the place's picture.
  - `prose.ts`: `prose` and `standIn`, both
    `(strings: TemplateStringsArray, ...values: unknown[]) => string[] | string`. A text with no
    line but blank ones gives `''`.
  - `createWayOut.ts`: `WayOutOptions`, `leaveBy(way, ways): (night: Night) => void`,
    `createWayOut(options): RunnableDialogueScript<Night>`, as the spec's block.
  - `travel.ts`: `Position = {latitude: number; longitude: number}`;
    `PlaceEntry = {kind: string; address?: string; station?: string; tramStop?: string; osmName?: string; position?: Position; nearestTramStop?: {name: string; position: Position}; openingHours?: string; computed?: boolean}`
    (`kind` is a string so the JSON import fits it; the checker allows `'place'` and `'stop'`);
    `PlaceData`, `Journey`, `Travel`, `Destination`, `NightStart` as the spec's blocks;
    `getDestinations(start, from, way): Destination[]`, `takeJourney(night, destination): void`,
    `formatJourney(destination): string`.
  - `getExpectedJourneys.ts`:
    `ExpectedJourney = {from: string; way: 'taxi' | 'tram' | 'walk'; to: string}`;
    `getExpectedJourneys(places: Readonly<Record<string, {kind: string; tramStop?: string; nearestTramStop?: {name: string}}>>): ExpectedJourney[]`.
    Order: entries in key order; for each, the ways `walk`, `tram`, `taxi`; for each way, the ends
    in key order. A stop S is a place P's own stop when `S.tramStop === P.nearestTramStop?.name`; a
    place without `nearestTramStop` gets a tram journey to every stop. It imports nothing, not even
    a type.

- [ ] **Step 1: Write the failing unit tests**

`tests/night.test.ts` (rewritten around a
`const START = {place: 'zidenice', minutes: 1020, money: 350} as const`):

- `createNight returns the start's values, a sober state of mind and no leaving`:
  `toEqual({minutes: 1020, money: 350, stateOfMind: 'Sober', place: 'zidenice', leaving: null})`.
- `createNight returns a separate object on each call` (as before).
- The three `formatStatus` tests keep their expected strings and build their nights as
  `{...createNight(START), minutes: …, money: …, stateOfMind: …}`; the first uses minutes 1180 and
  expects `'19:40   350 Kč   Sober'`.

`tests/prose.test.ts`, `describe(prose, …)`:

- wrapped lines join with one space: a three-line indented text gives `'One two three.'`.
- indentation and outer blank lines go.
- a blank line starts a page: gives `['First page.', 'Second page.']`; three blank lines in a row
  give the same two pages.
- values are put in as written: `` prose`A ${3} and ${'b'}.` `` is `'A 3 and b.'`.
- italic marks stay: `'A *word* here.'`.
- `standIn gives what prose gives` for one one-page and one two-page text.

`tests/createWayOut.test.ts`, `describe(createWayOut, …)` with `ways: ['walk', 'tram', 'taxi']`, run
through `new Dialogue({script, context: night})` from `tellurion`, `advance()` once to reach the
choices:

- the node has the speaker, the text and the choices
  `['Walk', 'Take the tram', 'Take a taxi', 'Stay']`; with `ways: ['taxi', 'walk']` they are
  `['Take a taxi', 'Walk', 'Stay']`.
- each way's choice sets `night.leaving` to `{way, ways}` (the same `ways` array) and ends the
  dialogue.
- "Stay" ends the dialogue and leaves `night.leaving` as it was (`null`, and an earlier value).
- `describe(leaveBy, …)`: the returned function sets `leaving`.

`tests/travel.test.ts`, with a `NightStart` built in the file: places `rotorBar` ("Alpha"),
`zidenice` ("Beta"), `hlavniNadrazi` ("Gamma") made by a local `createPlace(id, name)`
(`description: {start: {text: 'x'}}`, `picture: ''`, `spots: []`), and travel
`{whiskyShop: {walk: {hlavniNadrazi: {minutes: 10}, zidenice: {minutes: 5}, rotorBar: {minutes: 10}, nowhere: {minutes: 1}}, taxi: {rotorBar: {minutes: 11, price: 170}}}}`:

- `getDestinations` by walk gives `zidenice`, `rotorBar`, `hlavniNadrazi` (nearest first, then by
  name), each with price 0, and warns once (`console.warn` spy) about `nowhere`.
- by tram it gives `[]`; from a place without travel it gives `[]`.
- `takeJourney` with the taxi destination on a night at 1180 and 350 gives 1191, 180 and
  `place: 'rotorBar'`.
- `formatJourney` gives `'10 min'` and `'11 min  170 Kč'`.

`tests/getExpectedJourneys.test.ts`, `describe(getExpectedJourneys, …)`, with
`bar: {kind: 'place', nearestTramStop: {name: 'North'}}`,
`station: {kind: 'place', nearestTramStop: {name: 'Elsewhere'}}`,
`north: {kind: 'stop', tramStop: 'North'}`, `south: {kind: 'stop', tramStop: 'South'}`:

- returns exactly these 17, in this order: bar walk station, bar tram south, bar taxi station;
  station walk bar, station tram north, station tram south, station taxi bar; north walk bar, north
  walk station, north tram south, north taxi bar, north taxi station; south walk bar, south walk
  station, south tram north, south taxi bar, south taxi station.
- without `nearestTramStop` on `bar`, its tram journeys are `north` and `south`.

Run:
`npx vitest run --project unit tests/night.test.ts tests/prose.test.ts tests/createWayOut.test.ts tests/travel.test.ts tests/getExpectedJourneys.test.ts`
Expected: FAIL, modules not found and `createNight` without `place`.

- [ ] **Step 2: Implement the five modules and the night**

As in Interfaces. Notes the signatures leave open:

- `prose`: join `strings` with the stringified values (cooked strings), split on `\n`, trim each
  line, then group runs of non-blank lines into pages joined by one space. `standIn` calls `prose`;
  its doc says the mark exists only in the source and that writing the real text turns `standIn`
  into `prose`.
- `createWayOut`: one inline start node; a way's choice is `{text, onChoose: leaveBy(way, ways)}`
  without `next`; "Stay" is `{text: 'Stay'}`.
- `getDestinations` warns `` `No place "${to}" for the journey ${from} › ${way} › ${to}.` `` and
  sorts by minutes, then `a.place.name.localeCompare(b.place.name)`.
- `takeJourney` adds the minutes, subtracts the price and sets `night.place`; it does not touch
  `leaving`.

`nightScreen.ts` still shows the sample bar until Task 5. Its two `createNight()` calls pass a
module constant `SAMPLE_START = {place: 'train', minutes: 1180, money: 350} as const`, with a
comment that Task 5 replaces it with `nightStart`. The night screen tests keep passing.

- [ ] **Step 3: Run the tests, typecheck, lint, commit**

```bash
npx vitest run --project unit
npm run typecheck
npx eslint source tests
git add source tests
git commit -m "Add the night's place, ways out and journeys"
```

Expected: PASS; typecheck exits 0; eslint 0 errors.

### Task 2: The travel data and the script that fills it

**Files:**

- Create: `scripts/fill-travel-data.mjs`, `source/game/content/data/places.json`,
  `source/game/content/data/travel.json`, `source/game/content/data/README.md`
- Test: `tests/fillTravelData.test.ts`

**Interfaces:**

- Consumes: `getExpectedJourneys` (imported as `../source/game/core/getExpectedJourneys.ts`).
- Produces (exported from the script):
  - The constants of Global Constraints, named `TRAM_WAIT_MINUTES`, `TAXI_WAIT_MINUTES`,
    `TRAM_METRES_PER_MINUTE`, `WALK_METRES_PER_MINUTE`, `DETOUR`, `TICKET_PRICE`, `TAXI_BASE_FARE`,
    `TAXI_PRICE_PER_KILOMETRE`, `OPENING_HOURS_RADIUS`, and
    `USER_AGENT = 'Foam travel data (https://github.com/jakubmazanec/apps)'`.
  - `getDistance(from, to)`: metres along the earth's surface, haversine with radius 6 371 000.
  - `getWalkJourney({metres, seconds})`: `{minutes}`, `max(1, round(seconds / 60))`.
  - `getTaxiJourney({metres, seconds})`: minutes `max(1, round(TAXI_WAIT_MINUTES + seconds / 60))`,
    price `round((TAXI_BASE_FARE + TAXI_PRICE_PER_KILOMETRE * metres / 1000) / 10) * 10`.
  - `getTramJourney(walkMetres, rideMetres)`: minutes
    `max(1, round(walkMetres * DETOUR / WALK_METRES_PER_MINUTE + TRAM_WAIT_MINUTES + rideMetres * DETOUR / TRAM_METRES_PER_MINUTE))`,
    price `TICKET_PRICE`.
  - `fillTravelData({places, travel, lookups})`:
    `Promise<{places, travel, added: string[], missing: string[]}>`. It never mutates its input (it
    works on `structuredClone`s). `lookups` is
    `{findPositions(query), findTramStops(position), findNamed(name, position), route(profile, from, to)}`:
    `query` is `{address}`, `{station}` or `{tramStop}`; the first three resolve to lists
    (`Position[]`, `{name, position}[]`, `{position, openingHours?}[]`), `route` with `profile`
    `'foot'` or `'car'` resolves to `{metres, seconds}`. A lookup may reject.
  - `formatData(data, file)`: `Promise<string>`, the file's text in the form Prettier keeps.
- A line of `added` or `missing` names the value: `places.json › rotorBar › position`,
  `places.json › rotorBar › nearestTramStop`, `places.json › rotorBar › openingHours`,
  `travel.json › whiskyShop › walk › zidenice`.

What `fillTravelData` does, entry by entry in key order, then journey by journey:

1. No `position`: ask `findPositions` with the entry's `address`, `station` or `tramStop`; the
   position is the mean of the points, to five decimals.
2. Kind `"place"` with a position and no `nearestTramStop`: ask `findTramStops(position)`; take the
   nearest by `getDistance`, its name and position (five decimals).
3. `osmName`, a position and no `openingHours`: ask `findNamed(osmName, position)`; take the nearest
   result within `OPENING_HOURS_RADIUS` that has opening hours.
4. Each journey of `getExpectedJourneys(places)` that `travel` lacks: walk from `route('foot', …)`
   through `getWalkJourney`; taxi from `route('car', …)` through `getTaxiJourney`; tram from
   `getTramJourney(walk, ride)`, where `walk` is 0 from a stop and the distance to `nearestTramStop`
   from a place, and `ride` is the distance from the start's stop (the stop itself, or the place's
   `nearestTramStop`) to the destination. A journey whose ends lack a needed position or nearest
   stop is not asked for and is listed as missing.

A value it writes gets `"computed": true` on its entry or its journey. A lookup that rejects or
finds nothing leaves the value out and lists it in `missing`; the next one is still asked. Lookups
are awaited one after another.

The script part (`if (process.argv[1] === import.meta.filename)`, as the atlas script): read both
files, call `fillTravelData` with the real lookups, write a file only when something was added to it
(through `formatData`), print each added line, print each missing line with `console.error`, and set
`process.exitCode = 1` when anything is missing.

The real lookups (not unit-tested): every request sends `User-Agent: USER_AGENT`. Overpass: POST
`data=<query>` (form-encoded) to `https://overpass-api.de/api/interpreter`; a body that does not
start with `{` is a busy server (reject). Queries inside the Brno box `(49.10,16.45,49.30,16.75)`,
ending in `out center tags;`: a building
`nwr["addr:street"="<street>"]["addr:streetnumber"= "<number>"]` (the address split at its last
space); a station `nwr[railway~"^(station|halt)$"][name="<station>"]`; a stop
`node[railway=tram_stop][name="<stop>"]`; stops near a point
`node(around:1000,<lat>,<lon>)[railway=tram_stop]`; a named thing
`nwr(around:150,<lat>,<lon>)[name~"^<name>$",i]` (reading `opening_hours`). Routes: GET
`https://routing.openstreetmap.de/routed-<foot|car>/route/v1/driving/<lon>,<lat>;<lon>,<lat>?overview=false`,
`routes[0].distance` and `routes[0].duration`.

`formatData`:
`prettier.format(JSON.stringify(data), {...(await prettier.resolveConfig(file)), filepath: file})`.
From one-line JSON, Prettier keeps every object that fits 100 columns on one line, so a journey and
a position are one line each.

- [ ] **Step 1: Write the failing tests**

`tests/fillTravelData.test.ts` (unit; it imports `../scripts/fill-travel-data.mjs`). Positions in
the fixtures are near Brno, so routes and distances are of city size. A local
`createLookups(overrides)` returns fakes that record their calls and reject for anything not
overridden.

- `describe(getDistance, …)`: 0 for one point twice; `{latitude: 0, longitude: 0}` to
  `{latitude: 1, longitude: 0}` is `111_195` to the metre (`toBeCloseTo(111_195, 0)`).
- `describe(getWalkJourney, …)`: `{metres: 2000, seconds: 1500}` → `{minutes: 25}`;
  `{metres: 10, seconds: 20}` → `{minutes: 1}`.
- `describe(getTaxiJourney, …)`: `{metres: 4000, seconds: 600}` → `{minutes: 15, price: 200}`;
  `{metres: 2500, seconds: 30}` → `{minutes: 6, price: 150}`.
- `describe(getTramJourney, …)`: `(480, 2400)` → `{minutes: 23, price: 25}`; `(0, 0)` →
  `{minutes: 5, price: 25}`.
- `describe(fillTravelData, …)`:
  - a missing position becomes the mean of two points to five decimals, the entry gets
    `computed: true`, and `added` names it.
  - a place gets the nearer of two stops as `nearestTramStop`; a stop gets none.
  - opening hours come from a named thing 100 m away and not from one 200 m away.
  - a missing walking journey and a missing taxi journey come from `route('foot', …)` and
    `route('car', …)` with the numbers of the two helpers and `computed: true`.
  - a missing tram journey is computed without any lookup call.
  - values that are there stay: an entry with a typed position and opening hours, and a journey
    `{minutes: 30}` without `computed`, come back equal, and no lookup is asked for them.
  - complete data comes back deep-equal, with `added` and `missing` empty and no lookup called.
  - a rejecting `findPositions` lists `places.json › … › position` in `missing`, leaves the field
    out, and the next entry is still asked; the journeys that need that position are listed too.
  - the input objects are not changed (compare with a `structuredClone` taken before).
  - lookups run one at a time: fakes that count calls in flight never see two.
- `describe(formatData, …)`: for a small `travel`, `prettier.format` of the result gives the same
  text, and `{"minutes": 23, "computed": true}` stands on one line.

Run: `npx vitest run --project unit tests/fillTravelData.test.ts` Expected: FAIL, the script does
not exist.

- [ ] **Step 2: Implement the script**

As in Interfaces. The top comment says what the script fills, that it never changes a value that is
there, that the servers' data is OpenStreetMap's (see the data README), and the usage line
`node scripts/fill-travel-data.mjs`.

Run: `npx vitest run --project unit tests/fillTravelData.test.ts` Expected: PASS.

- [ ] **Step 3: Write the author's fields**

`source/game/content/data/places.json`:

```json
{
  "zidenice": {"kind": "place", "station": "Brno-Židenice"},
  "hlavniNadrazi": {"kind": "place", "station": "Brno hlavní nádraží"},
  "whiskyShop": {"kind": "place", "address": "Vranovská 110", "openingHours": "Mo-Su 16:30-21:00"},
  "rotorBar": {"kind": "place", "address": "Dvořákova 12", "osmName": "Rotor bar"},
  "namestiRepubliky": {"kind": "stop", "tramStop": "Náměstí Republiky"},
  "malinovskehoNamesti": {"kind": "stop", "tramStop": "Malinovského náměstí"}
}
```

`travel.json`: `{}`.

`README.md`: the two files and who writes which field (the spec's field table, short); that the
positions, nearest stops, opening hours and routes come from OpenStreetMap through Overpass and
`routing.openstreetmap.de`; the credit "© OpenStreetMap contributors", with
`https://www.openstreetmap.org/copyright`, and that the data is under the Open Database License; how
to correct a number (change it, delete `"computed": true`) and get a fresh one (delete the journey,
run the script); the command.

- [ ] **Step 4: Fill the data from OpenStreetMap**

Run: `node scripts/fill-travel-data.mjs` Expected: it prints the added values (six positions, four
nearest stops, Rotor Bar's opening hours, about 50 journeys) and exits 0. A busy server ends the run
with missing lines and exit code 1: wait a minute and run it again, at most five times. A station or
stop that is not found under its name: look its name up in OpenStreetMap, correct `station` or
`tramStop`, and run again. If values are still missing after that, stop and report them.

Check the result by eye: every position lies in Brno (latitude 49.1–49.3, longitude 16.5–16.7); the
Whisky Shop is about 288 m from Náměstí Republiky and Rotor Bar about 271 m from Malinovského
náměstí (a nearest stop may be another stop, which is fine).

- [ ] **Step 5: See that a second run changes nothing, and commit**

```bash
git add scripts source/game/content/data tests/fillTravelData.test.ts
node scripts/fill-travel-data.mjs
git diff --exit-code source/game/content/data
npx eslint scripts tests
npm run typecheck
git commit -m "Fill the travel data from OpenStreetMap with a script"
```

Expected: the second run prints nothing added and exits 0; `git diff --exit-code` exits 0; eslint 0
errors.

### Task 3: The checker

**Files:**

- Modify: `source/game/core/getSceneArea.ts`, `source/game/screens/windowTitle.ts`,
  `source/game/screens/storyWindow.ts`
- Create: `source/game/core/getLabelRoom.ts`, `source/game/core/checkContent.ts`
- Test: `tests/getLabelRoom.test.ts`, `tests/checkContent.test.ts`

**Interfaces:**

- Consumes: `Place`, `Night`, `createNight`, `PlaceData`, `Travel`, `Way` (Task 1);
  `getExpectedJourneys`; `stripMarks` from `core/markedText.ts`.
- Produces:
  - `getSceneArea.ts` gains, moved without change of value: `WINDOW_WIDTH = 300` and
    `GLYPH_WIDTH = 6` (from `storyWindow.ts`), `WINDOW_PADDING_X = 12` and `WINDOW_PADDING_Y = 8`
    (from `windowTitle.ts`, which keeps `WINDOW_PADDING`, `TITLE_HEIGHT` and `createWindowTitle` and
    imports the two). `storyWindow.ts` imports all four from `getSceneArea.ts`.
  - `getLabelRoom.ts`: `NARROWEST_WIDTH = 146`, `WORD_ROOM = 16`, and
    `getLabelRoom(screenWidth = NARROWEST_WIDTH): {title: number; placeButton: number; sceneButton: number}`,
    each `Math.floor(<room in art pixels> / GLYPH_WIDTH)`:
    - title: `Math.min(WINDOW_WIDTH, Math.floor(screenWidth - 2 * MARGIN)) - 2 * WINDOW_PADDING_X`
      (the story window's text width);
    - place button: `screenWidth - 3 * MARGIN - menuWidth - 2 * BUTTON_PADDING_X`, where
      `menuWidth = 'Menu'.length * GLYPH_WIDTH + 2 * BUTTON_PADDING_X` (margin, place button, gap,
      Menu, margin);
    - scene button: `screenWidth - 2 * MARGIN - 2 * BUTTON_PADDING_X`.
  - `checkContent(content): string[]` with the spec's parameter.

Report lines (`›` is U+203A with a space each side). A script is named by its place and spot label
(`rotorBar › The bar`), `<place> › description`, or `journeys › <way>`; a node by its key in
`nodes`, `start` for an inline start node, and `<parent> › next` or `<parent> › "<choice text>"` for
an inline node reached from another. `<p>` is that path.

| Rule                                                | Line                                                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A word of a node's text or a choice's text is > 16  | `<p>: "<word>" has <n> characters, and 16 fit`                                                                                                                                   |
| A page has an odd number of `*`                     | `<p>: page <i> has <n> italic marks` (pages from 1)                                                                                                                              |
| A node has no `speaker`                             | `<p>: no speaker`                                                                                                                                                                |
| A speaker is longer than the title room             | `<p>: the title "<speaker>" has <n> characters, and 19 fit`                                                                                                                      |
| `shortName ?? name` is longer than the place button | `<id>: the name has <n> characters and the place button holds 14; give a shortName` (with a `shortName`: `<id>: the shortName has <n> characters and the place button holds 14`) |
| A spot label is longer than the scene button        | `<id> › "<label>": the label has <n> characters, and 21 fit`                                                                                                                     |
| A spot's `x` or `y` is outside 0 to 1               | `<id> › <label>: x is <value>` (or `y is`)                                                                                                                                       |
| A place other than `train` has no entry             | `places.json: no entry for "<id>"`                                                                                                                                               |
| An entry has no place                               | `places.json: "<id>" is not a place`                                                                                                                                             |
| An entry's kind is missing or not `place`/`stop`    | `places.json › <id>: no kind` / `places.json › <id>: kind is "<kind>", not "place" or "stop"`                                                                                    |
| An entry has no position                            | `places.json › <id>: no position; run the fill script`                                                                                                                           |
| An expected journey is missing                      | `travel.json: no journey <from> › <way> › <to>`                                                                                                                                  |
| A journey is not expected                           | `travel.json: <from> › <way> › <to> is not a journey the game offers`                                                                                                            |
| Minutes not a whole number above 0                  | `travel.json › <from> › <way> › <to>: minutes is <value>`                                                                                                                        |
| A price not a whole number, 0 or more               | `travel.json › <from> › <way> › <to>: price is <value>`                                                                                                                          |
| A tram or taxi journey without a price              | `travel.json › <from> › <way> › <to>: no price`                                                                                                                                  |

The numbers in a line are the limits of `getLabelRoom()` and `WORD_ROOM`, not literals. A text or a
start that is a function is called once per id of `content.places`, with
`createNight({place, minutes: 1020, money: 350})`; the same line is reported once. The off-map place
is a module constant, `OFF_THE_MAP = new Set(['train'])`, with a comment that the train moves and
has no position.

- [ ] **Step 1: Write the failing tests**

`tests/getLabelRoom.test.ts`, `describe(getLabelRoom, …)`: the default gives
`{title: 19, placeButton: 14, sceneButton: 21}`; 480 gives
`{title: 46, placeButton: 70, sceneButton: 76}`.

`tests/checkContent.test.ts`, `describe(checkContent, …)`. A good sample built in the file: places
`train` (no entry), `zidenice`, `rotorBar`, `namestiRepubliky`, with the names and short names of
the spec's table, each with a one-node description and one spot, every node with a speaker;
`placeData` with the three entries (`zidenice` and `rotorBar` of kind `place`,
`rotorBar.nearestTramStop.name` equal to `namestiRepubliky.tramStop`, all with positions); `travel`
built from `getExpectedJourneys(placeData)` with `{minutes: 10}` on foot and
`{minutes: 10, price: 25}` otherwise; `journeys` of three one-node scripts.

- the good sample gives `[]`.
- one test per row of the table: a copy of the sample (spread for places, `structuredClone` for the
  data) with the one fault, and `toContain` the exact line.
- a text function is called once per place: a spy text on one node is called 4 times, and a long
  word in its result is reported once.

Run: `npx vitest run --project unit tests/getLabelRoom.test.ts tests/checkContent.test.ts` Expected:
FAIL, modules not found.

- [ ] **Step 2: Move the sizes and implement**

Move the four constants as in Interfaces (each keeps its comment). Implement `getLabelRoom.ts` and
`checkContent.ts`.

- [ ] **Step 3: Run, typecheck, lint, commit**

```bash
npx vitest run
npm run typecheck
npx eslint source tests
git add source tests
git commit -m "Add the checker of the game's content"
```

Expected: both projects PASS (the story window's tests see the same sizes); typecheck 0; eslint 0
errors.

### Task 4: The game's content

**Files:**

- Move: `source/game/content/barPicture.ts` → `source/game/content/pictures/barPicture.ts`
  (`git mv`, content unchanged); update the import in `mainMenuScreen.ts` and `samplePlace.ts`, and
  the `vitest.mock(import(…))` path and the type import in `tests/nightScreen.browser.test.ts`,
  `tests/nightScreenNarrow.browser.test.ts`, `tests/mainMenu.browser.test.tsx`, and the import in
  `tests/placePicture.browser.test.ts`
- Create: `source/game/content/pictures/standInPicture.ts`,
  `source/game/content/places/{train,zidenice,hlavniNadrazi,whiskyShop,rotorBar,namestiRepubliky,malinovskehoNamesti}.ts`,
  `source/game/content/places.ts`, `source/game/content/journeys.ts`,
  `source/game/content/nightStart.ts`, `scripts/list-stand-ins.mjs`
- Test: `tests/content.test.ts`, `tests/listStandIns.test.ts`; modify
  `tests/placePicture.browser.test.ts`

**Interfaces:**

- Consumes: Task 1's types and helpers; `checkContent`, `getLabelRoom` (Task 3); the data files.
- Produces:
  - `places: Record<PlaceId, Place>` (`content/places.ts`); each place file exports one `Place`
    named as its id (`export const rotorBar: Place`).
  - `journeys: Record<Way, RunnableDialogueScript<Night>>` (`content/journeys.ts`).
  - `nightStart: NightStart` (`content/nightStart.ts`) =
    `{places, travel, place: 'train', minutes: 1020, money: 350}`, `travel` imported from
    `./data/travel.json` (default import; if lint rejects it, add `with {type: 'json'}`). The object
    is mutable on purpose: the jump-in and the tests write into it.
  - `standInPicture: string` (`content/pictures/standInPicture.ts`).
  - `countTags(source: string): {standIn: number; written: number}` from
    `scripts/list-stand-ins.mjs` (`written` counts `` prose` ``; a tag is
    `\bstandIn\`` or `\bprose\``).

The places. Spots of the stand-in places lie at `(0.3, 0.3)`, `(0.7, 0.55)` and `(0.5, 0.8)` in the
order of the spec's table, the way out last; their vertical gaps keep any two buttons apart on every
screen. The two bars take the sample bar's positions:

| Place      | Spot → position                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| whiskyShop | The shelves `(0.22, 0.51)`, The shopkeeper `(0.14, 0.93)`, Two regulars `(0.7, 0.84)`, The door `(0.91, 0.4)` |
| rotorBar   | The bar `(0.22, 0.51)`, The smokers `(0.14, 0.93)`, The corner table `(0.7, 0.84)`, The door `(0.91, 0.4)`    |

- Pictures: `whiskyShop` and `rotorBar` use `barPicture`; the other five `standInPicture`.
- Way outs: every place but the train uses
  `createWayOut({speaker: <the spot label>, text: standIn`…`, ways: ['walk', 'tram', 'taxi']})`. The
  train's door is the spec's hand-written script, verbatim (4 minutes to Židenice, 9 to the main
  station).
- The dram and the beer: The shelves offers "Pour a dram" (node `dram`, `onEnter`: money −90,
  minutes +15) and "Not now"; The bar offers "Order a beer" (node `beer`: money −45, minutes +10)
  and "Not now". Every other spot is one node without choices.
- Descriptions: speaker is the spec's "Title of its description"; two or three sentences each.
- Each file starts with the comment that its text is stand-in text, that the author replaces
  `standIn` by `prose` when writing the real text, and the limits of Global Constraints.
- Journeys: one inline node each, speakers as Global Constraints, a text function that names the
  destination as `nightStart.places[night.place]?.name ?? 'the next place'`.
- `standInPicture`: a `picture` function of a few lines: black, plus
  `tone(ink(INK_BLACK), power * glow(distance(point, LAMP), 30.0), WARM, 0.3)` with
  `LAMP = vec2(240.0, 70.0)` and `power = 0.85 + 0.15 * sin(t * 0.8)`, and a comment that it stands
  in for a place whose picture is not drawn yet.
- `list-stand-ins.mjs` reads `source/game/content/places/*.ts` (sorted) and
  `source/game/content/journeys.ts` as text, and the two data files, and prints the spec's table:
  the name column padded to 25, the two counts padded to 8 and 9; then
  `Places not checked:   <n> of <all>` and `Journeys not checked: <n> of <all>`, counting
  `computed: true`. The entry point as in the atlas script.

- [ ] **Step 1: Move the bar's picture**

`git mv` and the path updates of Files. Run: `npx vitest run --project unit && npm run typecheck`
Expected: PASS (nothing else changed).

- [ ] **Step 2: Write the failing tests**

`tests/content.test.ts` (unit):

- `the game's content has no problem`: `checkContent({places, journeys, placeData, travel})` with
  `placeData` imported from `../source/game/content/data/places.json` gives `[]`.
- `places holds the seven places by their ids`: `Object.keys(places)` sorted equals the seven ids,
  and each place's `id` is its key.
- `a night starts on the train at 17:00 with 350 Kč`: `nightStart.place`, `minutes`, `money`, and
  `nightStart.places === places`.
- `no two scene buttons of a place overlap`: for each place and each screen 480 × 270, 195 × 350 and
  146 × 262, the boxes from `getSpotPosition` with `getSceneArea(w, h)` and a button size of
  `label.length * 6 + 12` × 16 overlap nowhere (a local `doBoxesOverlap`, as the helpers' one).

`tests/listStandIns.test.ts`, `describe(countTags, …)`: a sample source with two `` standIn` ``, one
`` prose` ``, and the words `standInPicture` and `prose` without a backtick gives
`{standIn: 2, written: 1}`.

`tests/placePicture.browser.test.ts` gains `describe('the stand-in picture', …)`: the constructor
does not throw; after `resize(480, 270)` and `update(frame(0))`, the pixel at
`toScreen({x: 240, y: 70}, …)` is not black, and `(0, 0)` and `(479, 269)` are black.

Run: `npx vitest run --project unit tests/content.test.ts tests/listStandIns.test.ts` Expected:
FAIL, modules not found.

- [ ] **Step 3: Write the content and the list script**

As in Interfaces and the spec's table of places and stand-in ideas. The text is invented stand-in
text.

- [ ] **Step 4: Run, lint, commit**

```bash
npx vitest run
node scripts/list-stand-ins.mjs
npm run typecheck
npx eslint source tests scripts
git add source tests scripts
git commit -m "Write the seven places, the journeys and the stand-in picture"
```

Expected: PASS; the list shows the eight files with stand-in counts and 0 written, and the data's
unchecked counts; typecheck 0; eslint 0 errors. If the checker reports a problem, fix the content,
never the checker.

### Task 5: The night screen shows the night's place

**Files:**

- Modify: `source/game/screens/nightScreen.ts`, `tests/nightScreenHelpers.tsx`,
  `tests/nightScreen.browser.test.ts`, `tests/nightScreenNarrow.browser.test.ts`,
  `tests/mainMenu.browser.test.tsx`
- Create: `tests/fixedWorld.ts`, `tests/nightScreenPlaces.browser.test.ts`
- Delete: `source/game/content/samplePlace.ts`, `tests/samplePlace.test.ts`

**Interfaces:**

- Consumes: `nightStart`, `Place`, `createNight` (Tasks 1, 4).
- Produces:
  - `NightScreenContents`: `hasStoryClosed: boolean`, `menuButton`, `menuModal`, `night`,
    `optionsModal`, `picture: PlacePicture | null`, `place: Place | null`,
    `placeButton: Button | null`, `spotButtons: Button[]`, `statusText`, `storyWindow`.
  - `tests/fixedWorld.ts`: `FIXED_BAR`, `FIXED_SQUARE`, `FIXED_STOP`, `FIXED_BROKEN` (test ids cast
    to `PlaceId`: `'testBar'`, `'testSquare'`, `'testStop'`, `'testBroken'`);
    `fixedPlaces: Record<string, Place>`; `fixedTravel: Travel`; `fixedStart: NightStart` with
    `place: FIXED_BAR`, `minutes: 1180`, `money: 350`.
  - `tests/nightScreenHelpers.tsx` gains:
    `useFixedWorld(start?: Partial<Pick<NightStart, 'minutes' | 'money' | 'place'>>): () => void`
    (puts `fixedStart` and the overrides into `nightStart` and returns the function that puts the
    game's own values back); `restartAt(harness, place): Promise<void>` (sets `nightStart.place`,
    shows the main menu with `game.showScreen`, then `startNewGame`);
    `waitForPlace(harness, place): Promise<void>` (10 s); `pressThrough(storyWindow): Promise<void>`
    (Enter while the runner is neither `choosing` nor `ended`, at most 40 presses);
    `getPicture(harness)`, `getPlaceButton(harness)` and `getPlace(harness)` (throw when `null`).
    `getSpotButton` finds the label in `nightScreen.contents.place.spots`.

The fixed world:

| Id           | Name, short name                             | Picture                                                     | Spots                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testBar`    | "The bar"                                    | `PROOF_PICTURE`                                             | samplePlace's description and four spots, text and positions unchanged, with its comment on the limits                                                                                                                                |
| `testSquare` | "The square by the old market", "The square" | `PROOF_PICTURE`                                             | "The passage" `(0.3, 0.3)`: one node whose `onEnter` sets `night.place = FIXED_BAR`; "The street" `(0.7, 0.55)`: `createWayOut` with all three ways; "A wrong turn" `(0.5, 0.8)`: `onEnter` sets `night.place = 'nowhere' as PlaceId` |
| `testStop`   | "The stop"                                   | `PROOF_PICTURE`                                             | "The street" `(0.5, 0.4)`: `createWayOut` with all three ways; "A dark lane" `(0.5, 0.8)`: `onEnter` sets `night.place = FIXED_BROKEN`                                                                                                |
| `testBroken` | "The broken place"                           | `'vec3 picture(ivec2 p, vec2 q, float t) { return nope; }'` | none                                                                                                                                                                                                                                  |

Every description and node has a speaker and one sentence of plain text; the square's description
speaker is "The square". `fixedTravel`: `testBar`: walk `{testSquare: {minutes: 12}}`, tram
`{testStop: {minutes: 9, price: 25}}`, taxi `{testSquare: {minutes: 6, price: 120}}`; `testSquare`:
walk `{testBar: {minutes: 12}}`, tram `{testStop: {minutes: 8, price: 25}}`, taxi
`{testBar: {minutes: 6, price: 120}}`; `testStop`: walk
`{testBar: {minutes: 4}, testSquare: {minutes: 7}}`, taxi
`{testBar: {minutes: 5, price: 90}, testSquare: {minutes: 5, price: 90}}`, no tram.

The night screen:

- `onAttach` builds only `statusText` and `menuButton`; the place members start `null`/`[]`.
- `showPlace(screen, place)`: the spec's six steps. The place button is labelled
  `place.shortName ?? place.name` and opens `place.description`;
  `ui.addChild(placeButton, ...spotButtons)` (no overlay is open when it runs); the picture goes in
  with `screen.addToView`.
- `leavePlace(screen)`: the spec's paragraph (`ui.removeChild`, then `destroy()` on each button;
  `screen.removeFromView` then `destroy()` on the picture; `place` and `placeButton` `null`,
  `spotButtons` `[]`).
- `layOut`: the status line stands at `MARGIN + getButtonWidth(label) + MARGIN` beside the place
  button on a wide screen, and at `MARGIN` when no place is shown; spots from `place.spots`;
  `picture?.resize(…)`.
- `onShow`: `night = createNight(nightStart)`, `hasStoryClosed = false`, `writeStatus`, then
  `showPlace(screen, nightStart.places[night.place])`; a missing place throws
  `` `The night starts in "${night.place}", which is not a place!` `` (the error screen shows it).
- `onHide`: destroys the windows topmost first, then `leavePlace`.
- The story window's `onClosed`: `storyWindow = null`, `writeStatus`, `hasStoryClosed = true`.
- `onUpdate`, in this order: `picture` speed (when there is a picture); `storyWindow?.update`; then,
  when `hasStoryClosed`, `screen.state === 'shown'` and `ui.topOverlay === null`: set
  `hasStoryClosed = false` and call `actOnNight(screen)` inside `try`; a thrown error goes to
  `errorScreen.contents.showError(error)` and `void game.showScreen(errorScreen)`; last, the cancel
  rule as today.
- `actOnNight(screen)`: rule 1 of the spec. The warning reads
  `` `No place "${night.place}"; the night stays in "${place.id}".` ``.

`SAMPLE_START` goes. A comment at `actOnNight`'s call says why it waits for no overlay (Review
Focus, first line).

- [ ] **Step 1: Build the fixed world and move the tests onto it**

Create `tests/fixedWorld.ts` and the helpers. In `nightScreen.browser.test.ts` and
`nightScreenNarrow.browser.test.ts`: `beforeAll` calls `let restore = useFixedWorld()` right after
`bootGame` (`restore()` in `afterAll`); `samplePlace` becomes `fixedPlaces[FIXED_BAR]`;
`contents.picture` and `contents.placeButton` go through the helpers. Every expectation stays as it
is. The word test keeps its name with "the sample bar" for "the sample place".

Delete `samplePlace.ts` and `samplePlace.test.ts` (the checker holds its rule for the game's
content).

- [ ] **Step 2: Write the failing tests**

`tests/nightScreenPlaces.browser.test.ts`, `describe('night screen places', {timeout: 180_000}, …)`,
booted at 960 × 540 with `barPicture` mocked to `PROOF_PICTURE` (as the other night screen files),
`useFixedWorld({place: FIXED_SQUARE})`, and `console.warn` spied in `beforeAll` (restored in
`afterAll`). Tests in this order:

1. `a place with a short name shows it on the place button`: after `startNewGame`, the place is "The
   square by the old market", the place button's label is "The square", and the status line's left
   edge is `4 + 10 * 6 + 12 + 4`.
2. `a script that names an unknown place leaves the player where they are`: open "A wrong turn",
   `pressThrough`, Enter, `waitForNoStoryWindow`, two frames: `console.warn` was called with a
   message containing `"nowhere"`, `night.place` is `FIXED_SQUARE`, and the scene buttons are the
   same instances.
3. `the place waits while the menu lies over the closing window`: keep the picture and the spot
   buttons; open "The passage"; call `storyWindow.dialogue.advance()` until `phase === 'ended'` (at
   most 10 calls), then `storyWindow.update(0)`, and expect `storyWindow.state` to be `'closing'`;
   `nightScreen.contents.menuButton.activate()` (the menu opens over it in the same turn);
   `waitForNoStoryWindow`, two frames: the place is still `FIXED_SQUARE` and the menu is the top
   overlay. Then `menuModal.close()` and `waitForPlace(harness, FIXED_BAR)`.
4. `a script that sets night.place shows that place`, right after test 3: the old spot buttons'
   views are destroyed and none of them is in `ui.children`; the four new ones are, each with the
   box `getSpotPosition` gives; the place button reads "The bar"; the picture is another instance
   and the old one's view is destroyed; a story window is open with the speaker "The bar".
5. `a place whose picture does not compile shows the error screen` (last: it leaves the error screen
   shown): `restartAt(harness, FIXED_STOP)`, close the description, open "A dark lane",
   `pressThrough`, Enter; `vitest.waitFor` until `game.currentScreen` is the error screen (imported
   after `bootGame`).

In `tests/mainMenu.browser.test.tsx`, after the last test:
`New Game shows the night screen in the train` (it follows the test that starts a new game): import
`nightScreen` dynamically; expect its `contents.place?.id` to be `'train'`.

Run: `npx vitest run --project browser tests/nightScreenPlaces.browser.test.ts` Expected: FAIL (the
screen still shows the sample bar's buttons from `onAttach`).

- [ ] **Step 3: Implement the night screen**

As in Interfaces.

- [ ] **Step 4: Run, typecheck, lint, commit**

```bash
npx vitest run
npm run typecheck
npx eslint source tests
git add -A source tests
git commit -m "Show the night's place and change it when a script moves the player"
```

Expected: both projects PASS, with every old night screen expectation unchanged; typecheck 0; eslint
0 errors.

### Task 6: The travel window

**Files:**

- Create: `source/game/screens/travelWindow.ts`
- Test: `tests/travelWindow.browser.test.ts`; `tests/nightScreenHelpers.tsx` gains `getTravelParts`

**Interfaces:**

- Consumes: `getDestinations`, `formatJourney`, `NightStart`, `Destination`, `Way`, `PlaceId` (Task
  1); `WINDOW_WIDTH`, `MARGIN`, `NARROW_WIDTH`, `LINE_HEIGHT`, `BUTTON_PADDING_X`,
  `BUTTON_PADDING_Y`, `GLYPH_WIDTH`; `createWindowTitle`, `WINDOW_PADDING`, `measureText`.
- Produces: `TravelWindowOptions` and `TravelWindow` as the spec's block, plus `get way(): Way`. The
  modal's only child is a `Panel` whose children are, in order: the title block
  (`createWindowTitle`), the row (a `Container` of one `Button` per way), the list (a `Container` of
  one `Button` per destination) and the "Back" `Button`. A destination button holds two `Text`s, the
  name and the numbers.
  `getTravelParts(travelWindow): {back: Button; destinations: Button[]; panel: Panel; title: Text; ways: Button[]}`
  reads that structure.

Decisions the spec leaves to the plan:

- The window is a `Panel` in a `Modal` with `fadeDuration: 200` and the screen's scheduler, centred
  as `openMenuModal` centres the menu; the constructor adds the modal to `ui`.
- Widths: window `Math.min(WINDOW_WIDTH, Math.floor(screenWidth - 2 * MARGIN))`; inside it,
  `textWidth = window − 2 * 12`; a button's label width `textWidth − 2 * BUTTON_PADDING_X`.
- Gaps: 4 under the title; 8 between the row, the list and Back; 4 between two destinations;
  `WAY_GAP = 3` between way buttons, with the comment that three buttons of 36 and two gaps of 3 are
  the 114 inside the window on the narrowest screen, and that a ring reaches 2 out. The way buttons
  have `flexGrow: 1` and `flexBasis: 0`, height 16.
- A destination on a wide screen (`screenWidth >= NARROW_WIDTH`): one row, the name left and the
  numbers right; the name wraps (`wrapText`, label measure) to the label width less the numbers'
  width less 12. On a narrow screen: the name wrapped to the label width, the numbers on a line
  under it. Each `Text` gets an explicit size; the button's height is its lines × 12 + 4.
- Height: the list's height is the largest list height of all `ways`, so Back and the row stay put
  when the way changes. An empty list is 0 high.
- Switching the way rebuilds only the list's buttons and sets the title text; then
  `ui.focus(pressedButton)`.
- `resize(screenWidth)` does nothing on a destroyed modal; otherwise it rebuilds the panel's
  children for the new width and puts the focus back at the same position: the same way button, the
  destination of the same index, or Back.
- Initial focus: the modal's `initialFocus` is the first destination, or Back when the list is
  empty. The buttons are built before the modal, as `openMenuModal` builds Resume.
- Every button checks `modal.state` first and does nothing while it is `'closing'` or `'closed'`. A
  pick stores the destination and calls `modal.close()`; Back calls `modal.close()`. The modal's
  `onClosed` calls `options.onClosed(picked)`.

- [ ] **Step 1: Write the failing tests**

`tests/travelWindow.browser.test.ts`, `describe('travel window', {timeout: 180_000}, …)`, booted at
960 × 540 with `barPicture` mocked, `useFixedWorld({place: FIXED_STOP})`, `startNewGame`, and the
description closed. A local `openTravel(way, ways = ['walk', 'tram', 'taxi'], start = nightStart)`
builds
`new TravelWindow({ui: nightScreen.ui, scheduler: nightScreen.scheduler, start, from: FIXED_STOP, way, ways, screenWidth: <art width>, onClosed})`
with `onClosed` a spy, and `afterEach` destroys a window that is still open.

- `the title, the row and the list of each way`: walk gives the title "On foot", the way labels
  "Walk", "Tram", "Taxi", and the destinations "The bar" / "4 min" and "The square by the old
  market" / "7 min"; taxi gives "By taxi" with "5 min 90 Kč" twice, "The bar" first; tram gives "By
  tram" and no destination.
- `the first destination has the focus and the ring`: `ui.focused` is it and `ui.isRingVisible` is
  true; for tram, Back has the focus.
- `a way's button switches the title and the list and keeps the focus`: focus Tram, Enter: title "By
  tram", no destination, the focus on Tram; the panel's box and the boxes of the row and Back are
  equal before and after; pressing Tram again changes nothing.
- `Back closes it with nothing picked`, and `Escape closes it with nothing picked`: after the fade,
  `onClosed` was called once with `null`.
- `a pick closes it and reports the destination`: Enter on the first destination; `onClosed`
  receives the destination of "The bar", `minutes` 4.
- `a press while it fades does nothing`: `ui.cancel()`, then, in the same turn,
  `ui.focus(destination); ui.activate()` and `ui.focus(taxiButton); ui.activate()`; after the fade
  `onClosed` got `null` and the title never changed.
- `real taps switch the way, pick and go back`: `tap` the Taxi button, then the first destination;
  `onClosed` receives the taxi destination of "The bar". In a second window, `tap` Back; `onClosed`
  receives `null`.
- `on a 146 × 262 screen the row fits, the numbers stand under the name, and the window fits`: set
  the viewport to 292 × 524 (wait for the size), open walk: the three way buttons lie inside the
  panel's inner box and do not overlap; each destination's numbers lie under its name; "The square
  by the old market" takes two lines; the panel lies inside 146 × 262. Restore the viewport.
- `the game's longest list fits 146 × 262`: at 292 × 524, with `start` a copy of the game's own
  values (`{...nightStart, places, travel}` from `content/places.ts` and `data/travel.json`), find
  the `from` and way with the most destinations by `getDestinations`; open it from that place; the
  panel lies inside the screen.
- `a resize from wide to narrow lays the list out again and keeps the way and the focus`: open taxi,
  move the focus to the second destination, set the viewport to 292 × 524 and call `resize(146)`:
  the title is still "By taxi", the panel is 138 wide, the numbers stand under the names, and the
  focus is on the second destination's new button.

Run: `npx vitest run --project browser tests/travelWindow.browser.test.ts` Expected: FAIL, module
not found.

- [ ] **Step 2: Implement `TravelWindow`**

As in Interfaces.

- [ ] **Step 3: Run, typecheck, lint, commit**

```bash
npx vitest run --project browser tests/travelWindow.browser.test.ts
npm run typecheck
npx eslint source tests
git add source tests
git commit -m "Add the travel window"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 7: Travel on the night screen

**Files:**

- Modify: `source/game/screens/nightScreen.ts`, `tests/nightScreenPlaces.browser.test.ts`

**Interfaces:**

- Consumes: `TravelWindow` (Task 6); `journeys`, `takeJourney` (Tasks 1, 4).
- Produces: `NightScreenContents.travelWindow: TravelWindow | null`.

The night screen:

- `actOnNight` gains rule 2: when `night.leaving` is set and the place is unchanged, it opens the
  travel window (`from: place.id`, the way and the ways) and sets `night.leaving = null`.
- The travel window's `onClosed(destination)`: `travelWindow = null`; with a destination,
  `takeJourney`, `leavePlace`, `writeStatus`, `layOut`, and `openStory(screen, journeys[way])`.
- `layOut` calls `travelWindow?.resize(area.width)`.
- `onHide` destroys `travelWindow.modal` between the menu and the story window, and sets it to
  `null`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/nightScreenPlaces.browser.test.ts`, before test 5 (each starts with
`restartAt(harness, FIXED_SQUARE)` and closes the description with `pressThrough` and Enter):

- `a way out's choice opens the travel window on that way`: open "The street", `pressThrough`, focus
  the choice "Take the tram", Enter; wait for `travelWindow`: its `way` is `'tram'`, and
  `night.leaving` is `null`.
- `Stay closes the way out and opens nothing`: the same with "Stay": after the window has closed and
  two frames, `travelWindow` is `null` and the night equals the night before.
- `Escape closes the travel window and nothing has changed`: open it with "Walk", Escape, wait for
  `travelWindow === null`: the night is equal to the night before and the scene buttons are the same
  instances.
- `a journey, from the door to the arrival`: "Take a taxi", Enter on "The bar" (6 min, 120 Kč); wait
  for a story window: the status reads `'19:46   230 Kč   Sober'`, `night.place` is `FIXED_BAR`, the
  window's speaker is "The taxi", and `place`, `placeButton` and `picture` are `null` and
  `spotButtons` empty; `pressThrough`, Enter, `waitForPlace(harness, FIXED_BAR)`: the bar's
  description is open.
- `a resize during a journey`: start a walk to the bar; while its story window is open, set the
  viewport to 292 × 524: the status line lies at left 4 under the top row (top 24), and the story
  window's panel is 138 wide; restore the viewport, and the status line is back at the top row (left
  4).
- `a resize with the travel window open lays it out again`: open it with "Walk", set the viewport to
  292 × 524: its panel is 138 wide; restore.
- `Quit to menu with the travel window open leaves nothing behind`: open it, then
  `await game.showScreen(mainMenuScreen)`: `travelWindow`, `storyWindow`, `place`, `placeButton` and
  `picture` are `null`, `ui.children` holds only the status line and the Menu button, and the travel
  window's modal view is destroyed.
- `Quit to menu during a journey leaves nothing behind`: start a journey; Escape (the menu opens
  over the journey); activate Quit to menu: the same checks; then `startNewGame` shows the square
  again with `'19:40   350 Kč   Sober'`.

Run: `npx vitest run --project browser tests/nightScreenPlaces.browser.test.ts` Expected: FAIL on
the new tests (no travel window opens).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Run, typecheck, lint, commit**

```bash
npx vitest run
npm run typecheck
npx eslint source tests
git add source tests
git commit -m "Travel between places through the travel window"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 8: The jump-in

**Files:**

- Create: `source/game/core/getJumpIn.ts`, `tests/getJumpIn.test.ts`, `tests/jumpIn.browser.test.ts`
- Modify: `source/routes/_index.tsx`, `tests/nightScreenHelpers.tsx`

**Interfaces:**

- Consumes: `nightStart`, `Place`, `PlaceId`.
- Produces: `getJumpIn(search, places)` as the spec's block.
  `bootGame(width, height, {screen = 'mainMenu'}: {screen?: 'mainMenu' | 'night'} = {})` waits for
  that screen to be shown.

Forms: `place` a key of `places`; `time` matching `^(\d{2}):(\d{2})$` with hours 0–23 and minutes
0–59, `hours * 60 + minutes`, plus 1440 when the hours are below 12; `money` matching `^-?\d+$`.
`getJumpIn` warns once for each value it drops and once for an unknown place, and returns an object
without the keys it dropped.

`_index.tsx`: the dynamic imports gain `../game/content/nightStart.js` and
`../game/core/getJumpIn.js`. After the screens are added,
`getJumpIn(globalThis.location.search, nightStart.places)`: with a result,
`Object.assign(nightStart, jumpIn)` and show `nightScreen`; otherwise show `mainMenuScreen` as
today. The comment says the jump-in works in every build so a scene can be tried on a phone.

- [ ] **Step 1: Write the failing tests**

`tests/getJumpIn.test.ts`, `describe(getJumpIn, …)`, with the game's `places`:

- `?place=rotorBar&time=23:10&money=120` → `{place: 'rotorBar', minutes: 1390, money: 120}`.
- `time=01:30` → 1530; `00:00` → 1440; `12:00` → 720; `money=-40` → −40.
- an unknown place, and no `place` at all, give `null`; the unknown one warns.
- `7:30`, `24:00`, `12:60` for `time` and `1e3`, `12.5`, `abc` for `money` are dropped: the result
  has the place and no such key, and each warns.

`tests/jumpIn.browser.test.ts` (with `barPicture` mocked): before `bootGame`, add `place=rotorBar`,
`time=23:10` and `money=120` to the page's address with `history.replaceState` (keeping the
address's own parameters), and put the old address back in `afterAll`;
`bootGame(960, 540, {screen: 'night'})`. Test:
`the game started with a jump-in shows that place, hour and money`: the night screen is current, its
place is `rotorBar`, the status line reads `'23:10   120 Kč   Sober'` and the description's speaker
is "Rotor Bar".

Run: `npx vitest run tests/getJumpIn.test.ts tests/jumpIn.browser.test.ts` Expected: FAIL.

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Run everything, typecheck, lint, commit**

```bash
npx vitest run
npm run typecheck
npx eslint source tests
git add source tests
git commit -m "Start a night at a place, hour and money given in the address"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 9: Whole check and hand-over

**Files:** `docs/direction.md`.

- [ ] **Step 1: Run everything**

Run (from the repository root):
`npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1`
Expected: every task succeeds.

Then, from `apps/foam`: `node scripts/fill-travel-data.mjs` adds nothing and
`git status --porcelain source/game/content/data` prints nothing (a busy server: wait and run
again); `node scripts/list-stand-ins.mjs` prints the list. And
`git diff --stat 134a706 -- ../somewhere` prints nothing, and
`git diff --stat 134a706 -- ../../packages/tellurion` lists only the three test files and two source
files of the Tellurion plan.

- [ ] **Step 2: Bring the direction document in line**

In `apps/foam/docs/direction.md`, so that it states what is built:

- The status line: phases 1 to 3 are built, and of phase 4 the dialogue choice effect and places and
  travel.
- Items 1 and 2 of the phase 4 list: "It is built" instead of "It is designed".
- The "Long names, for phase 4" bullet goes (a place has a short name, and the checker holds every
  label to its room); the sentence before the list then speaks of one thing that waits.

Commit: `git commit -am "State that places and travel are built"`.

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build, in a wide window and one narrower than 240 art pixels (a phone held upright): every
step of the spec's "What the player sees"; the travel window's look and its focus ring; a journey
over the black screen; `/?place=rotorBar&time=23:10&money=120`. Also report that a jump-in skips the
main menu, so the menu's music does not start, and the unchecked counts of
`node scripts/list-stand-ins.mjs`.
