# Actions with Costs, Odds and Conditions (Foam Phase 5, Spec 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A choice carries its price, minutes, drinks, odds and drunkenness condition as plain
fields; the press applies them wherever the script runs, the story window shows the numbers and
greys out what the night cannot pay, the travel window greys out a journey it cannot pay, the status
line shows the drunkenness in drinks and follows the night, and the checker reads the fields.

**Architecture:** `core/script.ts` types Foam's choice and node, and `defineScript` turns the fields
into Tellurion's `isVisible` and `onChoose` once, so the runner, the window, a unit test and the
checker apply one set of rules. The night stores the level at the last drink and the clock then, and
derives the level now, so whatever moves the clock lowers it. Dice route through Tellurion's new
function `next` (spec 1 of phase 5): the press rolls into `night.roll`, and the function reads it.
The windows read `price` for the greying, and the night screen writes the status from its update.

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tellurion
(`Dialogue`, `DialogueReference`, `Button.disable`, `Modal.initialFocus`), Pixi.js 8, Vitest 4
(`unit` in Node, `browser` in Playwright's Chromium), Prettier 3, Turborepo.

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-09-actions-with-costs-design.md`

Runs after the Tellurion plan `docs/superpowers/plans/2026-10-08-dialogue-next-function.md`: a
choice's `next` and a node's `next` may be a function of the context, and `DialogueReference` is
exported from `tellurion`. Task 1 checks that first.

## Global Constraints

- Only files under `apps/foam/` change. Nothing under `apps/somewhere/` or `packages/tellurion/`.
- Work on the current branch, `somewhere-update`. Commit at the end of each task with `git add` of
  the task's own paths; a message is one short imperative sentence, with no prefix and no trailer
  lines. Never use `git stash`. Commands run from `apps/foam` unless a step says otherwise.
- Code style: `let` for locals, `const` only at module level; relative imports end in `.js`;
  comments say why and stay within 100 columns; never remove a comment. Class members are sorted
  alphabetically within their group (lint rule `perfectionist/sort-classes`), and so are the keys
  of `NightScreenContents`: a new member goes where its name falls. Prettier formats (printWidth
  100, no bracket spacing, single quotes) and lint fails on a difference: run
  `npx prettier --write` on the task's files before lint.
- `exactOptionalPropertyTypes` is on: never set an optional field to `undefined`. Build an object
  with a field only when it has a value, and type a parameter that may be passed `undefined` as
  `?: T | undefined`.
- Tests: the `vitest` object, not `vi`; every `vitest.fn` takes a type parameter; a blank line
  separates a group of `expect` lines from other statements; `describe(fn, …)` when named after a
  function; no `expect` inside `beforeAll` or `beforeEach`; game modules are imported after
  `bootGame`, never at the top of a browser test (types only at the top); every browser test file
  mocks `content/pictures/barPicture.js` with `PROOF_PICTURE`; taps go through `tap`
  (`userEvent.click`); `console.warn` for anything a browser test must print.
- Every task's last step runs `npx vitest run`, `npm run typecheck` and
  `npx eslint source tests scripts`. Lint expectation: 0 errors; the known warnings of earlier
  phases may print.
- `core/script.ts`, `core/formatCosts.ts`, `core/night.ts` and `core/checkContent.ts` never import
  `core/game.ts`, directly or through a screen: the unit tests read them in Node.
- Exact values from the spec: the status line is `19:40   350 Kč   0.0` (three spaces between the
  parts, the level always with one decimal, `toFixed(1)`); `DRINKS_PER_HOUR = 1`; a choice's label
  is its text, two spaces, then the numbers two spaces apart in the order minutes, price, odds:
  `Order a beer  10 min  45 Kč`, `Take the spare chair  15 min  40%`; the odds are
  `Math.round(odds * 100)` with `%`; a price of 0 is left out of the numbers; a choice or a journey
  whose price is more than the money is greyed out, and a price equal to the money is affordable;
  the derived `onChoose` applies, in this order, the roll (from `odds` read now), the price, the
  minutes, the drinks, then the author's `onChoose`; `night.roll` is `{value, odds, won: value < odds}`;
  the checker's nights are at drunkenness `0`, `2` and `5` (`CHECK_LEVELS`), its rolls run from
  `0.00` to `0.99` in steps of `0.01`, and its lines are the ones written in Task 7.
- Stand-in content keeps the limits of the place files' header comment: every text written with
  `standIn`, no word longer than 16 characters, people have no names, every node sets `speaker`,
  italic marks come in pairs. Money changes only through `price`, never in an `onEnter`.

## Review Focus

- **A price equal to the money.** The spec allows it: the choice takes the press and the money
  reaches 0. Pinned in Task 5: the story window test opens the bartender with 45 Kč and finds the
  beer enabled.
- **A resize while a choice is greyed out.** The window builds its buttons again; the same one must
  come back disabled, and the focus must stay on the enabled one. Pinned in Task 5, in the same
  test, by a direct `resize`.
- **A later visit to a node after a drink.** The condition is read on entry, so a node that loops
  back to itself after a choice with `drinks` offers its conditioned choice on the second visit.
  Pinned in Task 4 (`tests/script.test.ts`).
- **Odds at or beyond the bounds in the running game.** The checker fails them in CI; the game must
  still behave: 1 or more always wins, 0 or less never. Pinned in Task 1 (`tests/night.test.ts`).
- **Enter at once on a travel window the night cannot pay.** "Back" has the focus, so the press
  closes the window with nothing picked and makes no journey. Pinned in Task 6.

## File Structure

| File (under `apps/foam/`)                                   | Responsibility                                                                   | Task |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- |
| `source/game/core/night.ts`                                 | `Roll`; `drunkenness`, `roll`, `random` on the night; `getDrunkenness`, `addDrinks`, `roll`; `stateOfMind` goes | 1 |
| `source/game/core/travel.ts`                                | `NightStart.drunkenness` (1); `formatJourney` goes (3)                           | 1, 3 |
| `source/game/core/getSceneArea.ts`                          | The `STATUS_ROOM` comment names the level                                        | 1    |
| `source/game/core/getJumpIn.ts`                             | The `drunkenness` parameter                                                      | 2    |
| `source/game/core/formatCosts.ts`                           | New. `formatCosts`                                                               | 3    |
| `source/game/core/script.ts`                                | New. `Choice`, `Node`, `Reference`, `Script`, `defineScript`, `asChoice`, `formatChoice` | 4 |
| `source/game/core/createWayOut.ts`                          | Returns a Foam `Script`                                                          | 4    |
| `source/game/screens/storyWindow.ts`                        | Labels through `formatChoice`; a choice the night cannot pay is disabled         | 5    |
| `source/game/screens/nightScreen.ts`                        | The status written from `onUpdate` (5); the night passed to the travel window (6) | 5, 6 |
| `tests/fixedWorld.ts`                                       | The beer's fields and a rolling choice (5); a cheaper taxi to the square (6)     | 5, 6 |
| `source/game/screens/travelWindow.ts`                       | `formatCosts` (3); takes the night, greys out the destination, the opening focus (6) | 3, 6 |
| `source/game/core/checkContent.ts`                          | Three nights per place, a function `next` followed, the new rules                | 7    |
| `source/game/content/places/*.ts`                           | `defineScript` and the stand-in content                                          | 8    |
| `docs/direction.md`, `docs/superpowers/specs/…-costs-design.md` | State that the spec is built                                                 | 9    |

---

### Task 1: The night: drunkenness, the roll and the status

**Files:**

- Modify: `source/game/core/night.ts`, `source/game/core/travel.ts:41-58` (`NightStart`),
  `source/game/core/getSceneArea.ts:42-46` (the `STATUS_ROOM` comment)
- Test: `tests/night.test.ts` (rewritten), `tests/getSceneArea.test.ts:49-54`,
  `tests/nightScreen.browser.test.ts:63,998-1015`, `tests/nightScreenPlaces.browser.test.ts:461,995`,
  `tests/jumpIn.browser.test.ts:53`

**Interfaces:**

- Consumes: `PlaceId`, `Way` as today.
- Produces, in `core/night.ts`, exactly as the spec's block "The night":
  `export type Roll = {value: number; odds: number; won: boolean}`; `Night` with
  `drunkenness: {level: number; at: number}`, `roll: Roll | null`, `random: () => number` and
  without `stateOfMind`; `export const DRINKS_PER_HOUR = 1`;
  `createNight(start: {place: PlaceId; minutes: number; money: number; drunkenness?: number}): Night`;
  `getDrunkenness(night: Night): number`; `addDrinks(night: Night, drinks: number): void`;
  `roll(night: Night, odds: number): void`; `formatStatus(night: Night): string`. In
  `core/travel.ts`, `NightStart` gains `drunkenness?: number` with the doc comment
  `/** The level of drunkenness the night starts at, in drinks; 0 when absent. */`.

Decisions the spec leaves to the plan:

- `getDrunkenness` is
  `Math.max(0, level - ((night.minutes - at) / 60) * DRINKS_PER_HOUR)`.
- `addDrinks` sets `night.drunkenness = {level: getDrunkenness(night) + drinks, at: night.minutes}`.
- `roll` reads `night.random()` once into `value` and sets `night.roll = {value, odds, won: value < odds}`.
- `createNight` keeps its spread-free shape: `drunkenness: {level: start.drunkenness ?? 0, at: start.minutes}`,
  `roll: null`, `random: Math.random`. The doc comment on `money` becomes
  `/** Money, in Kč. Never below 0. */`.
- `STATUS_ROOM` stays 24 (`TOP_ROW_WIDTH` and the narrow-screen tests rest on it); its comment
  becomes: the time (5), the money to four digits with a sign and " Kč" (8), the level of
  drunkenness with one decimal (5), and the two gaps of three spaces between them.

- [ ] **Step 1: Check that spec 1 is built**

Run (from the repository root):
`grep -n "export type DialogueReference" packages/tellurion/source/dialogue/DialogueScript.ts`
Expected: one line. If none, stop and report: the Tellurion plan runs first.

- [ ] **Step 2: Write the failing unit tests**

Rewrite `tests/night.test.ts` with `START = {place: 'zidenice', minutes: 1020, money: 350} as const`
and these tests (a night under test is `{...createNight(START), …}` or a `createNight` result that
the test mutates):

- `createNight returns the start's values, sober at the start's minutes, before any roll`:
  `toEqual({minutes: 1020, money: 350, place: 'zidenice', leaving: null, drunkenness: {level: 0, at: 1020}, roll: null, random: Math.random})`.
- `createNight starts at the given level`: `createNight({...START, drunkenness: 2.5}).drunkenness`
  is `{level: 2.5, at: 1020}`.
- `createNight returns a separate object on each call`: as today.
- `getDrunkenness falls one drink an hour and stops at 0`: at 1180 `addDrinks(night, 2)`; the level
  is `2` at 1180, `1.5` at 1210, `0` at 1300 and `0` at 1400.
- `addDrinks adds to the level now and moves the mark to now`: at 1180 `addDrinks(night, 2)` gives
  `{level: 2, at: 1180}`; at 1210 `addDrinks(night, 1)` gives `{level: 2.5, at: 1210}`; at 1400
  `addDrinks(night, 1)` gives `{level: 1, at: 1400}`.
- `roll writes the value, the odds and whether it won`: with `random: () => 0.25`, `roll(night, 0.4)`
  gives `{value: 0.25, odds: 0.4, won: true}` and `roll(night, 0.25)` gives
  `{value: 0.25, odds: 0.25, won: false}`.
- `odds of 1 or more always win and odds of 0 or less never`: with `random: () => 0.999`,
  `roll(night, 1)` wins; with `random: () => 0`, `roll(night, 0)` does not.
- `formatStatus shows the time, the money and the level with one decimal`: at 1180 →
  `'19:40   350 Kč   0.0'`; after `addDrinks(night, 1)` at 1180 and the clock at 1210 →
  `'20:10   350 Kč   0.5'`; `createNight({...START, drunkenness: 12.5})` → `'17:00   350 Kč   12.5'`.
- `formatStatus pads hours and minutes to two digits`: `{minutes: 545, money: 0}` →
  `'09:05   0 Kč   0.0'`.
- `formatStatus wraps past midnight`: `{minutes: 1470, money: 12}` → `'00:30   12 Kč   0.0'`;
  `{minutes: 1440, money: 12}` → `'00:00   12 Kč   0.0'`.

In `tests/getSceneArea.test.ts`, the last test becomes
`the status room holds the money to four digits with a sign and the level with one decimal`:
`createNight({place: 'train', minutes: 1020, money: -1350, drunkenness: 12.5})` formats to
`'17:00   -1350 Kč   12.5'`, and `formatStatus(night).length` is `toBeLessThanOrEqual(STATUS_ROOM)`.

Run: `npx vitest run --project unit tests/night.test.ts tests/getSceneArea.test.ts`
Expected: FAIL (no `addDrinks`, `getDrunkenness`, `roll`; `Sober` in the status).

- [ ] **Step 3: Implement the night**

As in Interfaces and the decisions above. `stateOfMind` goes from the type and from `createNight`.

- [ ] **Step 4: Bring the browser tests' status strings in line**

The level replaces `Sober` everywhere a status is read; nothing else in these tests changes yet:

- `tests/nightScreen.browser.test.ts`: `STARTING_STATUS = '19:40   350 Kč   0.0'`; in
  `an arrow key focuses the first choice, and Enter orders a beer`, the night after the beer is
  `{minutes: 1190, money: 305, place: FIXED_BAR, leaving: null, drunkenness: {level: 0, at: 1180}, roll: null, random: Math.random}`
  (the fixed world's beer still costs through its `onEnter` until Task 5) and the status after the
  window closes is `'19:50   305 Kč   0.0'`.
- `tests/nightScreenPlaces.browser.test.ts`: `'19:46   230 Kč   0.0'` and `'19:40   350 Kč   0.0'`.
- `tests/jumpIn.browser.test.ts`: `'23:10   120 Kč   0.0'`.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write source/game/core/night.ts source/game/core/travel.ts \
  source/game/core/getSceneArea.ts tests/night.test.ts tests/getSceneArea.test.ts \
  tests/nightScreen.browser.test.ts tests/nightScreenPlaces.browser.test.ts \
  tests/jumpIn.browser.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/core/night.ts source/game/core/travel.ts source/game/core/getSceneArea.ts \
  tests/night.test.ts tests/getSceneArea.test.ts tests/nightScreen.browser.test.ts \
  tests/nightScreenPlaces.browser.test.ts tests/jumpIn.browser.test.ts
git commit -m "Count the night's drunkenness in drinks and roll its dice"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 2: The jump-in's drunkenness

**Files:**

- Modify: `source/game/core/getJumpIn.ts`
- Test: `tests/getJumpIn.test.ts`, `tests/jumpIn.browser.test.ts`

**Interfaces:**

- Consumes: `NightStart.drunkenness` (Task 1). `source/routes/_index.tsx` needs no change: its
  `Object.assign(nightStart, jumpIn)` copies the new field, and the night screen's
  `createNight(nightStart)` reads it.
- Produces: `getJumpIn` returns
  `{place: PlaceId; minutes?: number; money?: number; drunkenness?: number} | null`. A
  `drunkenness` parameter matching `/^\d+(\.\d+)?$/` is read with `Number`; any other value is
  dropped with `` console.warn(`The jump-in ignores the drunkenness "${value}": it is not a number of drinks.`) ``,
  behind the same `eslint-disable-next-line no-console -- see above` as the others.

- [ ] **Step 1: Write the failing tests**

`tests/getJumpIn.test.ts`:

- The first test becomes `reads the place, the hour, the money and the drunkenness`:
  `'?place=rotorBar&time=23:10&money=120&drunkenness=2.5'` gives
  `{place: 'rotorBar', minutes: 1390, money: 120, drunkenness: 2.5}` with no warning.
- `reads the drunkenness without a decimal part`: `'?place=rotorBar&drunkenness=2'` gives
  `drunkenness` `2`.
- `test.each(['-1', '2,5', '.5', 'abc'])('drops the drunkenness %s with a warning', …)`: the result
  is `{place: 'rotorBar'}`, has no `drunkenness` property, and `warn` was called once.

`tests/jumpIn.browser.test.ts`: `beforeAll` also sets `url.searchParams.set('drunkenness', '2.5')`;
the test expects `'23:10   120 Kč   2.5'`; `afterAll` adds `delete nightStart.drunkenness;` after
`Object.assign(nightStart, oldStart)`, with the comment extended: the level is not part of the
game's own start, so it is removed rather than put back.

Run: `npx vitest run --project unit tests/getJumpIn.test.ts`
Expected: FAIL (no `drunkenness` in the result).

- [ ] **Step 2: Implement**

As in Interfaces, after the money block, with a module-level `DRUNKENNESS_FORM`.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/getJumpIn.ts tests/getJumpIn.test.ts tests/jumpIn.browser.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/core/getJumpIn.ts tests/getJumpIn.test.ts tests/jumpIn.browser.test.ts
git commit -m "Read the level of drunkenness from the jump-in"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 3: One formatting of a choice's and a journey's numbers

**Files:**

- Create: `source/game/core/formatCosts.ts`
- Modify: `source/game/core/travel.ts:87-92` (`formatJourney` goes),
  `source/game/screens/travelWindow.ts:29-36,173` (imports `formatCosts`)
- Test: `tests/formatCosts.test.ts` (new), `tests/travel.test.ts:89-96` (the `formatJourney`
  describe and import go)

**Interfaces:**

- Consumes: `Destination` (`minutes`, `price`).
- Produces:
  `export function formatCosts(costs: {minutes?: number | undefined; price?: number | undefined; odds?: number | undefined}): string`
  with the doc comment
  `/** "10 min  45 Kč  60%": the numbers that are there, two spaces apart. A price of 0 is left out. */`.
  Minutes are shown when defined (`${minutes} min`), a price when defined and above 0
  (`${price} Kč`), odds when defined (`${Math.round(odds * 100)}%`), joined with two spaces; no
  numbers give `''`. The travel window's `getDestinationLabel` calls `formatCosts(destination)`.

- [ ] **Step 1: Write the failing tests**

`tests/formatCosts.test.ts`, `describe(formatCosts, …)`:

- `gives each number alone`: `{minutes: 10}` → `'10 min'`; `{price: 45}` → `'45 Kč'`;
  `{odds: 0.6}` → `'60%'`.
- `gives the numbers together, in the order minutes, price, odds`: `{minutes: 15, price: 90, odds: 0.4}`
  → `'15 min  90 Kč  40%'`; `{minutes: 11, price: 170}` → `'11 min  170 Kč'`.
- `leaves a price of 0 out, and gives nothing for no numbers`: `{minutes: 35, price: 0}` →
  `'35 min'`; `{}` → `''`.
- `rounds the odds to a whole percentage`: `{odds: 0.666}` → `'67%'`; `{odds: 0.333}` → `'33%'`.

Remove the `formatJourney` describe from `tests/travel.test.ts` and its import.

Run: `npx vitest run --project unit tests/formatCosts.test.ts tests/travel.test.ts`
Expected: the new file FAILS (module not found); `travel.test.ts` passes.

- [ ] **Step 2: Implement and switch the travel window over**

`formatCosts.ts` imports nothing. In `travel.ts` the function and its comment go. In
`travelWindow.ts`, `formatJourney` leaves the import from `../core/travel.js`, `formatCosts` is
imported from `../core/formatCosts.js`, and `getDestinationLabel` calls `formatCosts(destination)`.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/formatCosts.ts source/game/core/travel.ts \
  source/game/screens/travelWindow.ts tests/formatCosts.test.ts tests/travel.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/core/formatCosts.ts source/game/core/travel.ts \
  source/game/screens/travelWindow.ts tests/formatCosts.test.ts tests/travel.test.ts
git commit -m "Format the numbers of a choice and a journey alike"
```

Expected: both projects PASS (the travel window's labels read as before); typecheck 0; eslint 0
errors.

### Task 4: Foam's script: the choice with its fields

**Files:**

- Create: `source/game/core/script.ts`
- Modify: `source/game/core/createWayOut.ts`
- Test: `tests/script.test.ts` (new); `tests/createWayOut.test.ts` needs no change

**Interfaces:**

- Consumes: `DialogueChoice`, `DialogueNode` from `tellurion`; `Night`, `getDrunkenness`,
  `addDrinks`, `roll` (Task 1); `formatCosts` (Task 3).
- Produces, in `core/script.ts`, exactly the spec's block "The choice": `Choice<TNodeId>`,
  `Node<TNodeId>`, `Reference<TNodeId>`, `Script<TNodeId>`, with the spec's doc comments;
  `defineScript<TNodeId extends string>(script: {start: Reference<NoInfer<TNodeId>>; nodes?: Record<TNodeId, Node<NoInfer<TNodeId>>>}): Script<TNodeId>`;
  `asChoice(choice: DialogueChoice<Night, string>): Choice<string>`;
  `formatChoice(choice: Choice<string>, night: Night): string`. `createWayOut` returns
  `Script<string>`, built with `defineScript`; its choices, `leaveBy` and `WayOutOptions` do not
  change. The story window (Task 5), the checker (Task 7), the content (Task 8) and the fixed world
  (Task 5) use these.

Decisions the spec leaves to the plan:

- `asChoice` returns its argument: Tellurion's choice is structurally a Foam choice without the
  fields, so the body is `return choice;` with no cast; the function is the one place where the
  runner's choice is read as Foam's.
- `formatChoice` reads a function `odds` with the night, calls
  `formatCosts({minutes, price, odds})` and returns the text alone when that is `''`, else
  `` `${text}  ${costs}` ``.
- `defineScript` maps with three functions over `Node<string>`, `Choice<string>` and
  `Reference<string>`, and casts the result to `Script<TNodeId>` once, at the return. A
  `WeakMap<object, Node<string>>` holds each mapped node under the author's object and under the
  mapped object itself, so a node reached twice, or a mapped node handed back by a function, is one
  node:

```
mapReference(r): a string → r; a function → (night) => mapReference(r(night)); an object → mapNode(r)
mapNode(n): the map's entry for n, or else: m = {...n}; set n → m and m → m in the map;
            m.choices = n.choices.map(mapChoice) when n has choices;
            m.next = mapReference(n.next) when n has next; m
mapChoice(c): m = {...c}; m.next = mapReference(c.next) when c has next;
            m.isVisible, when c has drunkenness or isVisible: (night) =>
              the level getDrunkenness(night) is >= min when min is set, <= max when max is set,
              and then c.isVisible?.(night) ?? true;
            m.onChoose, when c has odds, price, minutes, drinks or onChoose: (night) =>
              roll(night, odds read now) when odds; night.money -= price when price;
              night.minutes += minutes when minutes; addDrinks(night, drinks) when drinks;
              c.onChoose?.(night)
return {start: mapReference(script.start)} with nodes mapped through Object.fromEntries when given
```

- [ ] **Step 1: Write the failing tests**

`tests/script.test.ts`, run through `Dialogue` from `tellurion`, with a night from
`createNight({place: 'rotorBar', minutes: 1180, money: 350})` unless said otherwise.

`describe(defineScript, …)`:

```ts
test('the press rolls, takes the price, moves the clock and adds the drinks, then calls onChoose', () => {
  let night = createNight({place: 'rotorBar', minutes: 1180, money: 350});
  let seen: Array<[number, number]> = [];
  let onChoose = vitest.fn<(night: Night) => void>((current) => {
    seen.push([current.money, current.minutes]);
  });

  night.random = () => {
    seen.push([night.money, night.minutes]);

    return 0.2;
  };

  let script = defineScript({
    start: {
      text: 'Q',
      choices: [
        {text: 'Beer', price: 45, minutes: 10, drinks: 1, odds: 0.6, onChoose, next: {text: 'Done'}},
      ],
    },
  });
  let dialogue = new Dialogue({script, context: night});

  dialogue.advance();
  dialogue.choose(0);

  // The roll saw the night untouched; onChoose saw it with everything applied.
  expect(seen).toEqual([
    [350, 1180],
    [305, 1190],
  ]);
  expect(night.roll).toEqual({value: 0.2, odds: 0.6, won: true});
  expect(night.drunkenness).toEqual({level: 1, at: 1190});
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(night);
  expect(dialogue.pageText).toBe('Done');
});
```

- `an odds function is read before the drinks are added`: a choice with
  `odds: (night) => (getDrunkenness(night) >= 1 ? 0.9 : 0.1)` and `drinks: 1`, `random: () => 0.5`:
  `night.roll` is `{value: 0.5, odds: 0.1, won: false}`.
- `a function next reads the roll the press made`: `odds: 0.6`,
  `next: ({roll}) => (roll?.won ? 'won' : 'lost')` with nodes `won` and `lost`; `random: () => 0.2`
  enters `won` and `random: () => 0.9` (a new dialogue) enters `lost`.
- `a condition's bounds are inclusive, an absent bound is ignored, and isVisible is combined with it`:
  one node with the choices `{text: 'min', drunkenness: {min: 2}}`, `{text: 'max', drunkenness: {max: 2}}`,
  `{text: 'both', drunkenness: {min: 1, max: 3}}`,
  `{text: 'and', drunkenness: {min: 2}, isVisible: (night) => night.money > 100}`, `{text: 'free'}`;
  `visibleChoices.map((choice) => choice.text)` is `['min', 'max', 'both', 'and', 'free']` at
  level 2 with 350 Kč, `['min', 'max', 'both', 'free']` at level 2 with 50 Kč, `['max', 'free']` at
  level 0, and `['min', 'and', 'free']` at level 5 with 350 Kč.
- `a later visit after a drink offers the conditioned choice`: node `q` with
  `{text: 'Drink', drinks: 2, next: 'q'}` and `{text: 'Smoke', drunkenness: {min: 2}}`; on entry
  the visible texts are `['Drink']`; after `choose(0)` and the page's `advance`, on the second
  visit they are `['Drink', 'Smoke']`.
- `a choice with no fields keeps no derived function`: for `nodes: {q: {text: 'Q', choices: [{text: 'A'}]}}`,
  `script.nodes?.q.choices?.[0]` has no `isVisible` and no `onChoose` property
  (`not.toHaveProperty`).
- `inline nodes and nodes returned by a function start or next are mapped, once each`:
  - `start: () => inline` with `inline = {text: 'S', choices: [{text: 'x', price: 5}]}`: after
    `new Dialogue`, `dialogue.node` is not `inline`, its first choice's `onChoose` is a function,
    and `script.start` called twice with the night returns the same object.
  - `next: () => 'b'` from `a` to `b` with a priced choice: after `choose(0)`, `dialogue.node` is
    `script.nodes?.b` and its first choice's `onChoose` is a function.
  - an inline `next: {text: 'B', choices: [{text: 'x', price: 5}]}` on a choice: after `choose(0)`,
    the node's first choice's `onChoose` is a function.
- `a dangling id is a compile error, in a fixed next and in a function next`: two fixtures as in
  Tellurion's `tests/dialogueScript.test.ts`, with `// @ts-expect-error -- …` directly above
  `next: 'missing'` and above `next: () => 'missing'` (each on one line), and the `expect` lines
  `dangling.start` is `'a'` and `danglingFunction.nodes?.a.next` is `toBeTypeOf('function')`.

`describe(asChoice, …)`: `returns its argument`: `let choice = {text: 'A'};`
`expect(asChoice(choice)).toBe(choice)`.

`describe(formatChoice, …)`:

- `gives the text alone`: `{text: 'Not now'}` → `'Not now'`.
- `gives the text with each number`: `{text: 'Order a beer', minutes: 10}` → `'Order a beer  10 min'`;
  `{text: 'Order a beer', price: 45}` → `'Order a beer  45 Kč'`;
  `{text: 'Search for the phone', odds: 0.6}` → `'Search for the phone  60%'`.
- `gives the three together in order, with a function odds read from the night`:
  `{text: 'Take the spare chair', minutes: 15, price: 20, odds: (night) => (getDrunkenness(night) >= 2 ? 0.7 : 0.4)}`
  → `'Take the spare chair  15 min  20 Kč  40%'` sober and `'… 70%'` with
  `createNight({…, drunkenness: 2})`.

Run: `npx vitest run --project unit tests/script.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement `script.ts` and `createWayOut`**

As in Interfaces and the decisions. In `createWayOut.ts` the `tellurion` import goes; `Script` is
imported from `./script.js`.

- [ ] **Step 3: Run the tests and prove the type fixtures**

Run: `npx vitest run --project unit tests/script.test.ts tests/createWayOut.test.ts && npm run typecheck`
Expected: PASS; typecheck exits 0.

Then change the function fixture's `() => 'missing'` to `() => 'a'` and run `npm run typecheck`.
Expected: FAIL with TS2578 "Unused '@ts-expect-error' directive." on that fixture. Change it back;
the typecheck exits 0 again.

- [ ] **Step 4: Check and commit**

```bash
npx prettier --write source/game/core/script.ts source/game/core/createWayOut.ts tests/script.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/core/script.ts source/game/core/createWayOut.ts tests/script.test.ts
git commit -m "Define Foam's scripts with prices, minutes, drinks, odds and conditions"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 5: The story window shows the numbers, greys out what the night cannot pay, and the status follows

**Files:**

- Modify: `source/game/screens/storyWindow.ts:121-137,180-185,369-405,535-571`,
  `source/game/screens/nightScreen.ts:44-96,132-137,229-258,376-416,420-460,529-591,632-689`
- Modify: `tests/fixedWorld.ts:44-65,126-143`
- Test: `tests/nightScreen.browser.test.ts`, `tests/nightScreenNarrow.browser.test.ts:265-268`,
  `tests/nightScreenPlaces.browser.test.ts:451-486`

**Interfaces:**

- Consumes: `asChoice`, `Choice`, `formatChoice`, `defineScript` (Task 4); `formatStatus` (Task 1).
- Produces: the window keeps the night as `readonly #night: Night` and the visible choices as
  `#choices: Array<Choice<string>>` beside `#choiceLabels`; `StoryWindowOptions` does not change.
  `NightScreenContents` gains `status: string`, documented
  `/** The status line's text, as last written. */`, `''` at attach.

The story window:

- `#showNode`: `this.#choices = visibleChoices.map(asChoice)` and each label is
  `wrapText(formatChoice(choice, this.#night), this.#labelWidth, measureLabel)`.
- `#buildChoices`: the button for index `i` is built as today and then
  `disable()`d when `(this.#choices[i]?.price ?? 0) > this.#night.money`. Nothing else: Tellurion's
  disabled button draws the theme's disabled look, takes no tap (the tap reaches the press surface,
  which does nothing while the runner is choosing) and is not focusable, and a resize goes through
  `#showNode` and `#buildChoices` again.

The night screen:

- `writeStatus` returns at once when `formatStatus(night)` equals `contents.status`; otherwise it
  records the text in `contents.status`, sets it and the width as today.
- `onUpdate` calls `writeStatus(screen)` right after `storyWindow?.update(ticker.deltaMS)`, so a
  press, an `onEnter`, a journey and the first frame show at once. The calls in `showPlace`, in
  `openStory`'s `onClosed` and in `openTravel`'s `onClosed` go, with their comment lines where they
  only speak of the status; the call in `onShow` stays.

The fixed world (`tests/fixedWorld.ts`):

- `bartender` is built with `defineScript`; the beer's choice is
  `{text: 'Order a beer', price: 45, minutes: 10, drinks: 1, next: 'beer'}` and the `beer` node
  loses its `onEnter`.
- `door` is built with `defineScript`; its choices are `Step outside` (as today), then
  `{text: 'Knock on the glass', minutes: 5, odds: 0.6, next: ({roll}) => (roll?.won ? 'answered' : 'unanswered')}`,
  then `Stay`. Two new nodes, speaker `DOOR`: `answered`,
  `'Somebody on the pavement turns at the sound, grins and knocks back.'`; `unanswered`,
  `'Nobody turns. The glass hums a little under your knuckles and then is still.'`.
- The other scripts stay as they are. The `tellurion` import stays for them.

- [ ] **Step 1: Write the failing browser tests**

`tests/nightScreen.browser.test.ts`:

- A constant `BEER_LABEL = 'Order a beer  10 min  45 Kč'` replaces `'Order a beer'` in every
  expectation of a label or a focus (lines 507, 557, 576, 993, 1181).
- In `an arrow key focuses the first choice, and Enter orders a beer`: after the press, the night
  is `{minutes: 1190, money: 305, place: FIXED_BAR, leaving: null, drunkenness: {level: 1, at: 1190}, roll: null, random: Math.random}`
  and the status reads `'19:50   305 Kč   1.0'` at once, while the window is still open; the
  comment `The status behind the window follows when the window closes.` becomes
  `The status changes while the window is still open.`; after the window has closed it still reads
  `'19:50   305 Kč   1.0'`, and the comment on that check says the focus returns.
- New, after that test:
  `a choice the night cannot pay is greyed out, takes no tap and the arrows skip it`: with the
  night's money set to 45 the bartender's window shows the beer enabled after Enter
  (`getWindowButton(…, 0).isDisabled` is false); `clearScene()`; with the money set to 40 the beer
  reads `BEER_LABEL` and is disabled, `Leave her alone` is not; `ArrowDown` focuses
  `Leave her alone`; `storyWindow.resize(getSceneArea(480, 270))` builds the buttons again with the
  beer disabled and the focus still on `Leave her alone`; after `waitForChoices`, a `tap` on the
  beer's box leaves the runner choosing and the night as it was (a spread copy taken before the
  tap, `toEqual`). The money is put back in a `finally`.
- New, after it: `a rolling choice enters the node of its outcome`: with `night.random` set to
  `() => 0.2`, open `The door`, Enter, and the second button reads
  `'Knock on the glass  5 min  60%'`; focus it and Enter: `night.roll` is
  `{value: 0.2, odds: 0.6, won: true}` and `storyWindow.dialogue.node` is the door script's
  `nodes?.answered` (the script is `sampleBar.spots.find((spot) => spot.label === 'The door')?.script`);
  `clearScene()`, then the same with `() => 0.9` lands on `nodes?.unanswered` with
  `won: false`. `night.random` is put back to `Math.random` in a `finally`.

`tests/nightScreenNarrow.browser.test.ts`, in `taps open a window, finish its text and take a choice`:
the door's buttons read `['Step outside', 'Knock on the\nglass  5 min  60%', 'Stay']`: the label
wraps at 102 art pixels, 17 characters of 6, and `wrapText` keeps the two spaces, so the second
line is exactly 17 characters.

`tests/nightScreenPlaces.browser.test.ts`, in `a journey, from the door to the arrival`: the status
check `'19:46   230 Kč   0.0'` moves inside a `vitest.waitFor` (timeout 10 000), as the box check
below it is: the screen writes the status in the frame after the journey.

Run:
`npx vitest run --project browser tests/nightScreen.browser.test.ts tests/nightScreenNarrow.browser.test.ts tests/nightScreenPlaces.browser.test.ts`
Expected: FAIL on the labels (`Order a beer`), on the status while the window is open, and on the
door's buttons.

- [ ] **Step 2: Implement the fixed world, the window and the screen**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/storyWindow.ts source/game/screens/nightScreen.ts \
  tests/fixedWorld.ts tests/nightScreen.browser.test.ts tests/nightScreenNarrow.browser.test.ts \
  tests/nightScreenPlaces.browser.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/storyWindow.ts source/game/screens/nightScreen.ts tests/fixedWorld.ts \
  tests/nightScreen.browser.test.ts tests/nightScreenNarrow.browser.test.ts \
  tests/nightScreenPlaces.browser.test.ts
git commit -m "Show a choice's numbers, grey out what the night cannot pay and keep the status current"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 6: The travel window greys out a journey the night cannot pay

**Files:**

- Modify: `source/game/screens/travelWindow.ts:40-69,205-308,482-506,618-638`,
  `source/game/screens/nightScreen.ts:420-460` (`openTravel`), `tests/fixedWorld.ts:279-282`
- Test: `tests/travelWindow.browser.test.ts`

**Interfaces:**

- Consumes: `Night` (Task 1); `Button.isDisabled`, `enable`, `disable`.
- Produces: `TravelWindowOptions.night: Night`, documented
  `/** The night, read for its money: a destination that costs more is greyed out. */`; the window
  keeps it as `readonly #night: Night`. The night screen's `openTravel` passes
  `night: screen.contents.night`. In the fixed world, the taxi from the stop to the square costs
  `60` (`{minutes: 5, price: 60}`); the bar's stays `90`.

The window:

- A private `#showAffordable(button: Button, destination: Destination): void` calls
  `button.disable()` when `destination.price > this.#night.money` and `button.enable()` otherwise.
  `#createDestination` calls it on the button it built; `#showSelection`'s branch that only changes
  the texts calls it after `setDestinationLabel`. The button is never built again for that.
- The modal's `initialFocus` is the destination button when there is one and it is not disabled,
  else `back`.

- [ ] **Step 1: Write the failing browser tests**

`tests/travelWindow.browser.test.ts`:

- `openTravel` gains the option `night = harness.nightScreen.contents.night` and passes it.
- The header comment and `real taps select a place, switch the way and travel` say the square's
  taxi costs 60 Kč (`price: 60` in the `onClosed` expectation).
- New, after `a way with no destination opens with the focus on Back`:
  `a destination the night cannot pay is greyed out, and the window opens on Back`: with
  `night = {...harness.nightScreen.contents.night, money: 70}`, open `taxi`: the destination reads
  `['The bar', '5 min  90 Kč']`, its button `isDisabled`, `describeTravelFocus` is `'Back'` and the
  ring shows; after `waitForPanel(opened, WIDE_WINDOW)` take the button's box; focus the square's
  place button and `ui.activate()`: the destination reads
  `['The square by the\nold market', '5 min  60 Kč']`, the same button (`toBe`) is enabled; the
  bar's place button again: disabled; after `nextFrame`, its box equals the one taken. Then a second
  window on `taxi` with the same night: `press('Enter')` at once, `waitForClosed`, and `onClosed`
  was called exactly once with `null`.

Run: `npx vitest run --project browser tests/travelWindow.browser.test.ts`
Expected: FAIL (no `night` option; the destination enabled; the focus on it).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/travelWindow.ts source/game/screens/nightScreen.ts \
  tests/fixedWorld.ts tests/travelWindow.browser.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/travelWindow.ts source/game/screens/nightScreen.ts tests/fixedWorld.ts \
  tests/travelWindow.browser.test.ts
git commit -m "Grey out a journey the night cannot pay"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 7: The checker reads the fields, follows a function next and demands a free way out

**Files:**

- Modify: `source/game/core/checkContent.ts`
- Test: `tests/checkContent.test.ts`; `tests/content.test.ts` must still give `[]`

**Interfaces:**

- Consumes: `asChoice`, `Choice`, `defineScript` (Task 4); `createNight`, `getDrunkenness`, `roll`
  (Task 1).
- Produces: `checkContent(content: Content): string[]` as today, with
  `const CHECK_LEVELS = [0, 2, 5]` beside `CHECK_MINUTES` and `CHECK_MONEY`, and the lines below.
  The doc comment says a text, a start, an odds or a next that is a function is called with each
  check night: once per place and level.

The structure, which replaces the per-night loop:

- `checkScript(name, script)`: for each place id, `nights` is one `createNight` per level of
  `CHECK_LEVELS`. Every node of `nodes` is checked with `checkNode(path, node, nights)`. A fixed
  inline `start` is checked with `nights`; a function `start` is called with each night, and an
  object it returns is checked with `[night]`.
- `checkNode(path, node, nights)`: the speaker as today; the pages of `text` for each night (a
  function is called with it), with the marks and the words as today; the choices' words as today;
  for each choice, `choice = asChoice(…)`, `where = `${path}${SEPARATOR}"${choice.text}"``:
  - `price`, `minutes`, `drinks`: when defined and not a whole number above 0,
    `` `${where}: ${field} is ${value}` `` with `; leave it out` appended when the value is 0.
  - `odds`: a number is checked once, a function once per night with its result; a value not above
    0 and below 1 gives `` `${where}: odds is ${value}` ``.
  - `drunkenness`: neither bound → `` `${where}: drunkenness names neither min nor max` ``; a bound
    below 0 → `` `${where}: drunkenness has min -1` `` (and `max`); `min` above `max` →
    `` `${where}: drunkenness has min 3 above max 2` ``.
  - `next` an object: `checkNode(where, next, nights)` as today. A function: for each night, with
    `odds` (read as that night reads it) the checker sets `night.random = () => value` and calls
    `roll(night, odds)` for each value `0.00` to `0.99` in steps of `0.01`, following after each;
    without `odds` it sets `night.roll = null` and follows once.
  - The node's own `next`: an object as today; a function is followed once per night with
    `night.roll` set to `null`.
  - The way out, when the node has choices: a choice is free when it has no `price`, `minutes` or
    `drinks`, and offered when `choice.isVisible?.(night) ?? true` on every night; with no free
    offered choice, `` `${path}: no way out that costs nothing` ``.
- `follow(where, next, night)` with `where` ending in `${SEPARATOR}next`: calls `next(night)` in a
  `try`; an error gives
  `` `${where}: throws "${error instanceof Error ? error.message : String(error)}"` ``; an id the
  script's `nodes` lacks gives `` `${where}: returns "${id}", which is not a node` ``; an id it has
  is not checked again (the node is checked under its own key); an object is checked with
  `checkNode(where, node, [night])`.

- [ ] **Step 1: Write the failing tests**

`tests/checkContent.test.ts` imports `defineScript` from `../source/game/core/script.js` and
`getDrunkenness` from `../source/game/core/night.js`. The fixtures of the new tests are built with
`defineScript`; one that returns an id the script lacks is built with `defineScript<string>`, the
untyped escape hatch, so that it compiles. Each new test puts its script in `withZidenice({description})`
and reads `check(…)`.

- `reports a price, minutes or drinks that is not a whole number above 0`: choices
  `{text: 'Order a beer', price: 0}`, `{text: 'Wait', minutes: 2.5}`, `{text: 'Drink', drinks: -1}`,
  `{text: 'Go'}` on the start node, speaker `Bench`: the lines contain
  `'zidenice › description › start › "Order a beer": price is 0; leave it out'`,
  `'zidenice › description › start › "Wait": minutes is 2.5'` and
  `'zidenice › description › start › "Drink": drinks is -1'`.
- `reports odds that are not above 0 and below 1, as a number and as a function's result`:
  `{text: 'Try', odds: 1}`, `{text: 'Try again', odds: (night) => (getDrunkenness(night) >= 5 ? 0 : 0.5)}`,
  `{text: 'Go'}`: the lines contain `'zidenice › description › start › "Try": odds is 1'` and
  `'zidenice › description › start › "Try again": odds is 0'`, the latter once.
- `reports a drunkenness condition with no bound, a bound below 0 or min above max`:
  `{text: 'A', drunkenness: {}}`, `{text: 'B', drunkenness: {min: -1}}`,
  `{text: 'C', drunkenness: {min: 3, max: 2}}`, `{text: 'Go'}`: the lines contain
  `'… › "A": drunkenness names neither min nor max'`, `'… › "B": drunkenness has min -1'` and
  `'… › "C": drunkenness has min 3 above max 2'` (each with the full prefix
  `zidenice › description › start`).
- `follows a function next with every roll and with no roll, and reports an id the script lacks`:
  `defineScript<string>` with `start: 'a'`; `a` (speaker `Bench`) has the choices
  `{text: 'Try', odds: 0.5, next: ({roll}) => (roll?.won ? 'b' : (roll?.value ?? 0) > 0.98 ? 'missing' : 'a')}`,
  `{text: 'Sure', next: ({roll}) => (roll === null ? 'b' : 'missing')}` and `{text: 'Go'}`; `b`
  (speaker `Bench`, text `'Fine.'`) has `next: (night) => (night.roll === null ? 'a' : 'missing')`.
  The lines contain
  `'zidenice › description › a › "Try" › next: returns "missing", which is not a node'`, and no
  line contains `"Sure"` or `› b › next`.
- `reports a function next that throws, on a choice and on a node`: `a` with
  `{text: 'Try', next: () => { throw new Error('No way.'); }}` and `{text: 'Go'}`; `b` with the same
  thrower as its `next`: the lines contain
  `'zidenice › description › a › "Try" › next: throws "No way."'` and
  `'zidenice › description › b › next: throws "No way."'`.
- `reports a node whose choices have no way out that costs nothing on every check night`: three
  descriptions of one start node (speaker `Bench`): `paid` with `{text: 'Pay', price: 10}`,
  `{text: 'Wait', minutes: 5}`, `{text: 'Drink', drinks: 1}`; `hidden` with `{text: 'Pay', price: 10}`,
  `{text: 'Go', drunkenness: {min: 2}}`, `{text: 'Leave', isVisible: (night) => getDrunkenness(night) < 5}`;
  `free` with `{text: 'Pay', price: 10}`, `{text: 'Try', odds: 0.5}`. The line
  `'zidenice › description › start: no way out that costs nothing'` is reported for `paid` and
  `hidden` and not for `free`.
- The existing test becomes `calls a text function once per place and level and reports its fault once`
  with `toHaveBeenCalledTimes(12)`.
- `a text that reads the level is checked sober, tipsy and drunk`:
  `text: (night) => (getDrunkenness(night) >= 5 ? 'A supercalifragilistic word.' : 'Fine.')` on a
  `Bench` start node: the long-word line of the existing test is reported.

Run: `npx vitest run --project unit tests/checkContent.test.ts tests/content.test.ts`
Expected: the new tests FAIL (no lines); `gives no line for good content` and `content.test.ts`
pass.

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/checkContent.ts tests/checkContent.test.ts
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/core/checkContent.ts tests/checkContent.test.ts
git commit -m "Check the choice fields, follow a function next and demand a free way out"
```

Expected: both projects PASS (the game's content has a free choice on every node already);
typecheck 0; eslint 0 errors.

### Task 8: The stand-in content

**Files:**

- Modify: `source/game/content/places/train.ts`, `rotorBar.ts`, `whiskyShop.ts`,
  `namestiRepubliky.ts`; `hlavniNadrazi.ts`, `malinovskehoNamesti.ts`, `zidenice.ts` only switch
  to `defineScript`
- Test: `tests/content.test.ts` (unchanged; it is the check)

**Interfaces:**

- Consumes: `defineScript` (Task 4), `getDrunkenness` (Task 1), `createWayOut`, `standIn`.
- Produces: every `defineDialogueScript<Night>()(` in a place file becomes `defineScript(`; the
  `tellurion` import and the then unused `Night` type import go. `content/journeys.ts` does not
  change.

The content, in the spec's table; the texts below are the stand-in, written with `standIn` and
wrapped as the files wrap today. Every new choice without a `next` ends the window.

- **The train, the door:** the choices become
  `{text: 'Get off at Brno-Židenice', minutes: 4, next: 'zidenice'}` and
  `{text: 'Ride on to the main station', minutes: 9, next: 'hlavniNadrazi'}`; the two nodes'
  `onEnter` only set `night.place`.
- **Rotor Bar, the bar:** as the spec's example: the node's text is
  `The bartender nods at the taps.`, the choices
  `{text: 'Order a beer', price: 45, minutes: 10, drinks: 1, next: 'beer'}` and `{text: 'Not now'}`,
  and the `beer` node loses its `onEnter`.
- **Rotor Bar, the corner table:** `start: 'table'`; `table` keeps its text and gains the choices
  `{text: 'Take the spare chair', minutes: 15, odds: (night) => (getDrunkenness(night) >= 2 ? 0.7 : 0.4), next: ({roll}) => (roll?.won ? 'welcomed' : (roll?.value ?? 0) > 0.9 ? 'spilled' : 'brushedOff')}`
  and `{text: 'Leave them to it'}`. Speaker `TABLE` on the three nodes. `welcomed`:
  `Somebody moves a coat off the chair, and the talk opens up to let you in. A quarter of an hour goes by before anyone asks your name.`
  `brushedOff`:
  `The nearest of them puts a hand on the chair before you reach it. Somebody is coming back, apparently. You stand there a while anyway.`
  `spilled`, with `onEnter: (night) => { night.minutes += 10; }`:
  `The chair catches a glass on its way out, and the glass goes over. Everybody looks at you while somebody fetches a cloth, and the cleaning up takes a while longer.`
- **Rotor Bar, the smokers:** `start: 'smokers'`; `smokers` keeps its text and gains
  `{text: 'Ask for a cigarette', minutes: 5, drunkenness: {min: 2}, next: 'cigarette'}` and
  `{text: 'Go back in'}`. `cigarette`, speaker `SMOKERS`:
  `The cigarette comes with a story about a tram that stopped running early, and the five minutes go by in smoke.`
- **The Whisky Shop Brno, the shelves:** the text loses its second sentence:
  `Sixty bottles stand open for tasting, each with a small card in a careful hand.` The choices are
  `{text: 'Pour a dram', price: 90, minutes: 15, drinks: 1, next: 'dram'}`,
  `{text: 'Pour the good one', price: 180, minutes: 15, drinks: 1, next: 'goodOne'}` and
  `{text: 'Not now'}`; `dram` loses its `onEnter`; `goodOne`, speaker `SHELVES`:
  `The good one is older than some of the regulars, and it takes its time on the tongue. The shopkeeper watches your face and says nothing.`
- **The Whisky Shop Brno, two regulars:** `start: 'regulars'`; `regulars` keeps its text and gains
  `{text: 'Ask about the bottle', minutes: 5, drunkenness: {max: 1}, next: 'bottle'}` and
  `{text: 'Let them be'}`: drunker than one drink, the scene offers only the way out. `bottle`,
  speaker `REGULARS`:
  `The one with the bottle says where it came from, and the other says how long it has been waiting. Neither of them says what the occasion is.`
- **Náměstí Republiky, the shelter:** `start: 'shelter'`; `shelter` keeps its text and gains
  `{text: 'Ask when the next tram goes', minutes: 5, odds: 0.6, next: ({roll}) => (roll?.won ? 'knows' : 'shrugs')}`
  and `{text: 'Wait in silence'}`. Speaker `SHELTER` on both: `knows`,
  `They know the line and the minute, and they tell you both without looking up from the rails.`
  `shrugs`, `They shrug. The display has been wrong all evening, and they stopped believing it an hour ago.`

- [ ] **Step 1: Write the content**

As above. Then run: `npx vitest run --project unit tests/content.test.ts tests/listStandIns.test.ts`
Expected: PASS. A line from the checker names what to fix in the content, not in the checker.

- [ ] **Step 2: List the stand-ins**

Run: `node scripts/list-stand-ins.mjs`
Expected: the table prints, with higher stand-in counts for `rotorBar.ts`, `whiskyShop.ts` and
`namestiRepubliky.ts` than before.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/content/places
npx vitest run
npm run typecheck
npx eslint source tests scripts
git add source/game/content/places
git commit -m "Give the stand-in content its costs, odds and conditions"
```

Expected: both projects PASS; typecheck 0; eslint 0 errors.

### Task 9: Whole check and hand-over

**Files:** `docs/direction.md`, `docs/superpowers/specs/2026-10-09-actions-with-costs-design.md`.

- [ ] **Step 1: Run everything**

From the repository root:
`npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1`
Expected: every task succeeds. Then, with `<base>` the commit that built spec 1
(`git log --oneline -1 -- packages/tellurion/source/dialogue/Dialogue.ts`),
`git diff --stat <base> -- apps/somewhere packages/tellurion` prints nothing.

- [ ] **Step 2: State that the spec is built**

- `docs/direction.md`: in the phase 5 list, item 2 ends "It is built:" with links to the spec and
  to this plan, as item 1 of phase 4 does. Read the document for any other sentence that still
  speaks of a cost inside a function or of a state of mind in words, and make it state the fields
  and the level in drinks.
- The spec's status: "implemented by
  [2026-10-09-actions-with-costs.md](../plans/2026-10-09-actions-with-costs.md)".

```bash
git add docs/direction.md docs/superpowers/specs/2026-10-09-actions-with-costs-design.md
git commit -m "State that actions with costs are built"
```

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build: every step of the spec's "What the player sees" in a wide window and in one
narrower than 240 art pixels; the greyed-out dram once the money runs low; the chair's three
outcomes; the cigarette appearing after two drinks; the status line changing under an open window;
and how a label such as `Order a beer  10 min  45 Kč` wraps on a phone, where the break may fall
between a number and its unit.
