# The Quest's Threads (Foam Phase 6, Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The night has a quest with three threads: a friend in Rotor's back room twice by the hour
who hands over the keys on a won search, with a failed search costing an hour and hints by the hour
from three people; a bottle bought at The Whisky Shop and handed over at a birthday at Rotor's long
table; and a ticket machine in the main station's hall. The night remembers the threads in four
booleans, the checker runs on every one of their sixteen states, and a jump-in can start with any of
them.

**Architecture:** `night.quest` holds the four flags, written in effects and read by function
`start`s and `next`s, as the content already reads the hour and the roll. `content/quest.ts` holds
the author's numbers (the friend's spans, the party's span, the prices, the hour a failed search
costs) and the two titles, and `isFriendIn`. The threads are scripts in the places that exist, built
with the choice fields and the helpers of phases 5 and 6; the game's code changes only to carry the
flags (the night, the checker's third axis, the jump-in).

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tellurion
(`Dialogue`), Vitest 4 (`unit` in Node, `browser` in Playwright's Chromium), Node 24 scripts,
Prettier 3, Turborepo.

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-19-quest-threads-design.md`

Runs after the plan `apps/foam/docs/superpowers/plans/2026-10-21-stories.md`, which is built:
`findStory(night, title)` and `hasStory(night, title)` take a `standIn` title, `createNight` takes a
collection as its second argument, the checker runs every effect on a fresh night of each check
night and runs twice, on an empty and on a full collection, the night screen shows a toast per find,
and `tests/nightScreenHelpers.tsx` has `waitForToast` and `getToastParts`.

## Global Constraints

- Only files under `apps/foam/` change. Nothing under `apps/somewhere/` or `packages/tellurion/`. No
  dependency changes: never run an install, never touch a lockfile.
- Work on the current branch, `somewhere-update`. Commit at the end of each task with `git add` of
  the task's own paths; a message is one short imperative sentence, with no prefix and no trailer
  lines. Never use `git stash`. Commands run from `apps/foam` unless a step says otherwise.
- **Tests.** A task runs only the tests it touches: the unit project, or the browser files named in
  the task, plus `npm run typecheck` and `npx eslint source tests scripts`. The whole suite (about
  nine minutes) is CI's, after the last task. Lint expectation: 0 errors; the known warnings of
  earlier phases may print.
- Code style: `let` for locals, `const` only at module level; relative imports end in `.js`;
  comments say why and stay within 100 columns; never remove a comment. Keys of a screen's contents
  type are sorted alphabetically. Prettier formats (printWidth 100, no bracket spacing, single
  quotes) and lint fails on a difference: run `npx prettier --write` on the task's files before
  lint.
- `exactOptionalPropertyTypes` is on: never set an optional field to `undefined`; build an object
  with a field only when it has a value.
- Tests: the `vitest` object, not `vi`; every `vitest.fn` takes a type parameter; a blank line
  separates a group of `expect` lines from other statements; `describe(fn, …)` when named after a
  function; no `expect` inside `beforeAll` or `beforeEach`; game modules are imported after
  `bootGame`, never at the top of a browser test (types only at the top; `nightStart`, `getJumpIn`
  and the content modules import no game module and may be imported at the top); every browser test
  file that boots the game mocks `content/pictures/barPicture.js` with `PROOF_PICTURE`; a browser
  file boots the game once and clears `localStorage` before its boot and in `afterAll`; a test that
  writes into `nightStart` puts it back in `afterAll`, including `delete nightStart.quest` and
  `delete nightStart.drunkenness`.
- `core/night.ts`, `core/checkContent.ts`, `core/getJumpIn.ts` and everything under `content/` never
  import `core/game.ts` or `core/stories.ts`, directly or through a screen.
- Exact values from the spec: the flags are `hasBottle`, `bottleGiven`, `hasKeys`, `hasTicket`, all
  false at a start that names none; `FRIEND_EARLY = [1020, 1200]`, `FRIEND_LATE = [1380, 1620]`,
  `PARTY = [1200, 1500]`, `BOTTLE_PRICE = 250`, `TICKET_PRICE = 300`, `SEARCH_HOUR = 60`; the titles
  are `The keys` and `The birthday`; the search's choice is `Look for them` with `minutes: 10` and
  odds `0.7`, or `0.4` at three drinks or more, so its label reads `Look for them  10 min  70%` or
  `…40%`; the other labels are `Not now`, `Ask after your friend`, `Buy the bottle for the birthday`
  (label `…  250 Kč`), `Hand over the bottle`, `Keep it for now`, `Buy a ticket home` (label
  `…  300 Kč`), `Walk away`; the node ids are the spec's: `there`, `found`, `missed`, `away`,
  `chat`; `wrapped`; `withBottle`, `given`, `opened`, `withoutBottle`, `thanked`, `laid`, `over`;
  `machine`, `bought`, `ticketed`; the note reads `Keys are with me. Find me, I'm out.`; the train
  home leaves at `08:04`; the jump-in's parameter is `quest=` with the names `keys`, `bottle`,
  `given` and `ticket`.
- Stand-in content keeps the limits of the content files' header comment: written with `standIn`, no
  word longer than 16 characters, people have no names, every node sets `speaker`, italic marks in
  pairs, a description is two or three sentences. A new spot's label fits the scene button (21
  characters) and its position passes the content test's overlap check on the three screens; the
  positions below were checked against that rule.

## Review Focus

- **A failed search that lands after the close.** At 02:30 the failure moves the clock to 03:40,
  past Rotor's 03:00: the window finishes, the closing runs and the player stands on Dvořákova.
  Pinned in Task 4.
- **The bottle leaves 100 Kč, then the ticket is out of reach.** With 100 Kč the machine's choice is
  greyed out and takes no press. Pinned in Task 3.
- **The keys first, whatever the hour.** With the keys the back room is a chat at 21:00 too, when
  the friend would be away. Pinned in Task 4.
- **`quest=given` without `bottle`.** The long table reads `thanked`, and the shelves still offer
  the bottle: the state is odd and only a jump-in makes it, and the checker runs it with the other
  fifteen. Pinned in Task 5.
- **Hints that read the bottle or the ticket.** A hint's text is the same with and without those
  flags at every hour, so the branches stay on one axis. Pinned in Task 4.

## File Structure

| File (under `apps/foam/`)                                               | Responsibility                                                                  | Task    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------- |
| `source/game/core/night.ts`                                             | `Quest`, `quest` on the night, `createNight` reads `start.quest`                | 1       |
| `source/game/core/travel.ts`                                            | `NightStart.quest`                                                              | 1       |
| `source/game/core/getJumpIn.ts`                                         | `quest=`                                                                        | 1       |
| `source/game/core/checkContent.ts`                                      | Check nights over the sixteen quest states; the effect's fresh night keeps them | 2       |
| `source/game/content/quest.ts`                                          | New. The spans, the prices, the cost of a failed search, the two titles         | 3       |
| `source/game/content/locations/train/train.ts`                          | The bag and the timetable; one sentence in the description                      | 3       |
| `source/game/content/locations/hlavniNadrazi/hall.ts`                   | The ticket machine                                                              | 3       |
| `scripts/list-stand-ins.mjs`                                            | Counts `quest.ts`                                                               | 3       |
| `tests/nightScreenHelpers.tsx`                                          | `startFrom`                                                                     | 3       |
| `tests/nightScreenQuest.browser.test.ts`                                | New. The threads on the game's content, through jump-ins                        | 3, 4, 5 |
| `source/game/content/locations/rotorBar/room.ts`                        | The back room, the bartender's hint (4); the long table (5)                     | 4, 5    |
| `source/game/content/locations/rotorBar/street.ts`                      | The smokers' hint                                                               | 4       |
| `source/game/content/locations/whiskyShop/room.ts`                      | The shopkeeper's hint (4); the bottle on the shelves (5)                        | 4, 5    |
| `docs/direction.md`, `docs/superpowers/specs/…-quest-threads-design.md` | State that the spec is built                                                    | 6       |

---

### Task 1: The quest on the night and in the jump-in

**Files:**

- Modify: `source/game/core/night.ts:21-71`, `source/game/core/travel.ts:60-83`,
  `source/game/core/getJumpIn.ts:27-88`
- Test: `tests/night.test.ts:13-30`, `tests/getJumpIn.test.ts`, `tests/jumpIn.browser.test.ts:47-59`

**Interfaces:**

- Produces, in `core/night.ts`, the spec's `Quest` with its doc comments and `quest: Quest` on
  `Night` (`/** What the night has done about its three threads; content writes it in effects. */`),
  after `stories`; `createNight`'s `start` gains `quest?: Partial<Quest>` and the night's `quest` is
  `{hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false, ...start.quest}`. In
  `core/travel.ts`, `NightStart` gains `quest?: Partial<Quest>`
  (`/** The flags the night starts with; a jump-in writes them. */`), so the route's
  `Object.assign(nightStart, …)` and `createNight(nightStart, …)` agree. `getJumpIn`'s result gains
  `quest?: Partial<Quest>`.

Decisions the spec leaves to the plan:

- **Reading `quest=`.** The value is split on `,`; each name is looked up in
  `{keys: 'hasKeys', bottle: 'hasBottle', given: 'bottleGiven', ticket: 'hasTicket'}` and sets that
  flag true; an unknown name warns
  `` `The jump-in ignores the quest flag "${name}": the flags are keys, bottle, given and ticket.` ``
  and the others apply. `quest` is set on the result only when at least one name was known, so a
  result without flags has no `quest` key.
- `tests/jumpIn.browser.test.ts`'s `afterAll` gains `delete nightStart.quest` beside the level's.

- [ ] **Step 1: Write the failing tests**

`tests/night.test.ts`: the first test's `toEqual` gains
`quest: {hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false}` last. New test
`createNight keeps the flags a start names and leaves the others false`:
`createNight({...START, quest: {hasKeys: true, hasTicket: true}}).quest` equals
`{hasBottle: false, bottleGiven: false, hasKeys: true, hasTicket: true}`.

`tests/getJumpIn.test.ts`: `reads the quest's flags in any order`:
`getJumpIn('?place=rotorBarRoom&quest=keys,ticket', places)` equals
`{place: 'rotorBarRoom', quest: {hasKeys: true, hasTicket: true}}` and `…&quest=ticket,keys` the
same, no warning; `reads every flag`: `quest=bottle,given` gives
`{hasBottle: true, bottleGiven: true}`; `drops an unknown flag with a warning and keeps the others`:
`quest=keys,flat` gives `{place: 'rotorBarRoom', quest: {hasKeys: true}}` and `warn` is called once
with a string containing `"flat"`; `quest=flat` gives `{place: 'rotorBarRoom'}` with no `quest` key.

Run: `npx vitest run --project unit tests/night.test.ts tests/getJumpIn.test.ts` Expected: FAIL (no
`quest`).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/night.ts source/game/core/travel.ts source/game/core/getJumpIn.ts tests/night.test.ts tests/getJumpIn.test.ts tests/jumpIn.browser.test.ts
npx vitest run --project unit
npm run typecheck
npx eslint source tests scripts
git add source/game/core/night.ts source/game/core/travel.ts source/game/core/getJumpIn.ts tests/night.test.ts tests/getJumpIn.test.ts tests/jumpIn.browser.test.ts
git commit -m "Remember the quest on the night and start it from a jump-in"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 2: The checker over the sixteen quest states

**Files:**

- Modify: `source/game/core/checkContent.ts` (the constants, `checkEffect`'s fresh night,
  `checkScript`'s nights)
- Test: `tests/checkContent.test.ts`

**Interfaces:**

- Consumes: `Quest`, `createNight` (Task 1).
- Produces: `QUEST_STATES: readonly Quest[]`, the sixteen combinations of the four flags, built once
  at module level from `['hasBottle', 'bottleGiven', 'hasKeys', 'hasTicket']` (the state with every
  flag false first); `checkScript` makes a night per place, time, level and state,
  `createNight({place, minutes, money: CHECK_MONEY, drunkenness, quest}, collection)`; and
  `checkEffect`'s fresh night carries `quest: {...night.quest}`, so an effect runs on the state it
  was made for and writes into a copy. The comment on the check nights names the four axes.

- [ ] **Step 1: Write the failing tests**

`tests/checkContent.test.ts`:
`a text that reads the keys is checked with and without them, which proves the quest states run`: a
description whose text is
`(night) => (night.quest.hasKeys ? 'A supercalifragilistic word.' : 'Fine.')`; the lines contain
`zidenice › description › start: "supercalifragilistic" has 20 characters, and 16 fit`.
`an effect runs on the state of its night`: a start node with a choice `Try` whose `onChoose` throws
only when `night.quest.hasTicket && !night.quest.hasKeys`, and a free `Go`; the lines contain
`zidenice › description › start › "Try": throws "No way."`. The counting test's expectation becomes
`16 * 2 * 5 * 33 * 3`, with a comment naming the sixteen quest states and the two collections.

Run: `npx vitest run --project unit tests/checkContent.test.ts` Expected: FAIL (one state only).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Measure the content test**

Run: `npx vitest run --project unit tests/content.test.ts` Expected: PASS, and the file's time in
the report is under 5 s. The content as it stands has a handful of choices with odds and a function
`next`, each rolled 100 times on every check night. If the time is above 5 s, report it in the
hand-over; the number of states is the spec's decision and does not change here.

- [ ] **Step 4: Check and commit**

```bash
npx prettier --write source/game/core/checkContent.ts tests/checkContent.test.ts
npx vitest run --project unit
npm run typecheck
npx eslint source tests scripts
git add source/game/core/checkContent.ts tests/checkContent.test.ts
git commit -m "Check the content on every state of the quest"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 3: The quest's numbers, the setup on the train and the ticket machine

**Files:**

- Create: `source/game/content/quest.ts`, `tests/nightScreenQuest.browser.test.ts`
- Modify: `source/game/content/locations/train/train.ts`,
  `source/game/content/locations/hlavniNadrazi/hall.ts`, `scripts/list-stand-ins.mjs:58-63`,
  `tests/nightScreenHelpers.tsx`
- Test: `tests/content.test.ts`, `tests/listStandIns.test.ts`,
  `tests/nightScreenQuest.browser.test.ts`

**Interfaces:**

- Consumes: `isWithin`, `type Span`, `isOpenAt`; `standIn`; `defineScript`; `getJumpIn`.
- Produces: `content/quest.ts`, exactly the spec's block with its doc comments (`FRIEND_EARLY`,
  `FRIEND_LATE`, `PARTY`, `BOTTLE_PRICE`, `TICKET_PRICE`, `SEARCH_HOUR`, `KEYS_STORY`,
  `BIRTHDAY_STORY`, `isFriendIn`), under a header comment that the titles are stand-in text. In
  `train/train.ts`: the spot `The bag` at `x: 0.85, y: 0.3`, a script of one node of two pages, the
  note (`Keys are with me. Find me, I'm out.`, no place) and then the invitation (a birthday at
  Rotor Bar tonight, a bottle promised); the spot `The timetable` at `x: 0.5, y: 0.12`, one node:
  the `08:04` train from the main station and a ticket at `${TICKET_PRICE} Kč`; the description
  gains one sentence, that the night is the player's until the morning. In `hlavniNadrazi/hall.ts`:
  the spot `The ticket machine` at `x: 0.5, y: 0.12` with the spec's `machine` script. The script
  lists `quest.ts` after `nightEnd.ts`. In `tests/nightScreenHelpers.tsx`:

```ts
/**
 * Starts a new night from a jump-in's query, as the address does at the boot: the result's place,
 * hour, money, level and quest go into nightStart, the level and the quest cleared first so a start
 * names only what it gives; then Quit to menu and New Game. A query that is no jump-in throws.
 */
export async function startFrom(harness: Harness, search: string): Promise<void>;
```

Decisions the spec leaves to the plan:

- **The bag's pages** are one `standIn` text with a blank line between the two pages. The train's
  spots keep their positions; the two new ones were checked against the overlap rule with them.
- **The browser test's world** is the game's own content, not the fixed world: the threads are in
  the places. It boots at 960 × 540 on the main menu and starts each scene with `startFrom`; its
  `beforeAll` records `nightStart`'s `minutes`, `money` and `place` and its `afterAll` puts them
  back and deletes the level and the quest. A node is recognised by identity: the spot's script is
  found on `nightStart.places[id].spots` by its label, and `storyWindow.dialogue.node` is compared
  with `script.nodes?.[id]` (`defineScript` keeps one object per node).

- [ ] **Step 1: Write the failing tests**

`tests/content.test.ts`: `openSpot`'s options gain `quest?: Partial<Quest>`, passed to
`createNight`. A helper `nodeOf(id, label, key)` returns
`getSpotScript(getPlace(id), label).nodes?.[key]`. New tests:

- `the quest's spans lie inside Rotor's hours`: for each of `FRIEND_EARLY`, `FRIEND_LATE` and
  `PARTY`, `isOpenAt(locationData.rotorBar.hours, span[0])` and
  `isOpenAt(locationData.rotorBar.hours, span[1] - 1)` are true.
- `the bag holds the note and the invitation, and the timetable the train and its price`: the bag's
  node at 960 has a text of two pages (resolved with the night when a function), the first
  containing `Keys are with me. Find me, I'm out.` and the second `Rotor Bar`; the timetable's
  `pageText` contains `08:04` and `300 Kč`.
- `the ticket machine sells the ticket once`:
  `openSpot('hlavniNadraziHall', 'The ticket machine', 1500)`: the node is `nodeOf(…, 'machine')`
  and the choices read `['Buy a ticket home', 'Walk away']`; `advance()`, `choose(0)`:
  `night.quest.hasTicket` is true, `night.money` is 50, the node is `bought`; with
  `{quest: {hasTicket: true}}` the node is `ticketed` and the choices `[]`.

`tests/listStandIns.test.ts`: `starts` gains `'quest.ts'`.

`tests/nightScreenQuest.browser.test.ts`, a describe with a long timeout, the tests in order:

- `the bag and the timetable set the quest up on the train`:
  `startFrom(harness, '?place=train&time=16:00')`, `closeStory`; `openSpot('The bag')`:
  `dialogue.pageText` contains `Keys are with me`; `pressThrough` reads to the last page and
  `dialogue.pageIndex` is then 1 (`readPages` reads one runner page only, so it is not the tool
  here); `endStory`, `waitForNoStoryWindow`; `openSpot('The timetable')`: `dialogue.pageText`
  contains `08:04`; `endStory`.
- `the machine sells the ticket and reads it back`:
  `startFrom('?place=hlavniNadraziHall&time=23:00')`, `closeStory`;
  `openSpot('The ticket machine')`, `pressThrough`; the labels are
  `['Buy a ticket home  300 Kč', 'Walk away']`; focus button 0, Enter; `readText(statusText)` is
  `'23:00   50 Kč   0.0'`, `night.quest.hasTicket` is true; `endStory`, `waitForNoStoryWindow`;
  `openSpot` again: the node is the script's `ticketed` and `visibleChoices` is empty.
- `with 100 Kč the ticket is greyed out`:
  `startFrom('?place=hlavniNadraziHall&time=23:00&money=100')`, `closeStory`, open, `pressThrough`;
  button 0 reads `'Buy a ticket home  300 Kč'` and `isDisabled` is true.

Run:
`npx vitest run --project unit tests/content.test.ts tests/listStandIns.test.ts && npx vitest run --project browser tests/nightScreenQuest.browser.test.ts`
Expected: FAIL (module not found; no such spots).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/content/quest.ts source/game/content/locations/train/train.ts source/game/content/locations/hlavniNadrazi/hall.ts scripts/list-stand-ins.mjs tests/nightScreenHelpers.tsx tests/content.test.ts tests/listStandIns.test.ts tests/nightScreenQuest.browser.test.ts
npx vitest run --project unit
npx vitest run --project browser tests/nightScreenQuest.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/content/quest.ts source/game/content/locations/train/train.ts source/game/content/locations/hlavniNadrazi/hall.ts scripts/list-stand-ins.mjs tests/nightScreenHelpers.tsx tests/content.test.ts tests/listStandIns.test.ts tests/nightScreenQuest.browser.test.ts
git commit -m "Set the quest up on the train and sell the ticket home in the hall"
```

Expected: PASS, the content test gives the empty list; typecheck 0; eslint 0 errors.

### Task 4: The friend and the hints

**Files:**

- Modify: `source/game/content/locations/rotorBar/room.ts`,
  `source/game/content/locations/rotorBar/street.ts`,
  `source/game/content/locations/whiskyShop/room.ts:54-61`
- Test: `tests/content.test.ts`, `tests/nightScreenQuest.browser.test.ts`

**Interfaces:**

- Consumes: `FRIEND_EARLY`, `FRIEND_LATE`, `SEARCH_HOUR`, `KEYS_STORY`, `isFriendIn` (Task 3);
  `findStory`; `getDrunkenness`; `isWithin`.
- Produces: in `rotorBar/room.ts` the spot `The back room` at `x: 0.3, y: 0.2` with the spec's
  `backRoom` script (`there`, `found`, `missed`, `away`, `chat`); the bar's node gains
  `{text: 'Ask after your friend', next: 'friend'}` between the beer and `Not now`, and a node
  `friend` whose text is a function of the night. In `rotorBar/street.ts` the smokers' node gains
  the same choice between the cigarette and `Leave them to it`, and a `friend` node. In
  `whiskyShop/room.ts` the shopkeeper's script becomes `start: 'shopkeeper'` with the node
  `shopkeeper` (its text as today) offering `Ask after your friend` and a free `Say nothing`, and a
  `friend` node.

Decisions the spec leaves to the plan:

- **The hint texts** read `night.quest.hasKeys` first: with the keys, one text that the friend is
  wherever they are. Without, the bartender and the smokers give four texts by
  `night.minutes < FRIEND_EARLY[0]`, `isWithin(night, FRIEND_EARLY)`,
  `night.minutes < FRIEND_LATE[0]` and else, with the spec's table as their sense; the bartender's
  third text names the hour `eleven`. The shopkeeper gives one text without the keys, that the
  friend bought a bottle this afternoon and said something about `Dvořákova`. No hint reads another
  flag.
- **`missed`'s text** reads `isFriendIn(night)` after the hour was added, as the spec's block does,
  so a failure that outlasts the friend's hours says the back room has emptied.

- [ ] **Step 1: Write the failing tests**

`tests/content.test.ts`:

- `the back room has the friend by the hour, and is a chat once the keys are in hand`: the back
  room's node at 1000 is `away`, at 1020 `there`, at 1199 `there`, at 1200 `away`, at 1379 `away`,
  at 1380 `there`, at 1619 `there`, and at 1300 with `{quest: {hasKeys: true}}` `chat`.
- `the search's odds fall with the drinks`: at 1100,
  `formatChoice(asChoice(dialogue.visibleChoices[0]!), night)` is `'Look for them  10 min  70%'`,
  and with `{drunkenness: 3}` `'Look for them  10 min  40%'`.
- `a won search hands over the keys, and a lost one costs an hour`: at 1100 with
  `night.random = () => 0.1`, `advance()`, `choose(0)`: `hasKeys` is true, `night.stories` equals
  `[{title: 'The keys', minutes: 1110}]`, the node is `found`; at 1100 with `random` `0.9`:
  `hasKeys` is false, `night.minutes` is 1170, the node is `missed`.
- `the hints answer by the hour and by the keys, and read nothing else`: a helper
  `ask(id, label, minutes, quest?)` opens the spot, `advance()`s and `choose`s the index of
  `Ask after your friend` among `visibleChoices`, and returns `pageText`. The bartender's answers at
  1000, 1100, 1300 and 1400 are four distinct strings and the one at 1300 contains `eleven`; at 1100
  with `{hasKeys: true}` the answer differs from the one without, and with
  `{hasBottle: true, hasTicket: true}` it is the same as without. The smokers' answers at the same
  four hours are distinct. The shopkeeper's answer at 1100 contains `Dvořákova`, and with the keys
  it differs.

`tests/nightScreenQuest.browser.test.ts`, after the hall's tests:

- `the back room offers the search with its odds, and a won search hands over the keys`:
  `startFrom('?place=rotorBarRoom&time=17:30')`, `closeStory`; `openSpot('The back room')`,
  `pressThrough`; the labels are `['Look for them  10 min  70%', 'Not now']`;
  `contents.night.random = () => 0.1`; focus button 0, Enter; `waitForToast` reads `'The keys'`;
  `night.quest.hasKeys` is true; `readText(statusText)` is `'17:40   350 Kč   0.0'`; `endStory`,
  `waitForNoStoryWindow`; `openSpot` again: the node is the script's `chat`.
- `a lost search costs an hour`: `startFrom(…17:30)`, `closeStory`, open, `pressThrough`,
  `random = () => 0.9`, take the search; `readText(statusText)` is `'18:40   350 Kč   0.0'`,
  `hasKeys` is false, the node is `missed`; `endStory`.
- `at three drinks the odds read 40%`: `startFrom('?place=rotorBarRoom&time=17:30&drunkenness=3')`,
  `closeStory`, open, `pressThrough`; button 0 reads `'Look for them  10 min  40%'`.
- `at 20:30 the back room is away`: `startFrom(…20:30)`, `closeStory`, open: the node is `away` and
  there are no choices.
- `a lost search after half past two lands after the close`:
  `startFrom('?place=rotorBarRoom&time=02:30')`, `closeStory`, open, `pressThrough`,
  `random = () => 0.9`, take; the status starts with `'03:40'`; `endStory`;
  `waitForSpeaker(harness, 'Closing time')`, `endStory` of it;
  `waitForPlace(harness, 'rotorBarStreet')`.
- `the bartender's answer changes with the hour`: `startFrom(…16:30)`, `closeStory`,
  `openSpot('The bar')`, `pressThrough`; the labels are
  `['Order a beer  10 min  45 Kč', 'Ask after your friend', 'Not now']`; take the hint,
  `early = dialogue.pageText`, `endStory`; `startFrom(…21:00)` and the same: `late` is not `early`
  and contains `eleven`.

Run:
`npx vitest run --project unit tests/content.test.ts && npx vitest run --project browser tests/nightScreenQuest.browser.test.ts`
Expected: FAIL (no back room; no hint).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/content/locations/rotorBar/room.ts source/game/content/locations/rotorBar/street.ts source/game/content/locations/whiskyShop/room.ts tests/content.test.ts tests/nightScreenQuest.browser.test.ts
npx vitest run --project unit
npx vitest run --project browser tests/nightScreenQuest.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/content/locations/rotorBar/room.ts source/game/content/locations/rotorBar/street.ts source/game/content/locations/whiskyShop/room.ts tests/content.test.ts tests/nightScreenQuest.browser.test.ts
git commit -m "Put the friend in Rotor's back room and the hints in three mouths"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 5: The bottle and the birthday

**Files:**

- Modify: `source/game/content/locations/whiskyShop/room.ts:27-53`,
  `source/game/content/locations/rotorBar/room.ts`
- Test: `tests/content.test.ts`, `tests/nightScreenQuest.browser.test.ts`

**Interfaces:**

- Consumes: `PARTY`, `BOTTLE_PRICE`, `BIRTHDAY_STORY` (Task 3); `findStory`; `getDrunkenness`;
  `isWithin`.
- Produces: in `whiskyShop/room.ts` the shelves' node gains the spec's bottle choice first, before
  the dram, and the node `wrapped`, one page, the bottle in the bag. In `rotorBar/room.ts` the spot
  `The long table` at `x: 0.72, y: 0.62` with the spec's `longTable` script (`withBottle`, `given`,
  `opened`, `withoutBottle`, `thanked`, `laid`, `over`).

- [ ] **Step 1: Write the failing tests**

`tests/content.test.ts`:

- `the shelves sell the bottle once`: `openSpot('whiskyShopRoom', 'The shelves', 1020)` offers
  `['Buy the bottle for the birthday', 'Pour a dram', 'Pour the good one', 'Not now']`; `advance()`,
  `choose(0)`: `hasBottle` is true, `night.money` is 100, the node is `wrapped`; with
  `{quest: {hasBottle: true}}` the choices are `['Pour a dram', 'Pour the good one', 'Not now']`.
- `the long table is the birthday from 20:00 to 01:00`: the node at 1100 is `laid`; at 1200
  `withoutBottle`; at 1200 with `{hasBottle: true}` `withBottle`; at 1499 with `{hasBottle: true}`
  `withBottle`; at 1200 with `{hasBottle: true, bottleGiven: true}` `thanked`; at 1200 with
  `{bottleGiven: true}` `thanked`; at 1500 `over`.
- `the hand-over keeps the promise, and at three drinks the bottle is opened`: at 1200 with
  `{hasBottle: true}`, `advance()`, `choose(0)`: `bottleGiven` is true, `night.stories` equals
  `[{title: 'The birthday', minutes: 1200}]`, the node is `given`; the same with `{drunkenness: 3}`:
  the node is `opened` and the story is the same.

`tests/nightScreenQuest.browser.test.ts`, after the friend's tests:

- `the bottle is greyed out with 100 Kč and bought with 350`:
  `startFrom('?place=whiskyShopRoom&time=17:00&money=100')`, `closeStory`,
  `openSpot('The shelves')`, `pressThrough`; button 0 reads
  `'Buy the bottle for the birthday  250 Kč'` and `isDisabled` is true;
  `startFrom('?place=whiskyShopRoom&time=17:00')`, the same, button 0 enabled; take it:
  `readText(statusText)` is `'17:00   100 Kč   0.0'`, `night.quest.hasBottle` is true; `endStory`,
  `waitForNoStoryWindow`; open the shelves again, `pressThrough`: the labels are
  `['Pour a dram  15 min  90 Kč', 'Pour the good one  15 min  180 Kč', 'Not now']`.
- `the long table takes the bottle, and the birthday is a story`:
  `startFrom('?place=rotorBarRoom&time=20:30&quest=bottle')`, `closeStory`,
  `openSpot('The long table')`, `pressThrough`; the labels are
  `['Hand over the bottle', 'Keep it for now']`; take the first; `waitForToast` reads
  `'The birthday'`; `night.quest.bottleGiven` is true; the node is `given`.
- `at three drinks the bottle is opened on the spot`:
  `startFrom('?place=rotorBarRoom&time=20:30&quest=bottle&drunkenness=3')`, the same; the node is
  `opened` and `bottleGiven` is true (no toast is awaited: the story was achieved in the test
  before).

Run:
`npx vitest run --project unit tests/content.test.ts && npx vitest run --project browser tests/nightScreenQuest.browser.test.ts`
Expected: FAIL (no bottle; no long table).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: List the stand-ins**

Run: `node scripts/list-stand-ins.mjs` Expected: a line `quest.ts` with 2 stand-ins after
`nightEnd.ts`; `train/train.ts`, `hlavniNadrazi/hall.ts`, `rotorBar/room.ts`, `rotorBar/street.ts`
and `whiskyShop/room.ts` count more than before this plan; the total is about 100.

- [ ] **Step 4: Check and commit**

```bash
npx prettier --write source/game/content/locations/whiskyShop/room.ts source/game/content/locations/rotorBar/room.ts tests/content.test.ts tests/nightScreenQuest.browser.test.ts
npx vitest run --project unit
npx vitest run --project browser tests/nightScreenQuest.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/content/locations/whiskyShop/room.ts source/game/content/locations/rotorBar/room.ts tests/content.test.ts tests/nightScreenQuest.browser.test.ts
git commit -m "Sell the bottle at The Whisky Shop and hold the birthday at Rotor's long table"
```

Expected: PASS, the content test gives the empty list and stays under 5 s; typecheck 0; eslint 0
errors.

### Task 6: Whole check and hand-over

**Files:** `docs/direction.md`, `docs/superpowers/specs/2026-10-19-quest-threads-design.md`.

- [ ] **Step 1: Run everything once**

From the repository root: `npx turbo run typecheck lint test --filter=foam --concurrency=1`
Expected: every task succeeds (this is the one full run; CI repeats it). Then
`git diff --stat 4c95869e -- apps/somewhere packages/tellurion` prints nothing.

- [ ] **Step 2: State that the spec is built**

- `docs/direction.md`: in the phase 6 list, item 2 ends "It is built:" with links to the spec and to
  this plan.
- The spec's status: "implemented by
  [2026-10-21-quest-threads.md](../plans/2026-10-21-quest-threads.md)".

```bash
git add docs/direction.md docs/superpowers/specs/2026-10-19-quest-threads-design.md
git commit -m "State that the quest's threads are built"
```

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build: every step of the spec's "What the player sees" in a wide window and in one narrower
than 240 art pixels; a night from the train through the shop, the back room and the long table; a
failed search at 02:30; `?place=rotorBarRoom&time=20:30&quest=bottle` and
`?place=hlavniNadraziHall&time=07:50&quest=ticket`; the content test's time, if it was above 5 s;
and the numbers in `content/quest.ts`, which are the author's to tune.
