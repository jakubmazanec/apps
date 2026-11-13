# The Endings and Sleep (Foam Phase 6, Spec 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Morning text branches on the quest's flags, a ticket first, then the keys, then
stranded, each with a line on the bottle and the night's stories, and offers two choices when the
player holds both; and the player may sleep the rest of the night away, on the hall's benches, on
Židenice's bench, under the shelter at Náměstí Republiky and, with the keys, from any outdoor place.
This closes the first prototype: one whole night.

**Architecture:** `sleepTillMorning` in `core/hours.ts` sets the clock to `NIGHT_END`; the end check
that exists does the rest when the window closes. `createWayOut` gains the flat's choice once, so
every outdoor way out offers it with the keys; three places gain a sleep choice by hand.
`content/nightEnd.ts` becomes a script of four nodes with a function `start` on `night.quest`, and
two functions compose the bottle's and the stories' sentences into the texts.

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tellurion
(`Dialogue`), Vitest 4 (`unit` in Node, `browser` in Playwright's Chromium), Node 24 scripts,
Prettier 3, Turborepo.

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-19-endings-and-sleep-design.md`

Runs after the plan `apps/foam/docs/superpowers/plans/2026-10-21-quest-threads.md`, which is built:
`night.quest` holds the four flags, `createNight`'s start and `getJumpIn` take `quest`, the checker
runs on the sixteen quest states, and `tests/nightScreenHelpers.tsx` has `startFrom`.

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
  comments say why and stay within 100 columns; never remove a comment. Prettier formats (printWidth
  100, no bracket spacing, single quotes) and lint fails on a difference: run `npx prettier --write`
  on the task's files before lint.
- `exactOptionalPropertyTypes` is on: never set an optional field to `undefined`; build an object
  with a field only when it has a value.
- Tests: the `vitest` object, not `vi`; a blank line separates a group of `expect` lines from other
  statements; `describe(fn, …)` when named after a function; no `expect` inside `beforeAll` or
  `beforeEach`; game modules are imported after `bootGame`, never at the top of a browser test
  (types only at the top; `nightStart`, `nightEnd` and the content modules import no game module and
  may be imported at the top); a browser file boots the game once and clears `localStorage` in
  `afterAll`; a test that writes into `nightStart` puts it back in `afterAll`, including
  `delete nightStart.quest` and `delete nightStart.drunkenness`.
- `core/hours.ts`, `core/createWayOut.ts` and everything under `content/` never import
  `core/game.ts` or `core/stories.ts`, directly or through a screen.
- Exact values from the spec: `sleepTillMorning` sets `night.minutes` to `NIGHT_END` (1920); the
  flat's choice is `Walk to the flat and sleep`, visible with `night.quest.hasKeys`, with no
  `minutes` field, between the ways and `Stay`, leading to an inline node whose speaker is
  `The flat`; the hall's benches offer `Doze till the first train` and `Stay on your feet`;
  Židenice's bench offers `Sleep it off` and `Leave him to it`; the shelter at Náměstí Republiky
  adds `Sleep it off` after its two choices; the end's nodes are `both`, `leave`, `stay` and
  `stranded`, all with the speaker `Morning`; `both` offers `Take the train` (to `leave`) and `Stay`
  (to `stay`); the order is a ticket and the keys to `both`, a ticket to `leave`, the keys to
  `stay`, neither to `stranded`; the train is the `08:04`.
- Stand-in content keeps the limits of the content files' header comment: written with `standIn`, no
  word longer than 16 characters, people have no names, every node sets `speaker`, italic marks in
  pairs, two or three sentences a page. A new spot's label fits the scene button (21 characters) and
  its position passes the content test's overlap check on the three screens; the position below was
  checked against that rule.

## Review Focus

- **Sleep at 07:59.** The clock moves one minute and the night ends as it would have. Pinned in Task
  1 (`sleepTillMorning` from 1919).
- **Sleeping outside with the keys.** The ending reads the flags, not the place: a doze on the
  hall's benches with the keys gives the stay ending. Pinned in Task 2.
- **The level after a sleep.** Five drinks at 03:00 are 0.0 at 08:00; the status line reads it so.
  Pinned in Task 1.
- **The bottle opened at the party.** `bottleGiven` is true, so the ending reads the promise kept,
  the same sentence as a bottle handed over. Pinned in Task 2.
- **The flat choice's length.** `Walk to the flat and sleep` is 26 characters and wraps to two lines
  inside its button on the narrowest screen; every word is within the 16 the checker allows. Pinned
  in Task 1 by the content test's empty list.

## File Structure

| File (under `apps/foam/`)                                                   | Responsibility                                                      | Task |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---- |
| `source/game/core/hours.ts`                                                 | `sleepTillMorning`                                                  | 1    |
| `source/game/core/createWayOut.ts`                                          | The flat choice, visible with the keys                              | 1    |
| `source/game/content/locations/hlavniNadrazi/hall.ts`                       | The benches                                                         | 1    |
| `source/game/content/locations/zidenice/zidenice.ts`                        | The bench's sleep choice                                            | 1    |
| `source/game/content/locations/namestiRepubliky/stop.ts`                    | The shelter's sleep choice                                          | 1    |
| `scripts/list-stand-ins.mjs`                                                | Counts `core/createWayOut.ts`                                       | 1    |
| `source/game/content/nightEnd.ts`                                           | The four nodes and the function `start`; the bottle line; the count | 2    |
| `tests/nightScreenEnd.browser.test.ts`                                      | The three endings and the sleep choices, through jump-ins           | 3    |
| `docs/direction.md`, `docs/superpowers/specs/…-endings-and-sleep-design.md` | State that the spec and phase 6 are built                           | 4    |

---

### Task 1: Sleep

**Files:**

- Modify: `source/game/core/hours.ts`, `source/game/core/createWayOut.ts`,
  `source/game/content/locations/hlavniNadrazi/hall.ts`,
  `source/game/content/locations/zidenice/zidenice.ts:34-42`,
  `source/game/content/locations/namestiRepubliky/stop.ts:26-60`, `scripts/list-stand-ins.mjs:58-63`
- Test: `tests/hours.test.ts`, `tests/createWayOut.test.ts`, `tests/content.test.ts`,
  `tests/listStandIns.test.ts`

**Interfaces:**

- Consumes: `NIGHT_END`; `standIn`; `defineScript`; `getDrunkenness`.
- Produces, in `core/hours.ts`, exactly the spec's `sleepTillMorning(night: Night): void` with its
  doc comment. In `core/createWayOut.ts`, the spec's flat choice between the ways and `Stay`, with
  `onChoose: sleepTillMorning` and `next: {speaker: 'The flat', text: standIn`…`}`, one page, the
  flat at night; the file gains the content files' header comment on the stand-in. In
  `hlavniNadrazi/hall.ts`: the spot `The benches` at `x: 0.5, y: 0.95`, a script with the node
  `benches` offering
  `{text: 'Doze till the first train', onChoose: sleepTillMorning, next: 'dozed'}` and
  `{text: 'Stay on your feet'}`, and the node `dozed`, one page. In `zidenice/zidenice.ts`: the
  bench's script becomes `start: 'bench'` with the node `bench` (its text and its entry effect as
  today) offering `{text: 'Sleep it off', onChoose: sleepTillMorning, next: 'asleep'}` and
  `{text: 'Leave him to it'}`, and the node `asleep`, one page. In `namestiRepubliky/stop.ts`: the
  shelter's node gains `{text: 'Sleep it off', onChoose: sleepTillMorning, next: 'asleep'}` after
  `Wait in silence`, and the node `asleep`, one page. The script lists `core/createWayOut.ts` after
  `quest.ts`, read from `new URL('../core/createWayOut.ts', contentDir)`, and its header comment
  names it.

Decisions the spec leaves to the plan:

- **The sleep pages** say that the night went by and the morning came; the log shows the choice at
  its minute and the page at 08:00, because the effect runs before the page is shown.
- **The benches' position** `(0.5, 0.95)` lies under the doors on every screen; the hall's five
  spots were checked together against the overlap rule.

- [ ] **Step 1: Write the failing tests**

`tests/hours.test.ts`: `describe(sleepTillMorning)`:
`moves the clock to 08:00 and the level falls with it`: a night at 1620 with `drunkenness: 5`: after
`sleepTillMorning` `night.minutes` is 1920 and `getDrunkenness(night)` is 0;
`moves one minute from 07:59`: a night at 1919 → 1920.

`tests/createWayOut.test.ts`: `start(ways, quest?: Partial<Quest>)` passes `quest` to `createNight`
when given. New tests: `the flat is offered with the keys, between the ways and Stay`:
`start(ALL_WAYS, {hasKeys: true})` has the texts
`['Walk', 'Take the tram', 'Take a taxi', 'Walk to the flat and sleep', 'Stay']`;
`the flat choice sleeps till morning, chooses no way and tells one page`: `choose(3)` on it:
`night.minutes` is 1920, `night.leaving` is null, `dialogue.node?.speaker` is `'The flat'`;
`advance()` twice: `dialogue.phase` is `'ended'`.

`tests/content.test.ts`: `three places let a stranded player sleep till morning`: the hall's
`The benches` at 1380 offers `['Doze till the first train', 'Stay on your feet']` and `advance()`,
`choose(0)` gives `night.minutes` 1920; Židenice's `The bench` at 1380 offers
`['Sleep it off', 'Leave him to it']` and `choose(0)` gives 1920; Náměstí Republiky's `The shelter`
at 1380 offers `['Ask when the next tram goes', 'Wait in silence', 'Sleep it off']` and `choose(2)`
gives 1920. `every outdoor place offers the flat with the keys, and none without`: for each place of
`places` with `outdoors`, some spot's `Dialogue` at 1400 with `{quest: {hasKeys: true}}` has a
visible choice `Walk to the flat and sleep`, and at 1400 without the keys none has.

`tests/listStandIns.test.ts`: `starts` gains `'core/createWayOut.ts'`.

Run:
`npx vitest run --project unit tests/hours.test.ts tests/createWayOut.test.ts tests/content.test.ts tests/listStandIns.test.ts`
Expected: FAIL (no `sleepTillMorning`; the choices are missing).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/hours.ts source/game/core/createWayOut.ts source/game/content/locations/hlavniNadrazi/hall.ts source/game/content/locations/zidenice/zidenice.ts source/game/content/locations/namestiRepubliky/stop.ts scripts/list-stand-ins.mjs tests/hours.test.ts tests/createWayOut.test.ts tests/content.test.ts tests/listStandIns.test.ts
npx vitest run --project unit
npm run typecheck
npx eslint source tests scripts
git add source/game/core/hours.ts source/game/core/createWayOut.ts source/game/content/locations/hlavniNadrazi/hall.ts source/game/content/locations/zidenice/zidenice.ts source/game/content/locations/namestiRepubliky/stop.ts scripts/list-stand-ins.mjs tests/hours.test.ts tests/createWayOut.test.ts tests/content.test.ts tests/listStandIns.test.ts
git commit -m "Let the player sleep the rest of the night away"
```

Expected: PASS, the content test gives the empty list; typecheck 0; eslint 0 errors.

### Task 2: The endings

**Files:**

- Modify: `source/game/content/nightEnd.ts`
- Test: `tests/content.test.ts:92-100`

**Interfaces:**

- Consumes: `standIn`; `defineScript`; `Night`.
- Produces: `content/nightEnd.ts` exports `nightEnd`, exactly the spec's block, with two functions
  in the file, `bottleLine(night: Night)` and `storiesLine(night: Night)`, each returning one
  `standIn` sentence: the bottle's by `quest.bottleGiven` (the promise kept), then `quest.hasBottle`
  (a bottle carried all night), else never bought; the stories' by `night.stories.length`: none,
  one, or the count written as a number. The file's header comment stays and gains that the end
  reads the four flags and the night's list.

Decisions the spec leaves to the plan:

- **The leave and stay texts** are written so that either holds whether the night ended at 08:00 on
  its own or through a sleep choice: the leave text has the player on the platform for the 08:04,
  the stay text at the flat, with no word on how the night ended.
- **The old test** `the end text reads the money` goes: the Morning text reads the flags and the
  list, not the money, as the spec decides.

- [ ] **Step 1: Write the failing tests**

`tests/content.test.ts`, with a helper `openEnd(quest: Partial<Quest>, stories = 0)` that builds
`createNight({place: 'hlavniNadraziHall', minutes: 1920, money: 50, quest})`, pushes `stories`
entries `{title: 'A story', minutes: 1500}` into `night.stories` and returns
`new Dialogue({script: nightEnd, context: night})`:

- `the end's start reads the flags: a ticket, then the keys, then stranded`: the node of
  `openEnd({hasTicket: true})` is `nightEnd.nodes?.leave`; of `{hasKeys: true}` `stay`; of
  `{hasKeys: true, hasTicket: true}` `both`; of `{}` and of `{hasBottle: true}` `stranded`; every
  node's speaker is `'Morning'`.
- `both offers two free choices, each to its ending`: the choices read `['Take the train', 'Stay']`
  and none has `price`, `minutes` or `drinks`; `advance()`, `choose(0)` gives the node `leave`;
  again with `choose(1)` the node `stay`.
- `every ending tells the bottle's fate`: the `pageText` of `openEnd({})`,
  `openEnd({hasBottle: true})` and `openEnd({hasBottle: true, bottleGiven: true})` are three
  distinct strings, and `openEnd({bottleGiven: true})` gives the third.
- `every ending counts the stories`: the `pageText` of `openEnd({hasKeys: true}, 0)`,
  `openEnd({hasKeys: true}, 1)` and `openEnd({hasKeys: true}, 3)` are three distinct strings and the
  third contains `'3'`.

Run: `npx vitest run --project unit tests/content.test.ts` Expected: FAIL (one node).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: List the stand-ins**

Run: `node scripts/list-stand-ins.mjs` Expected: `nightEnd.ts` counts the four nodes and the lines'
sentences, 10 stand-ins; `core/createWayOut.ts` 1.

- [ ] **Step 4: Check and commit**

```bash
npx prettier --write source/game/content/nightEnd.ts tests/content.test.ts
npx vitest run --project unit
npm run typecheck
npx eslint source tests scripts
git add source/game/content/nightEnd.ts tests/content.test.ts
git commit -m "End the night by the quest's flags"
```

Expected: PASS, the content test gives the empty list; typecheck 0; eslint 0 errors.

### Task 3: A whole night to each ending

**Files:**

- Test: `tests/nightScreenEnd.browser.test.ts`

**Interfaces:**

- Consumes: `startFrom`, `openSpot`, `pressThrough`, `endStory`, `closeStory`, `waitForSpeaker`,
  `waitForLogScreen` (the file's own), `getWindowParts`, `getButtonLabel`, `describeEntry`;
  `nightEnd` imported at the top.

Decisions the spec leaves to the plan:

- **One boot, two worlds.** The file boots in the fixed world; the new tests follow the existing
  ones in the same describe, and the first of them calls `restore()`, so the game's own content is
  in `nightStart` for `startFrom`. The travel window, built from the fixed world at attach, is never
  opened by them. The `afterAll` keeps `restore()` and gains `delete nightStart.quest` and
  `delete nightStart.drunkenness`.
- **An ending is recognised by identity**: `storyWindow.dialogue.node` is `nightEnd.nodes?.leave`
  and so on.

- [ ] **Step 1: Write the failing tests**

Appended to the describe of `tests/nightScreenEnd.browser.test.ts`:

- `a ticket in the pocket leaves on the 08:04`: `restore()`;
  `startFrom(harness, '?place=hlavniNadraziHall&time=07:50&quest=ticket')`, `closeStory`;
  `openSpot('The benches')`, `pressThrough`; take `Doze till the first train` (button 0); the status
  line starts with `'08:00'`; `endStory`; `end = await waitForSpeaker(harness, 'Morning')` has the
  node `leave`; `endStory(end)`; `waitForLogScreen()`.
- `the keys and the flat end the night on Dvořákova`:
  `startFrom('?place=rotorBarStreet&time=23:40&quest=keys')`, `closeStory`;
  `openSpot('The street')`, `pressThrough`; the labels are
  `['Walk', 'Take a taxi', 'Walk to the flat and sleep', 'Stay']`; take button 2;
  `storyWindow.dialogue.node?.speaker` is `'The flat'`; `readText(statusText)` is
  `'08:00   350 Kč   0.0'`; `endStory`; the Morning window's node is `stay`; `endStory`;
  `waitForLogScreen()`; `night.log.slice(-3).map(describeEntry)` equals
  `[['choice', 1420, 'Walk to the flat and sleep'], ['text', 1920, 'The flat'], ['text', 1920, 'Morning']]`.
- `with both the Morning text asks, and each answer leads to its ending`:
  `startFrom('?place=rotorBarStreet&time=23:40&quest=keys,ticket')`, `closeStory`, the flat as
  above, `endStory`; the Morning window's node is `both`; `pressThrough`; the labels are
  `['Take the train', 'Stay']`; take button 0: the node is `leave`; `endStory`;
  `waitForLogScreen()`. Then `startFrom` the same query again and repeat, taking button 1: the node
  is `stay`.
- `without the keys the flat is not offered, and the benches leave the player stranded`:
  `startFrom('?place=rotorBarStreet&time=23:40')`, `closeStory`, `openSpot('The street')`,
  `pressThrough`; the labels are `['Walk', 'Take a taxi', 'Stay']`; take `Stay`;
  `waitForNoStoryWindow`; `startFrom('?place=hlavniNadraziHall&time=23:00')`, `closeStory`,
  `openSpot('The benches')`, `pressThrough`, take button 0, `endStory`; the Morning window's node is
  `stranded`; `endStory`; `waitForLogScreen()`.

Run: `npx vitest run --project browser tests/nightScreenEnd.browser.test.ts` Expected: the existing
tests PASS and the new ones FAIL only if Tasks 1 and 2 were skipped; with them built, PASS. This
task's tests are the check of the whole; write them, run them, and fix what they find in Tasks 1 and
2's files before the commit.

- [ ] **Step 2: Check and commit**

```bash
npx prettier --write tests/nightScreenEnd.browser.test.ts
npx vitest run --project browser tests/nightScreenEnd.browser.test.ts tests/nightScreenQuest.browser.test.ts tests/nightScreenPlaces.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add tests/nightScreenEnd.browser.test.ts
git commit -m "Play the night to each of its endings"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 4: Whole check and hand-over

**Files:** `docs/direction.md`, `docs/superpowers/specs/2026-10-19-endings-and-sleep-design.md`.

- [ ] **Step 1: Run everything once**

From the repository root: `npx turbo run typecheck lint test --filter=foam --concurrency=1`
Expected: every task succeeds (this is the one full run; CI repeats it). Then
`git diff --stat 4c95869e -- apps/somewhere packages/tellurion` prints nothing.

- [ ] **Step 2: State that the spec and phase 6 are built**

- `docs/direction.md`: in the phase 6 list, item 3 ends "It is built:" with links to the spec and to
  this plan; the sentence before the list says phase 6 is built; the line at the top of the document
  says phases 1 to 6 are built and the review of phase 6 is next.
- The spec's status: "implemented by
  [2026-10-21-endings-and-sleep.md](../plans/2026-10-21-endings-and-sleep.md)".

```bash
git add docs/direction.md docs/superpowers/specs/2026-10-19-endings-and-sleep-design.md
git commit -m "State that the endings and sleep are built, and phase 6 with them"
```

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build: every step of the spec's "What the player sees" in a wide window and in one narrower
than 240 art pixels; a whole night from the train to the Stories window and the log by each of the
three endings; `?place=hlavniNadraziHall&time=07:50&quest=ticket`; the sleep choices in the three
places; and the review of phase 6, which the direction document says decides what is kept and what
is rewritten, and reopens the content model.
