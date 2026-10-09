# Actions with costs, odds and conditions (Foam phase 5, spec 2 of 4): design

Date: 2026-10-09. App: `apps/foam`. Status: designed. It is the second of phase 5's four specs in
the [direction document](../../direction.md). It needs the Tellurion addition
[dialogue next as a function](../../../../../docs/superpowers/specs/2026-10-08-dialogue-next-function-design.md),
which is built first. The third spec, locations and hours, follows this one.

## Background

Phase 4 left a night that can be travelled but not spent. A choice is Tellurion's `DialogueChoice`:
a text, a `next`, an `isVisible` and an `onChoose`. What an action costs sits in the next node's
`onEnter`:

```ts
beer: {
  speaker: BAR,
  text: standIn`The beer is cold and the foam is thick, and for a while nothing else needs doing.`,
  onEnter: (night) => {
    night.money -= 45;
    night.minutes += 10;
  },
},
```

So the label cannot say what the beer costs, the story window cannot grey the choice out when the
money is short, and the checker cannot read the cost: the rule that every node with choices offers a
way out that costs nothing is a convention, not a check. The money goes below zero. A journey the
player cannot pay is taken anyway. `Night.stateOfMind` is a string that nothing sets after
`'Sober'`. The night screen writes the status line when a window opens or closes, not when a script
changes the night. The checker follows a `next` only when it is an object.

Spec 1 of this phase gives Tellurion a `next` that may be a function of the context, evaluated when
it is followed. Dice and conditions branch through it.

Three things shape this spec:

- **The night is a budget.** Every action costs time, money or both, and the player must see the
  numbers to spend them well. The numbers are shown as numbers.
- **The author writes plain data.** A price, minutes, odds and a condition are fields on a choice,
  which the window and the checker read. Only what cannot be data is a function.
- **The game loop is being designed.** Precise numbers are wanted everywhere, including for how
  drunk the player is. Words for the level can be added later, on top of the number.

## Decisions (from brainstorming)

1. **Foam types its own choice,** with plain fields for the price, the minutes, the drinks, the odds
   and a condition on drunkenness. A `defineScript` function in Foam's core turns the fields into
   the engine's `isVisible` and `onChoose`, so every runner of a script, the story window, a unit
   test and the checker, applies the same rules from the same object.
2. **Dice route through a function `next`.** A choice with `odds` rolls on the press and writes the
   roll into the night; its `next` reads the roll and returns any node, so a roll has as many
   outcomes as the author writes. A second plain target was rejected: two outcomes are not enough.
3. **Odds may depend on the night.** `odds` is a number or a function of the night. The label shows
   the chance that applies now, and the roll uses the same number.
4. **Drunkenness is a number of drinks,** shown in the status line with one decimal. Drinks are
   added whole; one drink leaves per hour, and the level falls with every minute the clock moves, by
   any action. There are no words for the level. The direction's Drunkenness row says so.
5. **A choice whose drunkenness condition fails is hidden,** through `isVisible`. The player never
   learns it was there, and the level is felt through what appears rather than read as a lock.
6. **A choice shows its numbers in its text,** after two spaces, in the order minutes, price, odds:
   `Order a beer  10 min  45 Kč`, `Search for the phone  5 min  60%`. Odds are a whole percentage.
7. **Money never goes below zero.** A choice the night cannot pay is greyed out and takes no press,
   and so is a journey in the travel window. Walking is free, so a way out always exists.
8. **The status line follows the night** while a window is open: the night screen writes it from its
   update whenever it changes.
9. **The checker reads the fields,** follows a function `next` with its check nights, and checks the
   way out that costs nothing.

## Design

### What the player sees

1. A choice shows the numbers it has after its text, two spaces apart, in the order minutes, price,
   odds: `Order a beer  10 min  45 Kč`, `Pour a dram  15 min  90 Kč`,
   `Take the spare chair  15 min  40%`. A choice without numbers reads as today. A long label wraps,
   as today.
2. A choice whose price is more than the money is greyed out, in the theme's disabled look (shade on
   black). It takes no tap, no focus and no key, so the arrows skip it. It keeps its label, so the
   player reads what it would have cost.
3. The press applies the choice at once: the clock moves by the minutes, the price is taken, the
   drinks are added, and the status line changes while the window is still open. Then the next
   node's text types out. A node whose `onEnter` changes the night changes the status line the same
   way.
4. A choice with odds rolls on the press, and the text that follows tells the outcome. The label
   shows the chance that applies now: a choice whose odds depend on drunkenness shows another number
   to a drunk player.
5. The status line reads `19:40   350 Kč   0.0`. After a beer it reads `19:50   305 Kč   1.0`; an
   hour later without a drink the last number is `0.0` again. Always one decimal.
6. A choice whose drunkenness condition fails is not in the list. The same node may show it on a
   later visit, when the level has changed.
7. In the travel window the destination button is greyed out while the selected destination costs
   more than the money. It keeps the name and the numbers, and takes no press. The place's button on
   the map still selects it, so the player sees what every journey would cost. The window opens with
   the focus on the destination button when the night can pay it, and on "Back" when it cannot, as
   for a way with no destination.
8. The money never goes below zero.

What does not change: the night has no end, places do not close, and nothing happens at a given
hour. Those are specs 3 and 4.

### Files

| File                                  | Change                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `source/game/core/script.ts`          | New. `Choice`, `Node`, `Reference`, `Script`, `defineScript`, `asChoice`, `formatChoice`                           |
| `source/game/core/formatCosts.ts`     | New. `formatCosts`                                                                                                 |
| `source/game/core/night.ts`           | `Roll`; `drunkenness`, `roll` and `random` on the night; `getDrunkenness`, `addDrinks`, `roll`; `stateOfMind` goes |
| `source/game/core/travel.ts`          | `formatJourney` goes, replaced by `formatCosts`; `NightStart` gains an optional `drunkenness`                      |
| `source/game/core/createWayOut.ts`    | Returns a Foam `Script`                                                                                            |
| `source/game/core/checkContent.ts`    | Three check nights per place, following a function `next`, the new rules                                           |
| `source/game/core/getJumpIn.ts`       | The `drunkenness` parameter                                                                                        |
| `source/game/content/nightStart.ts`   | Unchanged in value; its type gains the optional field                                                              |
| `source/game/content/places/*.ts`     | `defineScript`, and the content of "The stand-in content" below                                                    |
| `source/game/screens/storyWindow.ts`  | Labels through `formatChoice`; a choice the night cannot pay is disabled                                           |
| `source/game/screens/travelWindow.ts` | Takes the night; the destination button is disabled while the night cannot pay; the opening focus                  |
| `source/game/screens/nightScreen.ts`  | The status written from `onUpdate`; the night passed to the travel window                                          |
| `tests/fixedWorld.ts`                 | The beer's fields, and a rolling choice for the tests                                                              |

`Place` and `Spot` keep Tellurion's `RunnableDialogueScript<Night>`, which a Foam `Script` is
assignable to. `asChoice` in `script.ts` is the one cast from a runner's choice to a Foam choice,
used by the story window and the checker.

### The choice (`core/script.ts`)

```ts
import {type DialogueChoice, type DialogueNode} from 'tellurion';

export type Choice<TNodeId extends string> = {
  text: string;
  next?: Reference<TNodeId>;

  /** Kč taken on the press. The choice is greyed out while the night has less. */
  price?: number;

  /** Minutes the clock moves on the press. */
  minutes?: number;

  /** Drinks added on the press, after the minutes. */
  drinks?: number;

  /** The chance of success, above 0 and below 1. The press rolls, and `night.roll` holds the result. */
  odds?: number | ((night: Night) => number);

  /** Offered only while the level is within these bounds, inclusive; read when the node is entered. */
  drunkenness?: {min?: number; max?: number};

  isVisible?: (night: Night) => boolean;
  onChoose?: (night: Night) => void;
};

/** Tellurion's node, with Foam's choices and Foam's references. */
export type Node<TNodeId extends string> = Omit<
  DialogueNode<Night, TNodeId>,
  'choices' | 'next'
> & {
  choices?: Array<Choice<TNodeId>>;
  next?: Reference<TNodeId>;
};

/** Where a script goes: a node, an id or a function of the night that returns either. */
export type Reference<TNodeId extends string> =
  Node<TNodeId> | TNodeId | ((night: Night) => Node<TNodeId> | TNodeId);

export type Script<TNodeId extends string> = {
  start: Reference<TNodeId>;
  nodes?: Record<TNodeId, Node<TNodeId>>;
};

export function defineScript<TNodeId extends string>(script: {
  start: Reference<NoInfer<TNodeId>>;
  nodes?: Record<TNodeId, Node<NoInfer<TNodeId>>>;
}): Script<TNodeId>;

/** A runner's choice is a Foam choice: every script Foam runs went through defineScript. */
export function asChoice(choice: DialogueChoice<Night, string>): Choice<string>;

/** The choice's text and the numbers it has, two spaces apart: "Order a beer  10 min  45 Kč". */
export function formatChoice(choice: Choice<string>, night: Night): string;
```

`defineScript` is typed as Tellurion's `defineDialogueScript` is, with `NoInfer` in every reference
position, so a dangling id errors at its literal and a function `next` that returns one errors at
the function. The context is always the night, so it is not curried. `Reference` is Foam's own, with
Foam's `Node`, so an inline node anywhere, in a function's return too, may carry the fields; it is
assignable to Tellurion's `DialogueReference<Night, string>`.

**What `defineScript` does.** It returns the script with every choice carrying two derived fields
beside the author's:

- `isVisible` is the drunkenness condition, `min <= level <= max` with an absent bound ignored, and
  then the author's `isVisible` when there is one. A choice with neither has none.
- `onChoose` applies the choice, then calls the author's `onChoose` when there is one. The order
  inside: the roll first, from `odds` read now, so a choice's own drinks never move its odds; then
  the price is taken; then the clock moves by the minutes; then the drinks are added, at the new
  time, so a beer of ten minutes shows `1.0` when its text appears. A choice with none of the fields
  and no author's `onChoose` has none.

The plain fields stay on the object: the story window reads `price`, `minutes` and `odds` for the
label and the greying, and the checker reads them all. A choice object thus has two layers, the
author's fields and the derived ones, and `script.ts` is the one file that knows both.

Nodes are mapped once each: the nodes of `nodes`, an inline `start`, an inline `next` and a node
returned by a function `start` or `next`. A function is wrapped so that the node it returns is
mapped as it comes back, and a node object already mapped comes back as the same object, so a node
reached twice is one node to the runner and the window.

After the derived `onChoose`, the runner follows `next` as spec 1 says, then the next node's
`onEnter` and text, which can read `night.roll`.

In a place file the beer becomes a choice that says what it costs, and its node only speaks:

```ts
const bar = defineScript({
  start: 'bar',
  nodes: {
    bar: {
      speaker: BAR,
      text: standIn`The bartender nods at the taps.`,
      choices: [
        {text: 'Order a beer', price: 45, minutes: 10, drinks: 1, next: 'beer'},
        {text: 'Not now'},
      ],
    },
    beer: {
      speaker: BAR,
      text: standIn`The beer is cold and the foam is thick, and for a while nothing else needs doing.`,
    },
  },
});
```

A roll with three outcomes, whose odds depend on the level:

```ts
{
  text: 'Take the spare chair',
  minutes: 15,
  odds: (night) => (getDrunkenness(night) >= 2 ? 0.7 : 0.4),
  next: ({roll}) =>
    roll?.won ? 'welcomed'
    : (roll?.value ?? 0) > 0.9 ? 'spilled'
    : 'brushedOff',
}
```

`createWayOut` returns a Foam `Script` built with `defineScript`; its choices do not change. The
place files call `defineScript` instead of `defineDialogueScript<Night>()`.

### The night (`core/night.ts`)

```ts
export type Roll = {
  /** The random number, from 0 up to 1. */
  value: number;

  /** The odds it was rolled against. */
  odds: number;

  /** value < odds */
  won: boolean;
};

export type Night = {
  /** Minutes since midnight; 19:40 is 1180. */
  minutes: number;

  /** Money, in Kč. Never below 0. */
  money: number;

  /** The place the player is in. */
  place: PlaceId;

  /** Set by a way out: the way the player picked, and the ways that way out offers. */
  leaving: {way: Way; ways: readonly Way[]} | null;

  /** The level at the last drink, in drinks, and the clock then. getDrunkenness gives the level now. */
  drunkenness: {level: number; at: number};

  /** The last roll, or null before the first. */
  roll: Roll | null;

  /** Random numbers from 0 up to 1: Math.random until phase 7 seeds it. Tests fix it. */
  random: () => number;
};

/** Drinks that leave the blood in an hour. */
export const DRINKS_PER_HOUR = 1;

export function createNight(start: {
  place: PlaceId;
  minutes: number;
  money: number;
  drunkenness?: number;
}): Night;

/** Drinks in the blood now: the level at the last drink, less one per hour since, never below 0. */
export function getDrunkenness(night: Night): number;

/** Adds drinks now: the level now plus the drinks becomes the level at this moment. */
export function addDrinks(night: Night, drinks: number): void;

/** Rolls against the odds and writes `night.roll`. */
export function roll(night: Night, odds: number): void;

/** "19:40   350 Kč   1.5": the time, the money and the level with one decimal. */
export function formatStatus(night: Night): string;
```

- **The level is derived, not stored.** The night stores only the level at the last drink and the
  clock then. Whatever moves the clock, a choice's `minutes`, a journey or a train's `onEnter`,
  lowers the level without knowing about it. Two beers at 19:40 give `2.0`; at 20:10 the status
  shows `1.5`; at 21:40 it shows `0.0`, and a beer then gives `1.0`. The clock never moves back
  during a night.
- `createNight` starts the level at `start.drunkenness ?? 0` at the start's minutes, `roll` at
  `null` and `random` at `Math.random`. `stateOfMind` goes.
- `formatStatus` writes the level as `getDrunkenness(night).toFixed(1)`. The status room of 24
  characters holds `17:00   1350 Kč   12.5`.
- Content reads the level through `getDrunkenness(night)`, in a text, an `odds` function or a `next`
  function.

`takeJourney` does not change: it moves the clock and takes the price, and the level follows.

**The jump-in** (`core/getJumpIn.ts`, `core/travel.ts`) gains `drunkenness`, a number of drinks with
an optional decimal part, so a scene gated on the level can be tried on a phone:
`/?place=rotorBar&time=23:10&money=120&drunkenness=2.5`. A value in another form is ignored with a
`console.warn`, as the others are. `NightStart` gains the optional field, and the night screen
passes it to `createNight`.

### Formatting (`core/formatCosts.ts`)

```ts
/** "10 min  45 Kč  60%": the numbers that are there, two spaces apart. A price of 0 is left out. */
export function formatCosts(costs: {minutes?: number; price?: number; odds?: number}): string;
```

The odds are a whole percentage, `Math.round(odds * 100)`. `formatJourney` goes: a `Destination` has
`minutes` and `price`, so the travel window calls `formatCosts(destination)`, and a walk, whose
price is 0, still reads `35 min`. `formatChoice` in `script.ts` reads an `odds` function with the
night and joins the text and `formatCosts` with two spaces, or returns the text alone for a choice
without numbers.

### The story window (`screens/storyWindow.ts`)

Two changes:

- When it lays a node out, the label of each visible choice is
  `formatChoice(asChoice(choice), night)` instead of `choice.text`, wrapped as today. The odds are
  read then, when the node is shown; nothing changes the night while the window waits for a press,
  so the label and the roll use the same number.
- When it builds the buttons, a choice whose `price` is more than the night's money gets
  `disable()`. Tellurion's button then draws the theme's disabled look, ignores taps and is not
  focusable, so the arrows skip it. A resize builds the buttons again and disables the same ones.

The window keeps the night it is given as `context`, to read the money and the odds.

### The travel window (`screens/travelWindow.ts`)

`TravelWindowOptions` gains `night: Night`. The window reads its money:

- The destination button is built disabled when the selected destination's price is more than the
  money, and `#showSelection` enables or disables it as the selection or the way changes. The button
  is never built again for that, so the focus never lands on a button that goes.
- The modal's initial focus is the destination button when it is enabled, and "Back" otherwise: a
  way with no destination and a destination the night cannot pay open the same way.
- The place buttons on the map do not change: a place the way reaches selects, whatever it costs.

The lists, the sizes and the layout do not change. The night screen passes the night it holds.

### The night screen (`screens/nightScreen.ts`)

`onUpdate` formats the status from the night and, when it differs from the text shown, writes it and
sets its width, as `writeStatus` does today. The explicit calls on showing a place, on a story
window's close and on a journey go, since the update covers them: a choice's press, an `onEnter`, a
journey and the first frame all show at once. The clock does not run by itself, so between actions
nothing changes and nothing is written.

### The checker (`core/checkContent.ts`)

**Check nights.** Today the checker runs every script once per place, at one hour and one sum. Now
each place gets three nights, at drunkenness 0, 2 and 5 (`CHECK_LEVELS`), so a condition, a text or
an `odds` function that reads the level is exercised sober, tipsy and drunk. The hour and the money
stay fixed.

**Following a function `next`.** For a node's or a choice's function `next`, the checker calls it
with each check night and checks the node it returns: an inline node as today, an id by looking it
up in the script. For a choice with `odds`, it first writes a roll into the night for each value
from 0.00 to 0.99 in steps of 0.01, with `odds` as that night reads it and `won` from the two, so
every outcome an author can write by a threshold is reached. A choice without `odds` is followed
with `roll` as `null`. A function that throws is reported, not rethrown. A node reached by several
paths is checked under each, as today; the reports are a set, so one problem is one line.

**New rules**, each reported as one line:

| Rule                                                                                                                              | Example of a report                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `price`, `minutes` and `drinks` are whole numbers above 0                                                                         | `rotorBar › The bar › bar › "Order a beer": price is 0; leave it out`                                          |
| `odds`, as a number or as the function's result for each check night, is above 0 and below 1                                      | `rotorBar › The corner table › table › "Take the spare chair": odds is 1`                                      |
| `drunkenness` names `min`, `max` or both, each 0 or more, with `min` not above `max`                                              | `rotorBar › The smokers › start › "Ask for a cigarette": drunkenness has min 3 above max 2`                    |
| A function `next` returns an id of the script                                                                                     | `rotorBar › The corner table › table › "Take the spare chair" › next: returns "welcomd", which is not a node`  |
| A function `next` does not throw                                                                                                  | `rotorBar › The corner table › table › "Take the spare chair" › next: throws "Cannot read properties of null"` |
| Every node with choices has a way out that costs nothing: a choice with no price, minutes or drinks, offered on every check night | `rotorBar › The bar › bar: no way out that costs nothing`                                                      |

A way out that costs nothing may carry odds: the press costs nothing, and the node it leads to has a
way out of its own. "Offered on every check night" is the derived `isVisible`, so a choice with a
drunkenness condition, or with an author's `isVisible` that is false on one of the nights, is never
counted as the way out.

The existing rules stay: word length and italic marks on texts and on choice texts, speakers, the
labels, the data files.

### The stand-in content

Each rule gets at least one real use, so the loop can be played, all in stand-in text as before.
Money changes only through `price`, never in an `onEnter`, so the greying is the whole story of the
money; an outcome of a roll may cost time, not money.

| Place                | Scene            | Change                                                                                                                                                                                        |
| -------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The train            | The door         | The 4 and 9 minutes move from the arrival nodes' `onEnter` to the choices' `minutes`; the nodes only set the place                                                                            |
| Rotor Bar            | The bar          | `Order a beer  10 min  45 Kč`, one drink; the node's `onEnter` goes                                                                                                                           |
| Rotor Bar            | The corner table | `Take the spare chair  15 min  40%`, 70% from two drinks up. Three outcomes by a function `next`: welcomed; brushed off; a knocked-over glass that costs another ten minutes in its `onEnter` |
| Rotor Bar            | The smokers      | `Ask for a cigarette  5 min`, offered from two drinks up; `Go back in` is the free way out                                                                                                    |
| The Whisky Shop Brno | The shelves      | `Pour a dram  15 min  90 Kč` and `Pour the good one  15 min  180 Kč`, one drink each; the second is the one a player sees greyed out once the money runs low                                  |
| The Whisky Shop Brno | Two regulars     | `Ask about the bottle  5 min`, offered up to one drink: they talk to a sober stranger. Drunker, the scene is text only                                                                        |
| Náměstí Republiky    | The shelter      | `Ask when the next tram goes  5 min  60%`: he knows, or he shrugs. A roll with minutes and no price                                                                                           |

The place files read the level through `getDrunkenness` and keep the limits of the stand-in text: no
word longer than 16 characters, people without names, every node with a `speaker`, italic marks in
pairs. The tests' fixed world (`tests/fixedWorld.ts`) gives its beer the same fields and gains a
rolling choice, so the browser tests drive a real label, a real greying and a real roll.

## Error handling

| What goes wrong                                                   | In CI                  | In the running game                                                                                   |
| ----------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| A price, minutes, drinks or odds out of range                     | The checker fails      | Used as written; odds of 1 or more always win, odds of 0 or less never                                |
| A function `next` returns an id the script lacks                  | The checker fails      | Spec 1's dangling-id failure, as for a fixed id                                                       |
| A function `next` throws                                          | The checker fails      | The error reaches the window's press; the runner stays on its node, as spec 1 says                    |
| A node whose every choice is hidden                               | The way-out rule fails | Tellurion treats the node as choice-less, with a DEV warning, and the window closes at the text's end |
| A node whose every choice is greyed out                           | The way-out rule fails | The player is stuck with only the menu. The checker exists to keep this from shipping                 |
| A `next` or a text reads `night.roll` after a choice without odds | Not checked            | It reads the last roll, or `null` before the first                                                    |
| The price equals the money                                        | Allowed                | Affordable: the money reaches 0                                                                       |
| An `onEnter` takes money                                          | Not checked            | The money can go below zero. The content does not do it                                               |
| The jump-in's `drunkenness` is in another form                    | Its test covers it     | The value is ignored, with a `console.warn`                                                           |

## Testing

Unit tests, in `tests/`:

- **`script.test.ts`.** New. Run through a `Dialogue`: the derived `onChoose` rolls, takes the
  price, moves the clock and adds the drinks in that order, then calls the author's `onChoose`; an
  `odds` function is read before the drinks are added; a condition's bounds are inclusive, an absent
  bound is ignored, and the author's `isVisible` is combined with it; a choice with no fields keeps
  no derived function; inline nodes and nodes returned by a function `start` or `next` are mapped,
  and the same node object comes back for the same input. `asChoice` returns its argument.
  `formatChoice` gives the text alone, the text with each number, and the three together in order.
  Type fixtures with `@ts-expect-error`: a dangling id in a fixed `next` and in a function `next`.
- **`night.test.ts`.** `createNight` starts at the given level, or 0, at the start's minutes, with
  `roll` null. `getDrunkenness` falls one per hour and stops at 0. `addDrinks` adds to the level now
  and moves the mark to now. `roll` writes the value, the odds and `won`, with `random` fixed.
  `formatStatus` writes the level with one decimal.
- **`formatCosts.test.ts`.** New. Each number alone, all three in order, a price of 0 left out, odds
  rounded to a whole percentage. The journey forms `35 min` and `11 min  170 Kč` move here from
  `travel.test.ts`.
- **`checkContent.test.ts`.** A sample that breaks each new rule, and the line it must report; a
  function `next` whose outcomes are reached by the rolls; a text and a condition that differ by
  level are exercised by the three nights; good content gives the empty list.
- **`content.test.ts`.** `checkContent` over the game's own content gives the empty list, as today.
- **`getJumpIn.test.ts`.** `drunkenness` is read with and without a decimal part; another form is
  dropped.

Browser tests, in `tests/`:

- **`nightScreen.browser.test.ts`.** The beer's label carries its numbers. The status changes while
  the window is still open, before it closes. With the money short, the beer is disabled, a tap on
  it does nothing and the arrows skip it. A rolling choice with `random` fixed enters the node of
  that outcome, and another value enters another node.
- **`travelWindow.browser.test.ts`.** With the money short, the destination button is disabled and
  the window opens with the focus on "Back"; selecting a place the night can pay enables it; the
  button keeps its place and size.
- **`nightScreenPlaces.browser.test.ts`.** The status after a journey is checked as today, with the
  new last number.
- **`jumpIn.browser.test.ts`.** A jump-in with `drunkenness` shows it in the status.

The lessons of the earlier phases' reviews hold for every new test and every new button: closing
guards, the focus kept when a list is rebuilt, sizes that do not jump, an exact screen size through
the viewport, and taps through `userEvent.click`.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=tellurion --filter=somewhere --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- `node scripts/list-stand-ins.mjs` prints the list.
- No file under `apps/somewhere/` has changed, and `packages/tellurion/` has changed only as spec 1
  says.

## Non-goals

- Opening hours, locations, people only there at certain hours, and the clock's start at 16:00 (spec
  3).
- The end of the night at 08:00 and the log (spec 4).
- Words for the level of drunkenness.
- A conditioned choice shown greyed out, with its condition in the label.
- A seeded `random` (phase 7).
- A drawn die, or any animation of a roll.
- A choice's numbers laid out in a column, as the travel window's destination is.
- A rule for what being drunk changes. Content writes it.
- Changes to Somewhere, and changes to Tellurion beyond spec 1.

## Rejected

- **A second plain target for dice** (`next` for success, another field for failure), compiled into
  a function `next` by Foam. Two outcomes are not enough; a roll has as many as the author writes.
- **The level in words** (Sober, Tipsy, Drunk, Wasted). The game loop is being designed and needs
  precise numbers; words can be laid over the number later.
- **A conditioned choice greyed out,** with the level in its label. It tells the player to drink to
  a number, and a label with a price, odds and a level is long on a phone.
- **The rules applied by the story window** on the press. A script run anywhere else, in the checker
  or in a unit test, would have no rules, and the window would grow past its 724 lines.
- **A runner of Foam's own around Tellurion's `Dialogue`.** It would mirror the runner's whole
  surface for the window, for no gain over `defineScript`.
- **Choice numbers laid out as the travel window's destination is,** text left and numbers right. A
  wrapped label with the numbers in it is simpler, and it reads well enough.
- **A ladder where each drink is one step up and each hour one step down.** A beer and a double
  would weigh the same, and the level could not be a fraction.
- **A level stored as a number and lowered by a "pass time" function.** Every script that moves the
  clock would have to call it; deriving the level from the clock needs nothing of them.
