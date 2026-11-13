# The seed (Foam phase 7, spec 1 of 3): design

Date: 2026-10-25. App: `apps/foam`. Status: implemented by
[2026-10-25-seed.md](../plans/2026-10-25-seed.md). It is the first of phase 7's three specs in the
[direction document](../../direction.md). It builds on phase 6's
[endings and sleep](2026-10-19-endings-and-sleep-design.md). Spec 2, versions, and spec 3, saving
and Continue, follow.

## Background

Phase 6 leaves one whole night: the train at 16:00, seven locations, a quest with three threads,
three endings, and stories kept across nights. Two nights differ only in what the player does and in
the dice:

- Every button on a place's picture has one script. Its texts and its branches read the hour, the
  money, the drunkenness, the quest's flags and the last roll. Nothing in a night reads anything
  that differs from one night to the next.
- The dice come from `night.random`, a field set to `Math.random`, which the checker and the tests
  replace with fixed values.
- The start is fixed data: the train, 16:00, 350 Kč.

The direction document's phase 7 row says a second night differs from the first, and names the seed,
saving and Continue. The brainstorm of 2026-10-25 decided the content model, reopened at the phase 6
review, and cut phase 7 into three specs: the seed first, so that the versions of spec 2 and the
save of spec 3 have a night they can name.

Three things shape this spec:

- **A night is a number.** The seed is a whole number that stands for one night. Everything the game
  decides for a night is computed from it, so two players with one seed play one night, and a night
  can be played again.
- **Every decision has a key.** The game does not draw numbers one after another from the seed: then
  a decision made in a bar would depend on how many dice were rolled on the way there, and the same
  seed would give two players two nights. Each decision is a hash of the seed and a key that names
  it, `night.random('money')`. The dice take the count of rolls as their key.
- **Today's night is everyone's.** The default seed is today's date written as a number, 20261025,
  and the player may type another.

## Decisions (from brainstorming)

1. **The content stays TypeScript scripts.** Anything that varies by the night reads `night.random`
   with a fixed key, as it reads the hour. No language made for writing, and no table of decisions.
2. **The seed is a whole number** of up to 15 digits. The default is today's date in the player's
   local time, as 20261025. New Game opens a window with the date in a field to change, and the
   jump-in takes `seed=`.
3. **One hash, no generator.** `hash(seed, ...keys)` gives a number from 0 up to 1 that depends on
   the seed and the keys alone, so a decision never depends on what was drawn before it. The night's
   `random` is this hash of its seed.
4. **The dice are seeded too,** by the roll's count: the same seed with the same choices is the same
   night to the last roll. Nothing but the count is kept for them.
5. **A key is a contract.** Renaming a key changes every old night; a decision that changes gets a
   new key.
6. **The first decision is the money,** drawn from a range the author sets. The station stays the
   player's choice at the train's door.
7. **The log names the seed** on its first line, so a night can be noted and shared. No other screen
   shows it.
8. **The checker meets every version.** Check nights carry six values of `random`, 0, 0.2, 0.4, 0.6,
   0.8 and 0.99, which land on every side of an equal split into two to six, and only a function
   that read `random` is run under all six.
9. **A same-day replay is the same night** until spec 3 counts the nights started that day.

## Design

### What the player sees

1. The main menu shows Foam, New Game and Options. New Game opens a window over the menu, as Options
   does: the title "New night", a row with "Seed" and a field reading `20261025`, and Start and
   Close under it. Nothing is focused.
2. The player taps the field and types. Letters and spaces do not appear; digits do, up to 15. With
   the field emptied, Start greys out and Enter does nothing. With `7` typed, Start or Enter opens
   the night.
3. The night opens on the train at 16:00. The status line reads `16:00   400 Kč   0.0`: the money is
   the seed's, one of 300, 350, 400, 450 and 500. Tomorrow's date may give another.
4. The train's door still offers Židenice and the main station. A search in Rotor's back room rolls
   as it did, with its odds shown; the roll is the seed's, so the same seed with the same choices
   has the same luck.
5. At 08:00 the log screen opens. Its first line reads `Seed 20261025`, then a blank line, then the
   entries as before.
6. Quit to menu, then New Game: the field reads the date again. Starting it plays the same night
   over. Typing `20261026` plays tomorrow's night today.
7. `?place=rotorBarRoom&time=23:00&seed=7` starts in Rotor's room on the seed 7; `seed=abc` warns in
   the console and uses the date. `money=` still fixes the money.

What does not change: the places, the travel window, the hours, the quest, the endings, the stories,
the story window.

### Files

| File                                    | Change                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `source/game/core/hash.ts`              | New. `hash(seed, ...keys)`                                                                             |
| `source/game/core/todaySeed.ts`         | New. `todaySeed()`                                                                                     |
| `source/game/core/night.ts`             | `seed`, `rolls` and the new `random` on the night; `MoneyRange`; `createNight` draws the money; `roll` |
| `source/game/core/travel.ts`            | `NightStart.seed`; `money` a number or a range                                                         |
| `source/game/content/nightStart.ts`     | The seed at load; the money range                                                                      |
| `source/game/core/getJumpIn.ts`         | `seed=`                                                                                                |
| `source/game/core/checkContent.ts`      | The six values of `random`, run where it is read                                                       |
| `source/game/screens/newNightModal.ts`  | New. `openNewNightModal`                                                                               |
| `source/game/screens/mainMenuScreen.ts` | New Game opens the window                                                                              |
| `source/game/screens/logScreen.ts`      | The seed line                                                                                          |
| `tests/fixedWorld.ts`                   | A seed in its start                                                                                    |

### The hash (`core/hash.ts`)

```ts
/**
 * A number from 0 up to 1 that depends on the seed and the keys alone. The same arguments give the
 * same number in every browser and in Node, today and after any change to the content: a key is a
 * contract, and a decision that changes gets a new key.
 */
export function hash(seed: number, ...keys: Array<number | string>): number;
```

It is cyrb53 (bryc, public domain, linked in a comment): two 32-bit halves mixed with `Math.imul`,
which every browser and Node have, with no dependency, into a 53-bit integer. The seed is mixed
first. Each key is mixed as a tag for its type, 1 for a number and 2 for a string, then its content,
a string as its character codes and a whole number as its two 32-bit halves, then a boundary tag 0.
So `hash(1, 'roll', 7)`, `hash(1, 'roll7')` and `hash(1, 'roll', '7')` differ, and no key runs into
the next. The 53-bit integer divided by 2^53 is the number: 0 is possible, 1 is not.

A key is a string or a whole number. The types take nothing else; the content's keys are string
literals and counts.

### The night (`core/night.ts`)

```ts
export type MoneyRange = {min: number; max: number; step: number};

export type Night = {
  /** The whole number that stands for the night: `random` is a hash of it. */
  seed: number;

  /** The dice rolled so far; the key of the next roll. */
  rolls: number;

  /**
   * A number from 0 up to 1 for the seed and the keys, the same every time: content reads what
   * varies by the night with a fixed key, `night.random('money')`, and `roll` reads the dice with
   * `'roll'` and the count. The checker and the tests replace it with a function that returns a
   * fixed value.
   */
  random: (...keys: Array<number | string>) => number;

  // minutes, money, place, leaving, drunkenness, roll, log, collection, stories, quest as today
};

export function createNight(
  start: {
    seed: number;
    place: PlaceId;
    minutes: number;
    money: MoneyRange | number;
    drunkenness?: number;
    quest?: Partial<Quest>;
  },
  collection?: Collection,
): Night;
```

`createNight` sets `random` to `(...keys) => hash(start.seed, ...keys)` and `rolls` to 0. A `money`
that is a number is the money; a range draws
`min + step * Math.floor(random('money') * ((max - min) / step + 1))`, so 300 to 500 in steps of 50
gives one of 300, 350, 400, 450 and 500 with equal chances. The night's own `random` makes the draw,
so a test that replaces `random` fixes the money.

`roll` becomes:

```ts
export function roll(night: Night, odds: number): void {
  let value = night.random('roll', night.rolls);

  night.rolls += 1;
  night.roll = {value, odds, won: value < odds};
}
```

The checker's override, `night.random = () => value`, takes any keys and keeps working.

### The start (`core/travel.ts`, `content/nightStart.ts`)

`NightStart` gains `seed: number`, and its `money` becomes `MoneyRange | number`. The content sets
`seed: todaySeed()` at module load, the date the page was loaded on, and
`money: {min: 300, max: 500, step: 50}`. The window writes `nightStart.seed` before every night it
starts, and the jump-in writes it when the address has `seed=`, as they write the place; the
jump-in's `money=` writes a number over the range. Nothing else reads `nightStart.seed`: the night
screen's `onShow` hands `nightStart` to `createNight` as today.

### Today's seed (`core/todaySeed.ts`)

```ts
/** Today's date in the player's local time as one number: 20261025 for 25 October 2026. */
export function todaySeed(): number;
```

`getFullYear() * 10000 + (getMonth() + 1) * 100 + getDate()` of `new Date()`. Local time, so the
night a player starts at 23:30 is the night of the day on their clock. The window reads it when it
opens, the content when it loads.

### The New night window (`screens/newNightModal.ts`, `screens/mainMenuScreen.ts`)

`openNewNightModal({ui, scheduler, onClosed})` returns a `Modal`, built as `openOptionsModal` is: a
`Panel` with the window padding and a column with a gap of 4, holding

1. the title block "New night", 136 wide;
2. a row 136 wide and 12 high: a `Text` "Seed" in a column 36 wide, 6 of gap, and a `TextInput`
   filling the rest;
3. a row of Start and Close, 8 under the field, each 65 wide with 6 between them.

The `TextInput` has `value: String(todaySeed())`, `maxLength: 15`, no placeholder, and
`container: game.app.canvas.parentElement ?? document.body`, as Somewhere's name field has; the
theme's `textInput` entry exists since phase 3. Its `onChange` sets the value back without anything
that is not a digit, `input.value = input.value.replace(/\D/gu, '')`, and then enables Start when
the value has a digit and disables it when it has none. Its `onSubmit`, Enter in the field, starts
when the value has a digit and does nothing otherwise.

Start's `onClick` and the submit do the same: `nightStart.seed = Number(input.value)`, then
`void game.showScreen(nightScreen)`. The main menu's `onHide` destroys the open window
synchronously, as it destroys Options, so the window is not closed first. Close calls
`modal.close()`, and Escape closes it as a `Modal` always closes on the cancel command. Focus
returns to New Game through the focus-scope pop. Nothing is focused on open: on a phone, a focused
field raises the keyboard before the player has decided to type, and the date is right for most.

The main menu's New Game opens this window and keeps it in `openModal`, as Options is kept, instead
of showing the night screen.

### The jump-in (`core/getJumpIn.ts`)

`seed=` with 1 to 15 digits gives `jumpIn.seed = Number(value)`. Anything else warns
`The jump-in ignores the seed "abc": it is a whole number of up to 15 digits.` and leaves the date.
The route's `Object.assign(nightStart, start)` carries it with the others.

### The log screen (`screens/logScreen.ts`)

The formatted text becomes `Seed ${night.seed}`, a blank line, then `formatLog(...)`, when the
screen has a night. The page breaks count the two lines as any others.

### The checker (`core/checkContent.ts`)

```ts
// Every side of an equal split into two to six is met: a `start` that picks one of three versions
// by `random` is followed into all three. An unequal split is the author's to meet, as the levels.
const CHECK_RANDOM = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
```

Every check night's `random` returns one value and notes that it was read. The nights are built as
today, place by time by level by quest state, all with the value 0 and a seed of 0, which nothing
reads. Wherever the checker calls a function of the content with a night, a text, a `start`, a
`next`, an `isVisible`, an `odds` or an effect, it calls it once; if the night's `random` was read,
it builds five copies of the night with the other values and calls the function on each, reporting
under the same path. A function that does not read `random` costs what it costs today, and the
checker stays at about its four seconds. Rolls keep `CHECK_ROLLS`: a rolled choice's `next` runs
under the hundred values as now, and the night's own `random` is put back after.

### The direction document

- The status line says phase 7 is being designed, and the Text row says phases 4 to 7 run on
  stand-in text.
- The Decisions table gains a Seed row, a Variation row and a Saving row; the Content row loses the
  question of a language made for writing; the Dice row says the dice are rolled from the seed.
- The shelved questions lose the content model and what is saved between runs, both decided.
- A phase 7 paragraph gives the cut into three specs and links this one.

## Error handling

| What goes wrong                                                      | In CI                                 | In the running game                                                    |
| -------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| A letter, a space or a sign is typed into the field                  |                                       | It does not appear; the digits stay                                    |
| The field is emptied                                                 |                                       | Start is disabled and Enter does nothing                               |
| Leading zeros are typed, `007`                                       |                                       | The seed is 7, and the log says so                                     |
| `seed=` in the jump-in is not 1 to 15 digits                         |                                       | A console warning; the date is used                                    |
| A function of the content throws under one of the six values         | The checker reports it under its path | The runner throws and the error screen shows it, as today              |
| A money range whose step does not divide its width                   | A test on the content's range         | `Math.floor` keeps the draw inside the range                           |
| The page was loaded before midnight and New Game is pressed after it |                                       | The window reads the date when it opens, so the new day's              |
| A jump-in night is quit and New Game pressed                         |                                       | The window's date replaces the jump-in's seed; its place and time stay |

## Testing

Unit tests, in `tests/`:

- **`hash.test.ts`.** New. The values of a few known inputs, pinned when first computed, so a change
  to the mixing is a failing test; the result at least 0 and below 1 over many inputs; two seeds
  differ; `('roll', 7)`, `('roll7')` and `('roll', '7')` differ; no keys differs from one empty key.
- **`todaySeed.test.ts`.** New. With a fixed clock, 25 October 2026 gives 20261025 and 1 January
  gives the month and the day padded.
- **`night.test.ts`.** The whole-object comparison gains `seed`, `rolls: 0` and a function for
  `random`; `random` of a new night equals `hash` of its seed and the keys; a number for `money` is
  kept; a range draws within it, in its steps, the same for the same seed and from the night's own
  `random`; `roll` reads `('roll', 0)` then `('roll', 1)` and counts; two nights with one seed roll
  alike and two seeds roll apart.
- **`getJumpIn.test.ts`.** `seed=7` and `seed=20261025` give the number; `seed=abc`, `seed=-1` and
  sixteen digits warn and give nothing.
- **`checkContent.test.ts`.** A fixture `start` that picks one of three nodes by `random`, one of
  them with a word over 16 characters, is reported; a `text` that throws only above 0.8 is reported;
  a function that does not read `random` runs once, counted through a spy on the fixture; a rolled
  `next` still meets the hundred values.
- **`content.test.ts`.** The start has today's seed and the range 300 to 500 by 50; the checker
  passes on the content.

Browser tests, in `tests/`:

- **`mainMenu.browser.test.tsx`.** New Game opens the window with today's date in the field; letters
  typed are dropped and digits kept; an emptied field disables Start and Enter does nothing; Start
  with a typed seed shows the night screen in the train with `nightStart.seed` set and the money the
  hash gives for it; Enter in the field does the same; Escape and Close close the window with the
  focus back on New Game; the picture runs at half speed while it is open.
- **`logScreen.browser.test.ts`.** The first line is `Seed` and the night's seed, then a blank line.
- **`jumpIn.browser.test.ts`.** `seed=7` starts on the seed 7; without `seed=` the seed is today's.
- **`nightScreen.browser.test.ts`** and the other night suites: their fixed world's start names a
  seed, so their money stays a number and nothing else changes.

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
- The checker test still runs in about four seconds.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- Versions of a scene picked by the seed, the friend's hours in their version, an event on arrival
  (spec 2).
- Saving the night, Continue, the record of nights, the set of texts read, and the count of nights
  started on one day (spec 3).
- The seed anywhere but the log; a button for a random seed; a link that carries the seed.
- Varying the station, the start time or any opening hours.
- Changes to Somewhere and to Tellurion.

## Rejected

- **A random number generator seeded once and read in play order.** The n-th number depends on
  everything drawn before it, so a decision made on arrival in a bar would differ between two
  players with one seed who took two routes. Slay the Spire's first version shared seeds this way
  and its second keys every draw by name.
- **One generator per decision, seeded from the seed and a name.** Every library takes a number, so
  the typed seed and the name would be hashed anyway, and each generator would give one value: the
  hash with an extra step.
- **A library for the hash.** seedrandom has had no release since 2019 and is CommonJS; pure-rand's
  first draw from a fresh generator is the seed's lowest bit flipped, so the seed would need hashing
  before it; both are a dependency decision for fifteen lines.
- **A table of every decision, name to options.** Content reads `random` where it needs it, as it
  reads the hour; the checker reaches every branch through its six values, not through a list.
- **Keys as one formatted string,** `'roll 7'`. The variadic `('roll', 7)` says what it means and
  needs no formatting at the call site.
- **The dice on `Math.random`.** A system with a seed seeds everything; the count is one integer.
- **A text seed.** The field would take anything, and the date is a number already.
- **Deciding the station by the seed.** The train's door offers it, and that choice is the player's.
- **The seed in the status line.** The longest status is 24 characters and the narrowest row
  holds 23.
- **The field focused on open.** On a phone it raises the keyboard before the player has chosen to
  type.
- **The window prefilled with the last seed.** "Today's date" is one rule; a jump-in's seed holds
  for its own night.
- **Six times the check nights.** The checker takes four seconds; it would take twenty-four. Only a
  function that read `random` runs again.
- **`createNight` reading the clock for a missing seed.** The core stays free of the date; the
  content and the window read it.
