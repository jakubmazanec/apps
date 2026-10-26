# Saving and Continue (Foam Phase 7, Spec 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** An unfinished night is saved when a story window's text ends and when a journey is picked,
Continue on the main menu resumes it at its last save and Quit to menu keeps it, a record of past
nights and the set of texts read are kept across nights, a Collection window lists the stories and
the nights with a Reset, and the default seed counts the nights started on one day.

**Architecture:** The saved night is the night's plain data, less `random`, `pick`, the collection
and the way out, in a nullable all-or-nothing store; `restoreNight` builds the night back, and the
night screen hands it to `actOnNight`, the function that already decides what follows a closed
window. Two more stores keep the record with the day's count and the paths of the texts read. The
Stories window's paging becomes a shared `ListWindow` that the Collection window uses too, and one
confirmation modal serves Start on a saved night and Reset.

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tellurion
(`PersistedStore`, `Modal`, `Dialogue`), zod 4, Vitest 4 (`unit` in Node, `browser` in Playwright's
Chromium), Prettier 3, Turborepo.

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-27-saving-and-continue-design.md`

Runs after spec 2, versions, is built (`docs/superpowers/plans/2026-10-27-versions.md`): `pick` and
`events` on `Night`, `createNight`'s `events`, and `startNewGame(harness, seed?)` and `startFrom`
carrying a seed into the New night window's field. The direction document already carries the Saving
and Stories rows and the phase 7 paragraph with this spec's link; this plan only states that the
spec is built.

## Global Constraints

- Only files under `apps/foam/` change. Nothing under `apps/somewhere/` or `packages/tellurion/`. No
  dependency changes: never run an install, never touch a lockfile.
- Work on the current branch, `somewhere-update`. Commit at the end of each task with `git add` of
  the task's own paths; a message is one short imperative sentence, with no prefix and no trailer
  lines. Never use `git stash`. Commands run from `apps/foam` unless a step says otherwise.
- **Tests.** A task runs only the tests it touches: the unit files named, or the browser files
  named, plus `npm run typecheck` and `npx eslint source tests scripts`. The whole suite (about nine
  minutes) is CI's, after the last task. Lint expectation: 0 errors; the known warnings of earlier
  phases may print.
- Code style: `let` for locals, `const` only at module level; relative imports end in `.js`;
  comments say why and stay within 100 columns; never remove a comment, update one that a change
  makes untrue. Prettier formats (printWidth 100, no bracket spacing, single quotes, experimental
  ternaries) and lint fails on a difference: run `npx prettier --write` on the task's files before
  lint. Lint has `max-params` at 3 as a warning: a new helper takes at most three.
- `exactOptionalPropertyTypes` is on: never set an optional field to `undefined`; build an object
  with a field only when it has a value.
- Tests: the `vitest` object, not `vi`; a blank line separates a group of `expect` lines from other
  statements; `describe(fn, …)` when named after a function; no `expect` inside `beforeAll` or
  `beforeEach`; game modules are imported after `bootGame`, never at the top of a browser test
  (types only at the top; `nightStart`, the content modules, the test world `tests/fixedWorld.ts`
  and the pure core modules `core/hash.ts`, `core/night.ts` and `core/todaySeed.ts` import no game
  module and may be imported at the top); a browser file boots the game once and clears
  `localStorage` in `afterAll`; a test that writes into `nightStart` puts it back in `afterAll`,
  including `delete nightStart.quest` and `delete nightStart.drunkenness`. A store that hydrates at
  module load (`stories.ts`, `nights.ts`, `textsRead.ts`) is imported fresh through the `?fresh=`
  query, as `stories.browser.test.ts` does; a store a test seeds before the boot is written into
  `localStorage` before `bootGame` or the route's render.
- Stores: `PersistedStore` from `tellurion` with a zod schema; a field that must survive both a
  missing key and a bad value gets `.default(…).catch(…)`, as `settings.ts` does; the schema is
  `prefault`ed as `settings.ts` and `stories.ts` do.
- Exact values from the spec. The keys `foam:night`, `foam:nights` and `foam:textsRead`.
  `SEPARATOR = ' › '`. The loader's warning
  `The saved night is in "${place}", which is not a place.`
  `Ending = 'leave' | 'stay' | 'stranded'`. `getNextSeed(date)`: the date with no start on it,
  ``Number(`${date}${started + 1}`)`` after (202610272 for the second night of 20261027).
  `formatDate`: `27 Oct 2026` for 20261027, `1 Jan 2027` for 20270101. The console lines
  `Read: ${path}` and `Foam keeps ${nights} nights and ${texts} texts read.` with the list of paths
  as the second argument. The main menu's buttons are 96 wide, Continue above New Game and
  Collection between New Game and Options. The confirmation: the window padding, a column with a gap
  of 4, the title block 136 wide, the line wrapped to 136, two buttons 65 wide with 6 between, the
  action's label left and Close right, Close the initial focus. `Night in progress` /
  `Start ends the saved night.` / `Start` and `Reset` /
  `Everything the game kept goes: the stories, the nights, the texts read and the saved night.` /
  `Reset`. The Collection window: title `Collection`, the headings `Stories  ${n} found` and
  `Nights  ${n}` in italic, `None yet` under a heading with nothing to list, each night as
  `27 Oct 2026  Seed 202610272  Stayed` newest first with its titles under it indented by two
  spaces, the ending words `Left`, `Stayed` and `Stranded`, a null ending ending the line after the
  seed, a blank line between the lists, every line wrapped to the text's width.

## Review Focus

- **A quit during the closing's text, then Continue.** The save holds the room at the minute the
  last window ended, so the room opens under its description, the closing runs again when the
  description closes, and the player ends outside. Pinned in Task 7.
- **A quit during a journey's window, then Continue.** The pick was saved with the destination, so
  the destination opens under its description; the pick is paid and logged once and the journey's
  text never. Pinned in Task 7.
- **A find after a resume still toasts.** `storiesHandled` starts at the saved count, so a title
  found later in the resumed night queues its toast. Pinned in Task 7.
- **Enter twice in the New night window with a saved night.** The first opens the confirmation with
  Close focused, the second closes it: no night starts and the save stands. Pinned in Task 8.
- **A node reached through a function `start` is keyed by its table id,**
  `testPavement › The bar › open`, and the one node of a script written as `start` by `start`.
  Pinned in Task 4.

## File Structure

| File (under `apps/foam/`)                 | Responsibility                                                                                                                              | Task       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `source/game/core/night.ts`               | `Ending` and `ending` on the night; `restoreNight`                                                                                          | 1          |
| `source/game/content/nightEnd.ts`         | The three ending nodes write `ending`                                                                                                       | 1          |
| `source/game/core/save.ts`                | `SavedNight` (1); the schema, the store `foam:night`, `loadSavedNight`, `saveNight`, `clearSavedNight` (2)                                  | 1, 2       |
| `source/game/core/nights.ts`              | `PastNight`, the store `foam:nights`, `nights`, `recordNight`, `countStart`, `getNextSeed`, `forgetNights`                                  | 3          |
| `source/game/core/todaySeed.ts`           | `formatDate`                                                                                                                                | 3          |
| `source/game/core/contentPath.ts`         | `SEPARATOR`                                                                                                                                 | 4          |
| `source/game/core/textsRead.ts`           | The store `foam:textsRead`, `textsRead`, `markRead`, `forgetTextsRead`                                                                      | 4          |
| `source/game/core/checkContent.ts`        | Imports the separator                                                                                                                       | 4          |
| `source/game/screens/storyWindow.ts`      | `where`; `markRead` when a node's first page appears                                                                                        | 4          |
| `source/game/screens/nightScreen.ts`      | `where` for every window (4); the saves, the record and the clear, the collection read back (6); `resuming` and the resume (7)              | 4, 6, 7    |
| `source/routes/_index.tsx`                | The console line at boot                                                                                                                    | 4          |
| `source/game/screens/listWindow.ts`       | `ListWindow`: the Stories window's paging, shared                                                                                           | 5          |
| `source/game/screens/storiesWindow.ts`    | A use of the list window                                                                                                                    | 5          |
| `source/game/core/stories.ts`             | `reloadCollection`                                                                                                                          | 6          |
| `source/game/screens/mainMenuScreen.ts`   | Continue (7); the confirmation before Start and the start itself (8); Collection and Reset (9)                                              | 7, 8, 9    |
| `source/game/screens/confirmModal.ts`     | `openConfirmModal`                                                                                                                          | 8          |
| `source/game/screens/newNightModal.ts`    | The field reads the day's next seed                                                                                                         | 8          |
| `source/game/screens/collectionWindow.ts` | The other use of the list window: the two lists, Reset and Close                                                                            | 9          |
| `tests/nightScreenHelpers.tsx`            | `getStoriesParts` over the bottom row, `readLeaves` (5); `quitToMenu` (6); `continueNight` (7); `startNewGame` through the confirmation (8) | 5, 6, 7, 8 |
| `tests/confirmParts.ts`                   | `getConfirmParts`                                                                                                                           | 8          |
| `tests/continue.browser.test.ts`          | The texts read (4); the saves and the record (6); Continue (7)                                                                              | 4, 6, 7    |
| `tests/collectionWindow.browser.test.ts`  | The Collection window in pages on the narrowest screen                                                                                      | 9          |
| `docs/direction.md`, the spec             | State that the spec is built                                                                                                                | 10         |

---

### Task 1: The night's ending, and the night built back from its data

**Files:**

- Create: `source/game/core/save.ts` (the `SavedNight` type only; Task 2 fills the file)
- Modify: `source/game/core/night.ts:36-124` (the `Night` type and `createNight`), and after
  `createNight`; `source/game/content/nightEnd.ts:1-10,62-82` (the header comment, the `leave`,
  `stay` and `stranded` nodes)
- Test: `tests/night.test.ts`, `tests/content.test.ts:113-121,177-211`,
  `tests/nightScreen.browser.test.ts:1056-1070`

**Interfaces:**

- Consumes: `pick` and `events` on `Night` (spec 2).
- Produces, in `core/save.ts`: exactly the spec's `export type SavedNight` line with its doc
  comment, `Night` imported as a type. In `core/night.ts`: before `Night`, exactly the spec's
  `export type Ending`; on `Night`, after `events`, exactly the spec's `ending: Ending | null` with
  its doc comment; `createNight` starts it `null`; after `createNight`, exactly the spec's
  `restoreNight(saved: SavedNight, collection: Collection): Night` with its doc comment and body,
  `SavedNight` imported as a type from `./save.js`: `log.ts` and `night.ts` already import each
  other's types this way, and a type import evaluates nothing, so `night.test.ts` touches no
  storage. In `content/nightEnd.ts`: the `leave`, `stay` and `stranded` nodes each gain
  `onEnter: (night) => { night.ending = 'leave'; }` with their own name, under one sentence added to
  the header comment: the three ending nodes write `ending` on the night, as the quest's flags are
  written by content, and the record reads it.

- [ ] **Step 1: Write the failing tests**

`tests/night.test.ts`, with `restoreNight` and `type SavedNight` (from `core/save.js`) imported:

- The whole-object test gains `ending: null` after `events`.
- `describe(restoreNight)`,
  `rebuilds random and pick from the seed, starts leaving null and keeps every saved field`:
  `const SAVED: SavedNight = {seed: 7, rolls: 1, minutes: 1300, money: 120, place: 'rotorBarRoom', drunkenness: {level: 2, at: 1300}, roll: {value: 0.25, odds: 0.5, won: true}, log: [{kind: 'text', minutes: 1300, speaker: 'The bar', text: 'A line.'}], stories: [{title: 'A story', minutes: 1300}], quest: {hasBottle: false, bottleGiven: false, hasKeys: true, hasTicket: false}, events: ['wallet'], ending: 'stay'};`
  `let collection = {titles: ['A story']};` `restoreNight(SAVED, collection)` equals
  `{...SAVED, random: expect.any(Function) as unknown, pick: expect.any(Function) as unknown, collection, leaving: null}`;
  its `random('money')` is `hash(7, 'money')`; its `pick('key', {a: 0.5, b: 0.5})` equals
  `createNight({...START, seed: 7}).pick('key', {a: 0.5, b: 0.5})`; its `collection` is (`toBe`)
  `collection`.

`tests/content.test.ts`, with `type Ending` imported:

- `endingOf(quest: Partial<Quest>): Ending | null` beside `openEnd`: a night as `openEnd` builds it,
  a `Dialogue` on `nightEnd` over it, and the night's `ending`.
- `each ending node writes its name on entry, and both writes none until an answer`:
  `endingOf({hasTicket: true})` is `'leave'`, `endingOf({hasKeys: true})` is `'stay'`,
  `endingOf({})` is `'stranded'`; a night with both flags opened on `nightEnd` has `ending` null,
  and after `advance()` and `choose(0)` it is `'leave'`; a second such night after `choose(1)` has
  `'stay'`.
- `the game's content has no problem` stands: the checker runs the entry effects.

`tests/nightScreen.browser.test.ts:1056`: the comparison gains `ending: null` after `events`.

Run: `npx vitest run --project unit tests/night.test.ts tests/content.test.ts` Expected: FAIL
(`restoreNight` does not exist; `ending` is undefined).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/night.ts source/game/core/save.ts source/game/content/nightEnd.ts tests/night.test.ts tests/content.test.ts tests/nightScreen.browser.test.ts
npx vitest run --project unit tests/night.test.ts tests/content.test.ts
npx vitest run --project browser tests/nightScreen.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/night.ts source/game/core/save.ts source/game/content/nightEnd.ts tests/night.test.ts tests/content.test.ts tests/nightScreen.browser.test.ts
git commit -m "Give the night an ending the Morning text writes, and build a night back from its data"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 2: The saved night's store

**Files:**

- Modify: `source/game/core/save.ts` (Task 1 left only the type in it)
- Test: `tests/save.browser.test.ts` (new)

**Interfaces:**

- Consumes: `Night`, `PlaceId`, `Ending` (Task 1), `Place`, `PersistedStore` from `tellurion`.
- Produces: exactly the spec's `loadSavedNight(places)`, `saveNight(night)` and `clearSavedNight()`
  with their doc comments, and `export const endingSchema`, a
  `z.enum(['leave', 'stay', 'stranded'])` Task 3 imports.

Decisions the spec leaves to the plan:

- **The schema** is `const savedNightSchema: z.ZodType<SavedNight> = z.object({…})`, under the
  spec's sentence that a field added to `Night` fails to compile until the schema handles it.
  Numbers are `z.number()`; `place` is `z.custom<PlaceId>((value) => typeof value === 'string')`
  under a comment that the content's ids are not the core's to list and the loader holds the place
  to the content; `drunkenness`, `roll` (nullable), `stories` and `quest` are objects of their
  fields; `events` is `z.array(z.string())`; `ending` is `endingSchema.nullable()`. The log is
  `z.array(z.union([choice, story, text]))`, each a `z.object` with `kind: z.literal(…)`; the text
  entry's `speaker` is `z.string().optional()` and the text object ends in
  `.transform(({speaker, ...entry}) => ({...entry, speaker}))`, under a comment that JSON drops an
  undefined speaker, zod 4 refuses the dropped key when the schema declares it required (a union
  with `z.undefined()` fails with "expected nonoptional"), and the transform gives the key back as
  `LogEntry` has it. A plain union, not a discriminated one: a transformed member is no object.
- **The store** is
  `new PersistedStore<SavedNight | null>({key: 'foam:night', schema: savedNightSchema.nullable().prefault(null)})`,
  under the spec's comment: null is "no night", anything unusable lands there too since a
  half-defaulted night would drop the player somewhere they never stood, and no version field since
  the schema is the version and a failing save costs one night.
- `loadSavedNight` loads, warns with the spec's line and gives null when `places` lacks the night's
  place (`Object.hasOwn`), with the `no-console` directive the jump-in uses. `saveNight` builds a
  `SavedNight` literal from the night's fields by name, so a field added to `Night` and to the
  schema fails here until it is picked too.

- [ ] **Step 1: Write the failing tests**

`tests/save.browser.test.ts`: `fixedPlaces` and `FIXED_BAR` from `./fixedWorld.js`, `createNight`
and `type SavedNight` at the top; `loadSavedNight`, `saveNight` and `clearSavedNight` imported in
`beforeAll` from `../source/game/core/save.js`; `const NIGHT_KEY = 'foam:night';`;
`localStorage.clear()` before and after each test; a module-level `const SAVED: SavedNight` as Task
1's with `place: FIXED_BAR` and a log of three entries: a text with the speaker `'The bar'`, a text
with `speaker: undefined`, and `{kind: 'choice', minutes: 1300, text: 'Order a beer'}`.
`describe('the saved night', …)`:

- `nothing stored gives null`: `loadSavedNight(fixedPlaces)` is null.
- `a night saved and loaded is the same data, a text without a speaker included`:
  `saveNight({...createNight({seed: 7, place: FIXED_BAR, minutes: 960, money: 0}), ...SAVED})`;
  `JSON.parse(localStorage.getItem(NIGHT_KEY) ?? '')` equals `SAVED`;
  `let loaded = loadSavedNight(fixedPlaces);` equals `SAVED`;
  `Object.hasOwn(loaded?.log[1] ?? {}, 'speaker')` is true.
- `an unknown key is stripped`: the store set to
  `{...SAVED, extra: 1, quest: {...SAVED.quest, hasCar: true}}` loads equal to `SAVED`.
- `text that is not JSON gives null`: `'{"seed": 7'`.
- `a payload missing a field, or a log entry of an unknown kind, gives null`: `{seed: 7}`, and
  `{...SAVED, log: [{kind: 'what', minutes: 1, text: 'x'}]}`.
- `a place not in the content gives null with a warning`: `vitest.spyOn(console, 'warn')`, the store
  set to `{...SAVED, place: 'nowhere'}`; null; the spy called with
  `'The saved night is in "nowhere", which is not a place.'`; restored in `finally`.
- `clearSavedNight removes the key`.

Run: `npx vitest run --project browser tests/save.browser.test.ts` Expected: FAIL (the functions do
not exist).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/save.ts tests/save.browser.test.ts
npx vitest run --project browser tests/save.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/save.ts tests/save.browser.test.ts
git commit -m "Keep the saved night in a store of its own"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 3: The record, the day's count and the date as words

**Files:**

- Create: `source/game/core/nights.ts`
- Modify: `source/game/core/todaySeed.ts`
- Test: `tests/nights.browser.test.ts` (new), `tests/todaySeed.test.ts`

**Interfaces:**

- Consumes: `Ending`, `Night` (Task 1), `endingSchema` (Task 2).
- Produces, in `core/nights.ts`: exactly the spec's `PastNight`, `nights`,
  `recordNight(night, date)`, `countStart(date)`, `getNextSeed(date)` and `forgetNights()` with
  their doc comments. In `core/todaySeed.ts`: `formatDate(date: number): string` with the doc
  `/** The date number as the Collection window writes it: 27 Oct 2026 for 20261027. */` over
  `const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];`.

Decisions the spec leaves to the plan:

- The schema is
  `z.object({past: z.array(pastNightSchema).default([]).catch([]), day: z.object({date: z.number(), started: z.number()}).default({date: 0, started: 0}).catch({date: 0, started: 0})})`,
  the store `nightsSchema.prefault({})`, under the settings' comment on why each field recovers
  alone; `pastNightSchema` holds `ending: endingSchema.nullable()`. No start is the day 0 with 0
  started.
- `countStart` writes `nights.day` in place: the same date adds one to `started`, another date sets
  `date` and `started` to 1. `forgetNights` empties `past` with `length = 0` and sets the day back
  to 0 and 0, then clears the store.

- [ ] **Step 1: Write the failing tests**

`tests/nights.browser.test.ts`, with the `?fresh=` import of `../source/game/core/nights.ts` as
`stories.browser.test.ts` has it, `createNight` and `findStory` at the top, `FIXED_BAR` from the
fixed world, `const NIGHTS_KEY = 'foam:nights';`, and `localStorage.clear()` before and after each
test. `describe('the record of nights', …)`:

- `nothing stored gives no nights and no start`: `nights` equals
  `{past: [], day: {date: 0, started: 0}}`.
- `a stored record loads`: the store set to
  `{past: [{seed: 7, date: 20261026, ending: 'stranded', stories: ['A']}], day: {date: 20261027, started: 2}}`
  loads equal.
- `a bad list loads empty and keeps the count`: `{past: 'x', day: {date: 20261027, started: 2}}`
  gives `past` `[]` and the day kept; `a bad count loads as no start and keeps the list`:
  `{past: [{seed: 7, date: 20261026, ending: null, stories: []}], day: 'x'}`.
- `recordNight appends the seed, the date, the ending and the titles, and saves`:
  `let night = createNight({seed: 7, place: FIXED_BAR, minutes: 1920, money: 50}); night.ending = 'stay'; findStory(night, 'A story'); recordNight(night, 20261027);`
  `nights.past` equals `[{seed: 7, date: 20261027, ending: 'stay', stories: ['A story']}]`; the
  store parsed equals `{past: [that], day: {date: 0, started: 0}}`.
- `countStart starts at 1 on a new date, adds one on the same, and saves in place`:
  `let {day} = nights; countStart(20261027);` `day` equals `{date: 20261027, started: 1}`; again, 2;
  `countStart(20261028)` gives `{date: 20261028, started: 1}`; `nights.day` is (`toBe`) `day`; the
  store's `day` equals it.
- `getNextSeed is the date with no start on it, and the date followed by the next number after`:
  `getNextSeed(20261027)` is 20261027; after `countStart(20261027)` it is 202610272; after another,
  202610273; `getNextSeed(20261028)` is 20261028.
- `forgetNights empties both in place and removes the key`: a loaded record,
  `let {past, day} = nights;` `forgetNights()`; `past` equals `[]`, `day` equals
  `{date: 0, started: 0}`, `nights.past` is `past`, `nights.day` is `day`, the key is null.

`tests/todaySeed.test.ts`, `describe(formatDate)`:
`writes the day, the month's short name and the year`: 20261027 → `'27 Oct 2026'`, 20270101 →
`'1 Jan 2027'`.

Run: `npx vitest run --project unit tests/todaySeed.test.ts` and
`npx vitest run --project browser tests/nights.browser.test.ts` Expected: FAIL (the functions do not
exist).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/nights.ts source/game/core/todaySeed.ts tests/nights.browser.test.ts tests/todaySeed.test.ts
npx vitest run --project unit tests/todaySeed.test.ts
npx vitest run --project browser tests/nights.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/nights.ts source/game/core/todaySeed.ts tests/nights.browser.test.ts tests/todaySeed.test.ts
git commit -m "Keep a record of the nights ended and count the nights started on a day"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 4: The texts read, keyed by path

**Files:**

- Create: `source/game/core/contentPath.ts`, `source/game/core/textsRead.ts`
- Modify: `source/game/core/checkContent.ts:37` (the separator),
  `source/game/screens/storyWindow.ts:46-59,141-186,505-516` (the options, the fields, the
  constructor, `#logPage`), `source/game/screens/nightScreen.ts` (`openStory` and its five callers),
  `source/routes/_index.tsx:14-34,68-73` (the imports, after `showScreen`)
- Test: `tests/textsRead.browser.test.ts` (new), `tests/continue.browser.test.ts` (new),
  `tests/nightScreen.browser.test.ts:144,1373,1442` (the three windows built by hand),
  `tests/mainMenu.browser.test.tsx` (the stores seeded at the boot, the console line),
  `tests/checkContent.test.ts` (run)

**Interfaces:**

- Consumes: `nights` (Task 3).
- Produces: in `core/contentPath.ts`, exactly the spec's `SEPARATOR` with its doc comment; in
  `core/textsRead.ts`, exactly the spec's `textsRead`, `markRead(where, nodeId)` and
  `forgetTextsRead()` with their doc comments, over the store `foam:textsRead` with the schema
  `z.object({paths: z.array(z.string()).default([]).catch([])})` prefaulted as the stories' is.
  `checkContent.ts` imports `SEPARATOR` in place of its own constant. `StoryWindowOptions` gains
  `where: string` with the doc
  `/** What opened the window, as the checker names it: the texts read are keyed under it. */`;
  `nightScreen.ts`'s `openStory(screen, script, where: string)` passes it. In `_index.tsx`, the
  dynamic imports gain `nights.js` and `textsRead.js`, and after `void importedGame.showScreen(…)`
  the spec's `console.info` line with the counts and `textsRead.paths` as the second argument, under
  a `no-console` directive saying the author reads what the game keeps from the console.

Decisions the spec leaves to the plan:

- `markRead` does its three things only for a new path: a path already in the set adds nothing,
  saves nothing and prints nothing.
- The story window keeps `#script` and `#where`, and `#logPage` calls a private `#markRead(node)`
  when the runner's `pageIndex` is 0: the id is the key of `#script.nodes` whose value is the node
  (identity; `defineScript` maps the table and the runner holds the mapped node); a node outside the
  table is `'start'` for the window's first node and `'next'` for every later one, tracked by a
  private boolean, so a one-node script's node and the node a function `start` built by hand are
  named as the checker names them.
- The night screen's paths, built with `SEPARATOR`: the place button and `showPlace` pass
  `${place.id} › description`, a spot button `${place.id} › ${spot.label}`, the travel window's
  `onClosed` `journeys › ${destination.way}`, `closeLocation` `${location.id} › closing`, and the
  end branch of `actOnNight` `'end'`.

- [ ] **Step 1: Write the failing tests**

`tests/textsRead.browser.test.ts`, with the `?fresh=` import of `../source/game/core/textsRead.ts`,
`const TEXTS_READ_KEY = 'foam:textsRead';`,
`const PATH = 'rotorBarRoom › The corner table › cards';` and the clears.
`describe('the texts read', …)`:

- `nothing stored gives an empty set`: `textsRead` equals `{paths: []}`.
- `a stored list loads`; `paths that are not a list load empty`.
- `markRead adds the path once, saves, and prints it the first time only`:
  `let info = vitest.spyOn(console, 'info');` in a `try`;
  `markRead('rotorBarRoom › The corner table', 'cards')`; `textsRead.paths` equals `[PATH]`; the
  store parsed equals `{paths: [PATH]}`; `info` called once, with `` `Read: ${PATH}` ``; `markRead`
  again; still `[PATH]` and one call; `mockRestore` in `finally`.
- `forgetTextsRead empties in place and removes the key`.

`tests/continue.browser.test.ts`, built as `storiesToast.browser.test.ts` is: the bar picture
mocked, `localStorage.clear()` and `useFixedWorld()` before one boot of 960 by 540, the long
timeout, `restore`, `unmount` and the clear in `afterAll`. At the top `FIXED_BAR`, `FIXED_PAVEMENT`,
`FIXED_SQUARE` and `FIXED_SQUARE_LOCATION` from the fixed world and the helpers it needs. Its first
test, `the texts read are keyed by path, and each is printed once`:

- `let info = vitest.spyOn(console, 'info');` in a `try` with `mockRestore` in `finally`;
  `let {textsRead} = await import('../source/game/core/textsRead.js');`
- `startNewGame(harness, 7)`; `closeStory`; `openSpot(harness, 'A patron')`, `press('Enter')`, focus
  `getWindowButton(storyWindow, 0)` (Talk to him), `press('Enter')`, `press('Enter')`, focus button
  1 (Let him be), `press('Enter')`, `waitForNoStoryWindow`; `openSpot(harness, 'The door')`,
  `press('Enter')`, focus button 0 (Go out), `press('Enter')`, `endStory`,
  `waitForPlace(harness, FIXED_PAVEMENT)`, `closeStory`; `openSpot(harness, 'The bar')`,
  `press('Enter')`, focus button 1 (Stay outside), `press('Enter')`, `waitForNoStoryWindow`;
  `chooseWayOut(harness, 'Walk')`,
  `pickDestination(harness, await waitForTravelWindow(harness), FIXED_SQUARE_LOCATION)`,
  `endStory(await waitForSpeaker(harness, 'On foot'))`, `waitForPlace(harness, FIXED_SQUARE)`,
  `closeStory`.
- `textsRead.paths` equals
  `['testBar › description › start', 'testBar › A patron › table', 'testBar › A patron › talk', 'testBar › The door › door', 'testBar › The door › outside', 'testPavement › description › start', 'testPavement › The bar › open', 'testPavement › The street › start', 'journeys › walk › start', 'testSquare › description › start']`
  and the store parsed equals `{paths: that}`.
- `startNewGame(harness, 7)` once more, `closeStory`: `textsRead.paths` is unchanged, and the calls
  of `info` whose first argument is `'Read: testBar › description › start'` number 1.

`tests/nightScreen.browser.test.ts`: the three `new harness.StoryWindow({…})` gain `where: 'test'`.

`tests/mainMenu.browser.test.tsx`: module-level
`const STORED_STORIES = {titles: ["The regulars' bottle", 'The timetable']};` and
`const STORED_NIGHTS = {past: [{seed: 3, date: 20261025, ending: null, stories: []}, {seed: 7, date: 20261026, ending: 'stranded', stories: []}, {seed: 202610272, date: 20261027, ending: 'stay', stories: ['The timetable']}], day: {date: 20200101, started: 5}};`,
written into `foam:stories` and `foam:nights` in `beforeAll` beside the settings, and
`info = vitest.spyOn(console, 'info')` installed beside the mixer spies and restored in `afterAll`.
A test `the console names what the game keeps at boot`: `info` called with
`'Foam keeps 3 nights and 0 texts read.'` and `[]`.

Run: `npx vitest run --project browser tests/textsRead.browser.test.ts` Expected: FAIL (the module
does not exist).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/contentPath.ts source/game/core/textsRead.ts source/game/core/checkContent.ts source/game/screens/storyWindow.ts source/game/screens/nightScreen.ts source/routes/_index.tsx tests/textsRead.browser.test.ts tests/continue.browser.test.ts tests/nightScreen.browser.test.ts tests/mainMenu.browser.test.tsx
npx vitest run --project unit tests/checkContent.test.ts
npx vitest run --project browser tests/textsRead.browser.test.ts tests/continue.browser.test.ts tests/mainMenu.browser.test.tsx
npm run typecheck
npx eslint source tests scripts
git add source/game/core/contentPath.ts source/game/core/textsRead.ts source/game/core/checkContent.ts source/game/screens/storyWindow.ts source/game/screens/nightScreen.ts source/routes/_index.tsx tests/textsRead.browser.test.ts tests/continue.browser.test.ts tests/nightScreen.browser.test.ts tests/mainMenu.browser.test.tsx
git commit -m "Keep the texts the player has read, by the path of each node"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 5: The list window

**Files:**

- Create: `source/game/screens/listWindow.ts`
- Modify: `source/game/screens/storiesWindow.ts` (a use of the list window),
  `tests/nightScreenHelpers.tsx:683-721` (`getStoriesParts`)
- Test: `tests/storiesToast.browser.test.ts`, `tests/logScreen.browser.test.ts` (both unchanged:
  they are the pin that the Stories window's behaviour does not change)

**Interfaces:**

- Consumes: `TextBlock`, `createWindowTitle`, `getPageBreaks`, `getArea`, `getTextWidth`.
- Produces: in `screens/listWindow.ts`, exactly the spec's `ListWindowOptions` and `ListWindow`
  (`readonly modal: Modal`, `resize(): void`, `refresh(): void`) with the spec's doc comments and
  the Stories window's class comment adapted. `StoriesWindow extends ListWindow`, keeping
  `StoriesWindowOptions`: its constructor calls `super` with
  `format: (textWidth) => formatStories(night, textWidth)`, `actions: []` and `placement: 'top'`;
  `formatStories(night: Night | null, textWidth: number): {title: string; text: string}` is the
  module's private function over today's title and list text.
  `getStoriesParts(window: {modal: Modal})` reads the new structure and returns
  `{actions: Button[]; back; close; italicLeaf: Text; next; panel; regularLeaf; title}`; a new
  `readLeaves(regularLeaf: Text, italicLeaf: Text): string` merges the two leaves character by
  character, the italic letter where the regular leaf has a space, so a test reads a text with
  italic headings as one string.

Decisions the spec leaves to the plan:

- The panel is `[titleBlock, textBlock, pagingRow?, bottomRow]`: the paging row of Back and Next as
  today, and the bottom row a `Container` of the actions and Close, `textWidth` wide with
  `gap: BUTTON_GAP` and the `marginTop` Close carries today; every button in it has `flexGrow: 1`
  and `flexBasis: 0`, so Close alone fills the row and Reset and Close share it. `#takeApart` takes
  the buttons out of both rows before destroying them, as it takes Back and Next out today.
- The modal's layout centres the panel; `'top'` adds `paddingTop: area.top` and sets it again on
  resize, `'centre'` adds nothing. The room for the lines is today's formula on both placements.
- `resize()` and `refresh()` share a private `#rebuild()`: the offset of the shown page's start,
  take apart, lay out, the page by `findLastIndex`, show. `resize()` keeps its early return on the
  same size; `refresh()` never returns early.

- [ ] **Step 1: Implement**

A refactor under existing tests: write `ListWindow`, make `StoriesWindow` its use, and teach
`getStoriesParts` the bottom row.

- [ ] **Step 2: Check and commit**

```bash
npx prettier --write source/game/screens/listWindow.ts source/game/screens/storiesWindow.ts tests/nightScreenHelpers.tsx
npx vitest run --project browser tests/storiesToast.browser.test.ts tests/logScreen.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/listWindow.ts source/game/screens/storiesWindow.ts tests/nightScreenHelpers.tsx
git commit -m "Share the Stories window's paging as a list window"
```

Expected: PASS, with no test changed; typecheck 0; eslint 0 errors.

### Task 6: The night saved, recorded and cleared, and the collection read back

**Files:**

- Modify: `source/game/screens/nightScreen.ts:123-130,156-173,296-324,462-495,572-592,724-744`
  (`storiesHandled`'s doc, `handleStories`, `openStory`, the travel window's `onClosed`, the log
  branch of `actOnNight`, `onHide`), `source/game/core/stories.ts`, `tests/nightScreenHelpers.tsx`
  (`quitToMenu`)
- Test: `tests/stories.browser.test.ts`, `tests/storiesToast.browser.test.ts:121-186`,
  `tests/continue.browser.test.ts`, `tests/nightScreenEnd.browser.test.ts` (run)

**Interfaces:**

- Consumes: `saveNight`, `clearSavedNight` (Task 2), `recordNight` (Task 3), `todaySeed`.
- Produces: in `core/stories.ts`, `reloadCollection(): void` with the doc
  `/** Reads the store back into the shared object in place: a find in an abandoned window is undone. */`,
  the spec's `splice`. In `nightScreen.ts`: the story window's `onClosing` calls `saveNight(night)`
  and `saveCollection()` after `fadeBackdrop`; the travel window's `onClosed` calls
  `saveNight(night)` after `takeJourney` and before `leavePlace`; the branch of `actOnNight` that
  shows the log calls `recordNight(night, todaySeed())` and `clearSavedNight()` before `showLog`;
  `onHide` calls `reloadCollection()` in place of `saveCollection()`; `handleStories` loses its
  `saveCollection()`. The comments of the spec's four moments go on these lines, and the comments of
  `storiesHandled`, `handleStories` and the `onHide` line change to what is now true. In the
  helpers,
  `quitToMenu(harness: Harness, screen: {ui: UiRoot; contents: {menuModal: Modal | null}} = harness.nightScreen): Promise<void>`:
  Escape, the menu's Quit to menu focused and Enter, and a wait for the main menu shown.

- [ ] **Step 1: Write the failing tests**

`tests/stories.browser.test.ts`, `reloadCollection replaces the titles in place from the store`: the
store set to `{titles: ['A', 'B']}`, a fresh import, `let {titles} = collection; titles.push('C');`
the store set to `{titles: ['A']}`; `reloadCollection()`; `collection.titles` equals `['A']` and is
(`toBe`) `titles`.

`tests/storiesToast.browser.test.ts`:
`the toast shows the title above the window, and the find is saved` becomes
`…, and the find waits for the window's end to reach the store`: its store assertion reads
`{titles: []}`; `the toast goes after its time, and the second find follows it` asserts after
`waitForNoStoryWindow` that the store parsed equals `{titles: ['The shrug', 'The glass']}`. The
spec's other line for this file, a quit with a window open leaving the store at the last save, is
pinned below in `continue.browser.test.ts`, whose world has an unfound story to abandon.

`tests/continue.browser.test.ts`, after Task 4's test, in this order:

- `the night is saved with the collection when a window's text ends, and not before`:
  `startNewGame(harness, 7)`; `localStorage.getItem('foam:night')` is null; `closeStory`; the store
  parsed equals
  `{seed: 7, rolls: 0, minutes: 1180, money: 350, place: FIXED_BAR, drunkenness: {level: 0, at: 1180}, roll: null, log: [{kind: 'text', minutes: 1180, speaker: 'The bar', text: expect.any(String) as unknown}], stories: [], quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false}, events: [], ending: null}`;
  `foam:stories` parsed equals `{titles: []}`.
- `a journey's pick is saved with the destination before the journey's window ends`: the door's Go
  out as Task 4's test takes it, `endStory`, `waitForPlace(harness, FIXED_PAVEMENT)`: the store's
  `place` is `FIXED_PAVEMENT`; `closeStory`; `chooseWayOut(harness, 'Walk')`, `pickDestination` to
  `FIXED_SQUARE_LOCATION`, `waitForSpeaker(harness, 'On foot')`: the store's `place` is
  `FIXED_SQUARE`, `minutes` 1192, and its `log` ends with
  `{kind: 'choice', minutes: 1180, text: expect.any(String) as unknown}`; `endStory`,
  `waitForPlace(harness, FIXED_SQUARE)`, `closeStory`.
- `the record is written and the save cleared when the log screen opens`:
  `let {logScreen} = await import(…)`;
  ``startFrom(harness, `?place=${FIXED_BAR}&time=07:55&seed=7`)``; `closeStory`; the bartender's
  beer (Enter, ArrowDown, Enter, `endStory`, as `nightScreenEnd.browser.test.ts` drinks it);
  `waitForSpeaker(harness, 'Morning')`: the store's `minutes` is 1925 and `ending` null; `endStory`;
  wait for `logScreen.state` `'shown'`; `foam:night` is null; `foam:nights` parsed `.past` equals
  `[{seed: 7, date: todaySeed(), ending: 'stranded', stories: []}]`; `textsRead.paths` (imported as
  Task 4's test imports it) contains `'end › stranded'`; `quitToMenu(harness, logScreen)`.
- `a find in an abandoned window is undone in the collection and the store on Quit to menu`:
  `let {collection} = await import(…)`; `startNewGame(harness, 7)`; `closeStory`;
  `openSpot(harness, 'A patron')`, Enter, button 1 (Ignore him), Enter; `waitForToast`;
  `collection.titles` equals `['The shrug', 'The glass']`; the stories store parsed equals
  `{titles: []}`; `let {titles} = collection; quitToMenu(harness);` `collection.titles` equals `[]`
  and is `titles`; the store parsed equals `{titles: []}`; the night store's `stories` equals `[]`.

Run: `npx vitest run --project browser tests/stories.browser.test.ts tests/continue.browser.test.ts`
Expected: FAIL (`reloadCollection` does not exist; the night store is null).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/nightScreen.ts source/game/core/stories.ts tests/nightScreenHelpers.tsx tests/stories.browser.test.ts tests/storiesToast.browser.test.ts tests/continue.browser.test.ts
npx vitest run --project browser tests/stories.browser.test.ts tests/storiesToast.browser.test.ts tests/continue.browser.test.ts tests/nightScreenEnd.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/nightScreen.ts source/game/core/stories.ts tests/nightScreenHelpers.tsx tests/stories.browser.test.ts tests/storiesToast.browser.test.ts tests/continue.browser.test.ts
git commit -m "Save the night when a window's text ends and when a journey is picked, and record it at the end"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 7: Continue

**Files:**

- Modify: `source/game/screens/nightScreen.ts:58-133,659-712,713-741` (`resuming` in the contents,
  `onAttach`, `onShow`), `source/game/screens/mainMenuScreen.ts` (the contents, `continueButton`,
  `slotContinue`, `onShow`, the windows' `onClosed`), `tests/nightScreenHelpers.tsx`
  (`continueNight`)
- Test: `tests/continue.browser.test.ts`, `tests/mainMenu.browser.test.tsx`

**Interfaces:**

- Consumes: `restoreNight`, `SavedNight` (Tasks 1, 2), `loadSavedNight` (Task 2), `quitToMenu` (Task
  6), `findStory`.
- Produces: in `nightScreen.ts`, `resuming: SavedNight | null` in the contents with the doc
  `/** The saved night Continue hands over for the next show, which reads and empties it; null for a fresh night. */`,
  null from `onAttach`; `onShow` reads and empties it, builds the night with `createNight` as today
  or with `restoreNight(saved, collection)`, starts `storiesHandled` at `night.stories.length` under
  a comment that a resumed night queues no toast for its finds, and after the backdrop is set calls
  `actOnNight(screen)` for a resumed night in place of the place lookup and `showPlace`, under the
  spec's comment on why the call is direct and what the function does for every state a save can
  hold. In `mainMenuScreen.ts`: `continueButton: Button` in the contents, 96 wide with
  `marginTop: 16`, labelled `Continue`, built in `onAttach` and not added; its click sets
  `nightScreen.contents.resuming = loadSavedNight(nightStart.places)` and shows the night screen; a
  module function `slotContinue(screen)` run by `onShow` before the music and by every window's
  `onClosed` (the Options and New night windows' `onClosed` today, the Collection window's in Task
  9). In the helpers, `continueNight(harness: Harness): Promise<void>`: Continue focused and Enter,
  a wait for the night screen shown, and a frame.

Decisions the spec leaves to the plan:

- `slotContinue` decides by `loadSavedNight(nightStart.places) !== null` and by whether
  `screen.ui.children` holds the button: in with a save and not shown, New Game and Options (and
  Collection from Task 9) go out and back in after Continue, and New Game's `marginTop` becomes 6;
  out without a save and shown, Continue goes out and New Game's `marginTop` is 16 again. Under
  Somewhere's comment that the root only appends. On show nothing is focused, and on a window's
  close only a removal can happen, with the focus back on the button that opened the window, so no
  focused button is ever taken out.

- [ ] **Step 1: Write the failing tests**

`tests/continue.browser.test.ts`, after Task 6's tests, with `findStory` imported at the top:

- `Continue with no window open resumes the place under its description at the same minute, and the undone find's choice is offered again`:
  `continueNight(harness)`; `contents.place?.id` is `FIXED_BAR`; the status reads
  `'19:40   350 Kč   0.0'`; `night.seed` is 7; `getStoryWindow(harness).dialogue.node?.speaker` is
  `'The bar'`; `night.log.map(describeEntry)` equals
  `[['text', 1180, 'The bar'], ['text', 1180, 'The bar']]`; `night.stories` equals `[]`;
  `closeStory`; `openSpot(harness, 'A patron')`, Enter: the labels are
  `['Talk to him', 'Ignore him']`; button 1, Enter, `endStory`, `waitForNoStoryWindow`: the stories
  store parsed equals `{titles: ['The shrug', 'The glass']}`.
- `a quit mid-window puts the money and the minutes back, and the finds of a resumed night get no toast`:
  the bartender's beer taken (Enter, ArrowDown, Enter) without ending it: the status reads
  `'19:50   305 Kč   1.0'`; `quitToMenu(harness)`; `continueNight(harness)`; the status reads
  `'19:40   350 Kč   0.0'`; `night.rolls` is 0; `night.drunkenness` equals `{level: 0, at: 1180}`;
  no entry of `night.log` has `kind` `'choice'`; three `nextFrame`s; `contents.toast` is null and
  `contents.toastQueue` equals `[]` while `night.stories` has length 2;
  `findStory(night, 'The lamp')`; `readText(getToastParts(await waitForToast(harness)).text)` is
  `'The lamp'`; `closeStory`.
- `the same roll comes up on the same choice after a quit`: `openSpot(harness, 'The door')`, Enter,
  button 1 (Knock on the glass), Enter; `let first = night.roll?.value;` is a number; `quitToMenu`;
  `continueNight`; `night.rolls` is 0 and `night.roll` null; `closeStory`; the door and the knock
  again; `night.roll?.value` is `first`; `endStory`, `waitForNoStoryWindow`.
- `a quit during a journey's window resumes at the destination, with the pick paid and logged once`:
  Go out, `endStory`, `waitForPlace(harness, FIXED_PAVEMENT)`, `closeStory`,
  `chooseWayOut(harness, 'Walk')`, `pickDestination` to `FIXED_SQUARE_LOCATION`,
  `waitForSpeaker(harness, 'On foot')`; `quitToMenu`; `continueNight`;
  `waitForPlace(harness, FIXED_SQUARE)`; the status reads `'19:57   350 Kč   0.0'`;
  `night.log.map(describeEntry).slice(-2)` equals
  `[['choice', 1185, expect.any(String) as unknown], ['text', 1197, 'The square']]`; `closeStory`.
- `a quit during the closing resumes in the room, and the closing runs again`:
  ``startFrom(harness, `?place=${FIXED_BAR}&time=22:55&seed=7`)``; `closeStory`; the beer to its
  end; `waitForSpeaker(harness, 'Closing time')`; `quitToMenu`; `continueNight`;
  `waitForSpeaker(harness, 'The bar')`; the status reads `'23:05   305 Kč   1.0'`; `closeStory`;
  `endStory(await waitForSpeaker(harness, 'Closing time'))`;
  `waitForPlace(harness, FIXED_PAVEMENT)`.
- `Continue into the Morning text, and Quit to menu from the log leaves no Continue`:
  ``startFrom(harness, `?place=${FIXED_BAR}&time=07:55&seed=7`)``; `closeStory`; the beer to its
  end; `waitForSpeaker(harness, 'Morning')`; `quitToMenu`; `continueNight`;
  `waitForSpeaker(harness, 'Morning')`; `contents.place` and `contents.picture` are null; the status
  reads `'08:05   305 Kč   1.0'`; `endStory`; wait for the log screen shown;
  `logScreen.contents.night?.ending` is `'stranded'`; the entries of its log with the speaker
  `'Morning'` number 1; `quitToMenu(harness, logScreen)`; `mainMenuScreen.ui.children` does not
  contain `mainMenuScreen.contents.continueButton`.

`tests/mainMenu.browser.test.tsx`: `MainMenuScreen`'s contents gain `continueButton: Button`; a
module-level
`const STORED_NIGHT = {seed: 7, rolls: 0, minutes: 1000, money: 420, place: 'train', drunkenness: {level: 0, at: 1000}, roll: null, log: [], stories: [], quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false}, events: [], ending: null};`.
After `Enter in the field starts the night too`:

- `Continue is not on the menu without a stored night`: `await game.showScreen(mainMenuScreen)`;
  `ui.children` does not contain `continueButton`.
- `Continue comes in above New Game when a window over the menu closes on a stored night`:
  `localStorage.setItem('foam:night', JSON.stringify(STORED_NIGHT))`; `openOptions`,
  `closeWithEscape`, `nextFrame`; `ui.children.indexOf(continueButton)` is
  `ui.children.indexOf(newGameButton) - 1` and above 0; its layout width is 96;
  `continueBounds.y / scale - titleBounds.maxY / scale` is close to 24 and
  `newGameBounds.y / scale - continueBounds.maxY / scale` close to 6.
- `Continue opens the saved place with its status line, and stands until the night is saved again`:
  `ui.focus(continueButton)`, `press('Enter')`, wait for the night screen shown;
  `contents.place?.id` is `'train'`; the status reads `'16:40   420 Kč   0.0'`; `night.seed` is 7;
  `await game.showScreen(mainMenuScreen)`; `ui.children.filter((child) => child === continueButton)`
  has length 1.

Run: `npx vitest run --project browser tests/mainMenu.browser.test.tsx` Expected: FAIL
(`continueButton` is undefined).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/nightScreen.ts source/game/screens/mainMenuScreen.ts tests/nightScreenHelpers.tsx tests/continue.browser.test.ts tests/mainMenu.browser.test.tsx
npx vitest run --project browser tests/continue.browser.test.ts tests/mainMenu.browser.test.tsx
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/nightScreen.ts source/game/screens/mainMenuScreen.ts tests/nightScreenHelpers.tsx tests/continue.browser.test.ts tests/mainMenu.browser.test.tsx
git commit -m "Resume the saved night from the main menu's Continue"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 8: New Game on a saved night, and the day's next seed

**Files:**

- Create: `source/game/screens/confirmModal.ts`, `tests/confirmParts.ts`
- Modify: `source/game/screens/mainMenuScreen.ts` (the contents, New Game's `onStart`, `onHide`),
  `source/game/screens/newNightModal.ts:38-53` (the comment and the field's value),
  `tests/nightScreenHelpers.tsx:151-175` (`startNewGame`)
- Test: `tests/mainMenu.browser.test.tsx`, `tests/jumpIn.browser.test.ts` and
  `tests/continue.browser.test.ts` (run)

**Interfaces:**

- Consumes: `loadSavedNight`, `clearSavedNight` (Task 2), `countStart`, `getNextSeed` (Task 3),
  `resuming` (Task 7), `createLabel`, `createWindowTitle`, `WINDOW_PADDING`, `wrapText`,
  `measureText`.
- Produces: in `screens/confirmModal.ts`,
  `export type ConfirmModalOptions = {ui: UiRoot; scheduler: Scheduler; title: string; text: string; action: string; onAction: () => void; onClosed: () => void}`
  and exactly the spec's `openConfirmModal(options): Modal`, with the New night window's
  `ROW_WIDTH`, `ROW_GAP` and `BUTTON_WIDTH` declared again as that window and Options declare
  theirs. In `mainMenuScreen.ts`: `confirmModal: Modal | null` in the contents; a module function
  `startNight(screen, seed: number)` that does the spec's start in its order
  (`countStart(todaySeed())`, `clearSavedNight()`, `nightScreen.contents.resuming = null`,
  `nightStart.seed = seed`, `showScreen`) under the spec's two comments; New Game's `onStart` calls
  it when `loadSavedNight(nightStart.places)` is null and otherwise opens the `Night in progress`
  confirmation into `confirmModal`, whose `onAction` calls it and whose `onClosed` clears the field;
  `onHide` destroys the confirmation before the open window. In `newNightModal.ts`: the field's
  value is `String(getNextSeed(todaySeed()))`, the comment above extended by one sentence: the day's
  count makes the second night of the day the date followed by 2. In `tests/confirmParts.ts`,
  `getConfirmParts(modal: Modal): {action: Button; close: Button; line: Text; title: Text}` under
  the structure comment `newNightParts.ts` has: the panel's children are the title block, the line's
  `Text` and a row, a `Container` of the action and Close. `startNewGame` activates the
  confirmation's action when `mainMenuScreen.contents.confirmModal` is not null after Start, under a
  comment that a saved night asks first and the test ends it as the player would.

Decisions the spec leaves to the plan:

- The confirmation's line is
  `new Text({text: wrapText(text, ROW_WIDTH, measureText), …, layout: {width: ROW_WIDTH, height: lines * LINE_HEIGHT}})`.
  Close is built before the modal and named its `initialFocus`, as the menu builds Resume; the
  action's button is added after the modal exists and its click calls `onAction` unless the modal is
  closing or closed, with the menu's `isClosing` guard. Both buttons are `BUTTON_WIDTH`.

- [ ] **Step 1: Write the failing tests**

`tests/mainMenu.browser.test.tsx`: `getConfirmParts` imported at the top; `MainMenuScreen`'s
contents gain `confirmModal: Modal | null`; `afterEach` destroys `confirmModal` before `openModal`
and clears both. After Task 7's tests:

- `the field reads the day's next seed after a start`: `openNewNight`; `input.value` is
  `` `${todaySeed()}3` `` (two starts so far in this file, Continue counting none);
  `closeWithEscape`.
- `Start with a stored night opens the confirmation with Close focused, and Enter again closes it`:
  `let modal = await openNewNight();` `ui.focus(getNewNightParts(modal).start)`, `press('Enter')`;
  `let confirm = mainMenuScreen.contents.confirmModal;` is not null; `readText(title)` is
  `'Night in progress'` and `readText(line)` `'Start ends the saved night.'`;
  `describeFocus(ui.focused)` is `'Close'`; `ui.topOverlay` is `confirm`; `press('Enter')`; wait for
  `confirmModal` null; `mainMenuScreen.state` is `'shown'`, `contents.openModal` is `modal`,
  `ui.topOverlay` is `modal`, `localStorage.getItem('foam:night')` is not null,
  `describeFocus(ui.focused)` is `'Start'`; `press('Enter')` opens it again and `press('Escape')`
  closes it; `closeWithEscape`.
- `the confirmation's Start plays the new night and clears the save`: `openNewNight`,
  `typeSeed(input, '7')`, `ui.focus(start)`, `press('Enter')`;
  `ui.focus(getConfirmParts(confirm).action)`, `press('Enter')`; wait for the night screen shown;
  `night.seed` is 7; `foam:night` is null; `foam:nights` parsed `.day` equals
  `{date: todaySeed(), started: 3}`; `await game.showScreen(mainMenuScreen)`; `ui.children` does not
  contain `continueButton`.

Run: `npx vitest run --project browser tests/mainMenu.browser.test.tsx` Expected: FAIL (the field
reads the date; no confirmation opens).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/confirmModal.ts source/game/screens/mainMenuScreen.ts source/game/screens/newNightModal.ts tests/confirmParts.ts tests/nightScreenHelpers.tsx tests/mainMenu.browser.test.tsx
npx vitest run --project browser tests/mainMenu.browser.test.tsx tests/jumpIn.browser.test.ts tests/continue.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/confirmModal.ts source/game/screens/mainMenuScreen.ts source/game/screens/newNightModal.ts tests/confirmParts.ts tests/nightScreenHelpers.tsx tests/mainMenu.browser.test.tsx
git commit -m "Ask before a new night ends the saved one, and count the nights of the day"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 9: The Collection window and Reset

**Files:**

- Create: `source/game/screens/collectionWindow.ts`, `tests/collectionWindow.browser.test.ts`
- Modify: `source/game/screens/mainMenuScreen.ts` (the contents, `collectionButton`, the window,
  Reset's confirmation, `slotContinue`, `onHide`, `onResize`)
- Test: `tests/mainMenu.browser.test.tsx:260-285,541-575` (the focus order and the widths, and after
  Task 8's tests), `tests/collectionWindow.browser.test.ts`

**Interfaces:**

- Consumes: `ListWindow` (Task 5), `openConfirmModal` (Task 8), `collection`, `forgetStories`,
  `nights`, `forgetNights`, `formatDate` (Task 3), `textsRead`, `forgetTextsRead` (Task 4),
  `clearSavedNight` (Task 2), `MARK`, `stripMarks`, `getStoriesParts`, `readLeaves` (Task 5),
  `getConfirmParts` (Task 8).
- Produces: in `screens/collectionWindow.ts`,
  `export type CollectionWindowOptions = {ui: UiRoot; scheduler: Scheduler; onReset: () => void; onClosed: () => void}`
  and `openCollectionWindow(options): ListWindow`, which builds the Reset button
  (`createLabel('Reset')`, `layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'}`, its
  click calling `onReset` unless the window's modal is closing or closed) and the window with it as
  the one action and the `'centre'` placement; the module's private
  `formatCollection(textWidth: number): {title: string; text: string}` and
  `const ENDING_WORDS: Readonly<Record<Ending, string>> = {leave: 'Left', stay: 'Stayed', stranded: 'Stranded'};`.
  In `mainMenuScreen.ts`: `collectionButton: Button` labelled `Collection`, 96 wide with
  `marginTop: 6`, added between New Game and Options and slotted with them;
  `collectionWindow: ListWindow | null` in the contents; the button's click opens the window, whose
  `onReset` opens the `Reset` confirmation into `confirmModal`, its `onAction` calling
  `forgetStories()`, `forgetNights()`, `forgetTextsRead()` and `clearSavedNight()` in that order,
  then `collectionWindow?.refresh()` and `confirmModal?.close()`; the window's `onClosed` clears the
  field and runs `slotContinue`; `onHide` destroys the confirmation, then the Collection window's
  modal, then the open window; `onResize` calls `collectionWindow?.resize()`.

Decisions the spec leaves to the plan:

- `formatCollection` builds the lines, `` `${MARK}Stories  ${n} found${MARK}` ``, the titles in the
  order found or `None yet`, an empty line, `` `${MARK}Nights  ${n}${MARK}` ``, then
  `[...nights.past].reverse()` each as its line and `` `  ${title}` `` per title, or `None yet`;
  each line goes through `wrapText(line, textWidth, (text) => measureText(stripMarks(text)))` and
  the lines join with `'\n'`.

- [ ] **Step 1: Write the failing tests**

`tests/mainMenu.browser.test.tsx`: `MainMenuScreen`'s contents gain `collectionButton: Button` and
`collectionWindow: {modal: Modal; refresh: () => void} | null`; `afterEach` destroys
`collectionWindow?.modal` between the confirmation and the open window; a
`getLabel(button: Button): string` beside `describeFocus`, reading the button's label as it does.
Then:

- `the first focus command lands on New Game, and the next on Options` becomes
  `…, the next on Collection and the third on Options`: a third Tab, `describeFocus` `'Collection'`
  after the second with `clicks()` 2, `'Options'` after the third with 3.
- `the title is 96 × 48 and both buttons are 96 wide` becomes `… and the three buttons are 96 wide`:
  Collection's width 96, `collectionBounds.y - newGameBounds.maxY` close to 6 and
  `optionsBounds.y - collectionBounds.maxY` close to 6 (both over `scale`).
- After Task 8's tests, `Collection opens the window with the stories and the nights, newest first`:
  `ui.focus(collectionButton)`, `press('Enter')`; `let window = contents.collectionWindow;` not
  null; `ui.topOverlay` is `window.modal`; `let parts = getStoriesParts(window);`
  `readText(parts.title)` is `'Collection'`; `parts.actions.map(getLabel)` equals `['Reset']`;
  `readLeaves(parts.regularLeaf, parts.italicLeaf)` equals
  `"Stories  2 found\nThe regulars' bottle\nThe timetable\n\nNights  3\n27 Oct 2026  Seed 202610272  Stayed\n  The timetable\n26 Oct 2026  Seed 7  Stranded\n25 Oct 2026  Seed 3"`;
  `parts.back` and `parts.next` are null; `ui.focused` is null; `press('Escape')`; wait for
  `collectionWindow` null.
- `the picture runs at half speed under the Collection window`: as the Options test, with the
  Collection window.
- `Reset asks, then empties the window to None yet twice and takes Continue off the menu`:
  `localStorage.setItem('foam:night', JSON.stringify(STORED_NIGHT))`; `openOptions`,
  `closeWithEscape`; `ui.children` contains `continueButton`; Collection opened;
  `ui.focus(getStoriesParts(window).actions[0]!)`, `press('Enter')`;
  `let confirm = contents.confirmModal;` not null, its title `'Reset'`, its line
  `'Everything the game kept goes: the stories, the nights, the texts read and the saved night.'`,
  `describeFocus(ui.focused)` `'Close'`; `ui.focus(getConfirmParts(confirm).action)`,
  `press('Enter')`; wait for `confirmModal` null; `readLeaves(…)` of `getStoriesParts(window)`
  equals `'Stories  0 found\nNone yet\n\nNights  0\nNone yet'`; the four keys `foam:stories`,
  `foam:nights`, `foam:textsRead` and `foam:night` are null; `collection.titles` equals `[]` and
  `nights.past` `[]` (both imported in the test as `settings` is imported in `beforeAll`);
  `ui.topOverlay` is `window.modal`; `press('Escape')`; wait for `collectionWindow` null;
  `ui.children` does not contain `continueButton`; `describeFocus(ui.focused)` is `'Collection'`;
  `newGameBounds.y / scale - titleBounds.maxY / scale` close to 24.

`tests/collectionWindow.browser.test.ts`, built as `storiesToast.browser.test.ts` is but through
`bootGame(292, 524)` (the narrowest screen, 146 by 262 art pixels, no fixed world), the bar picture
mocked, and before the boot `foam:stories` set to twelve titles `Story 1` to `Story 12` and
`foam:nights` to
`{past: [{seed: 3, date: 20261025, ending: null, stories: []}, {seed: 7, date: 20261026, ending: 'stranded', stories: ['Story 1']}, {seed: 202610272, date: 20261027, ending: 'stay', stories: ['Story 2', 'Story 3']}], day: {date: 0, started: 0}}`.
`describe('the Collection window', …)`:

- `the lists come in pages, Next reads them through, and the focus moves to Back at the end`:
  Collection opened (the button focused, Enter); `let parts = getStoriesParts(window);` `back` and
  `next` not null, `back.isDisabled` true, `next.isDisabled` false, `ui.focused` null;
  `let pages = [readLeaves(parts.regularLeaf, parts.italicLeaf)];` `ui.focus(parts.next)`; while
  `!parts.next.isDisabled` and under 10 turns: `press('Enter')`, push the read text; `pages.length`
  is above 1; `describeFocus(ui.focused)` is `'Back'`; `let text = pages.join('');` starts with
  `'Stories  12 found\nStory 1\n'`; its indexes of `'27 Oct 2026'`, `'26 Oct 2026'` and
  `'25 Oct 2026'` rise in that order; it contains `'\n  Story 2\n  Story 3\n'` and
  `'\n  Story 1\n'`; it ends with `'25 Oct 2026  Seed 3'`; the count of `'\n'` in `text` is 22, so
  no line is lost between pages (one heading, twelve titles, one blank, one heading and the eight
  lines the nights wrap to at 19 characters a line: `27 Oct 2026  Seed` / `202610272  Stayed` / two
  titles / `26 Oct 2026  Seed 7` / ` Stranded` / one title / `25 Oct 2026  Seed 3`).
- `Back reads the pages back, and the window closes on Escape`: Enter on Back until
  `back.isDisabled`; `describeFocus(ui.focused)` is `'Next'`; `press('Escape')`; wait for
  `collectionWindow` null; `describeFocus(ui.focused)` is `'Collection'`.

Run: `npx vitest run --project browser tests/mainMenu.browser.test.tsx` Expected: FAIL
(`collectionButton` is undefined).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/collectionWindow.ts source/game/screens/mainMenuScreen.ts tests/mainMenu.browser.test.tsx tests/collectionWindow.browser.test.ts
npx vitest run --project browser tests/mainMenu.browser.test.tsx tests/collectionWindow.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/collectionWindow.ts source/game/screens/mainMenuScreen.ts tests/mainMenu.browser.test.tsx tests/collectionWindow.browser.test.ts
git commit -m "List the stories and the nights in a Collection window with a Reset"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 10: Whole check and hand-over

**Files:** `docs/direction.md`, `docs/superpowers/specs/2026-10-27-saving-and-continue-design.md`.

- [ ] **Step 1: Run everything once**

From the repository root: `npx turbo run typecheck lint test --filter=foam --concurrency=1`
Expected: every task succeeds (this is the one full run; CI repeats it). The content test's duration
is near the figure the versions plan noted: this spec adds three entry effects and no table. Then
`git diff --stat a998098e -- apps/somewhere packages/tellurion` prints nothing.

- [ ] **Step 2: State that the spec is built**

- `docs/direction.md`: the status line says phases 1 to 6 are built and reviewed, and phase 7 is
  built and waits for its review; in the phase 7 list, item 3 ends "It is built:" with links to the
  spec and to this plan in place of "It is designed: [spec]".
- The spec's status: "implemented by
  [2026-10-27-saving-and-continue.md](../plans/2026-10-27-saving-and-continue.md)".

```bash
git add docs/direction.md docs/superpowers/specs/2026-10-27-saving-and-continue-design.md
git commit -m "State that saving and Continue are built"
```

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build: every step of the spec's "What the player sees" in a wide window and in one narrower
than 240 art pixels; a reload mid-window and a closed tab, then Continue;
`?place=rotorBarRoom&time=23:00&seed=7` with a night saved before it, whose first save replaces the
old one without the window; two nights started on one day, the second's field reading the date
followed by 2; the console at boot and the `Read:` lines; and the Collection window's pages on a
phone held upright.
