# Versions (Foam phase 7, spec 2 of 3): design

Date: 2026-10-26. App: `apps/foam`. Status: designed; the implementation plan follows. It is the
second of phase 7's three specs in the [direction document](../../direction.md). It builds on spec
1, [the seed](2026-10-25-seed-design.md), which is built. Spec 3, saving and Continue, follows.

## Background

After spec 1 a night is a number. Everything the night decides is a hash of its seed and a key that
names the decision, `night.random('money')`, and the dice are rolled from it by their count. Two
nights on two seeds differ in the money and in the dice, and in nothing else: no text, no scene and
no hour in the content reads `random` yet.

The direction document's phase 7 row says a second night differs from the first. This spec brings
the first content that does: scenes written in versions, of which the night picks one, and an event
that happens to the player on arriving at a tram stop. It also closes a loose end of phase 6: two
texts in Rotor's room write the friend's hours as words, eight and eleven, so a change to the spans
in `content/quest.ts` means editing them too.

Three things shape this spec:

- **A version is picked by its odds.** The author writes the odds of each version, they sum to 1,
  and the night's number for the key is held against them. The number comes from the hash of spec 1;
  this spec adds the step from the number to the version.
- **The checker runs every version by name.** Spec 1's checker runs a function that read `random`
  under six fixed values, which meets every side of an equal split into up to six. Exact odds break
  that: a version with odds of 0.1 in the middle of a table lies where no fixed value lands. So the
  checker replaces the night's `pick` and runs a function once per name of the table it was handed.
- **An event is a version of a description that remembers itself.** A stop's description picks its
  version as any scene does. A version that is an event marks itself on the night when it is
  entered, and the description shows it no more that night.

## Decisions (from brainstorming)

1. **A scene's versions are picked with exact odds,**
   `night.pick('cornerTable', {music: 0.5, cards: 0.3, couple: 0.2})`, which returns one of the
   names. Repeating a name to weight it, and weights scaled by their sum, were rejected: the first
   allows only coarse fractions, the second hides the real odds and lets a typo in one weight shift
   every other.
2. **`pick` is a field on the night,** as `random` is, so the checker and the tests replace it. A
   test writes `night.pick = () => 'cards'`.
3. **The checker runs a function that picked under every name of its table,** and reports a table
   whose odds do not sum to 1 or has an odd of 0 or less. The six values of `random` stay for the
   numbers content draws directly.
4. **The friend's evening has three versions,** each with its early and late visit to the back room.
   The texts that name the hours read them from the night's evening, through a function that writes
   a whole hour as a word. The party stays at 20:00 to 01:00 on every night.
5. **Rotor's corner table has three versions:** the guitarist's night as today, a card game, and a
   couple arguing. Placeholder content.
6. **An event on arrival is a version of a stop's description,** with a choice and an effect. It
   marks itself on the night in its entry effect, never in `start`, and every path of it ends at the
   plain description, so the player still reads where they are.
7. **The night remembers the events it has met as a list of keys,** `night.events`, with `meet` and
   `hasMet`. A new event is content only. Booleans by name, as the quest's flags, would edit the
   core for every event.
8. **Four placeholder events at the three stops:** a wallet and a drunk at Náměstí Republiky, a
   fight at Malinovského náměstí from 22:00, a phone seller at the main station's forecourt.
9. **The checker's second pass runs with every key met,** as it runs with every title achieved.

## Design

### What the player sees

1. A new night on the seed 20261026 starts on the train as before. At Rotor's bar at 18:30, "Ask
   after your friend" gets the answer that they left at six and will be back at ten. On another seed
   the hours are eight and eleven, as today, or nine and midnight.
2. The back room has the friend in the hours the bartender named, and the smokers on Dvořákova
   agree. A failed search still costs an hour.
3. The corner table is the guitarist's on one seed, a card game on another and a couple arguing on a
   third, each with its own choices and stories. The same seed always shows the same table.
4. Getting off the tram at Náměstí Republiky on a seed that has the wallet, the window opens with
   the wallet's text and two choices. Keep the money, and the status line goes up by the amount the
   text names, the story's toast shows, and the stop's description follows. Press the place's name
   to read the description again: it is the plain one. Leave and come back later: plain again.
5. At Malinovského náměstí before 22:00 nothing happens. From 22:00, on a seed that has the fight,
   it happens on the first arrival.
6. The log shows the events' texts and the stories as any others.

What does not change: the journeys and their texts, the travel window, the story window, the log,
the night screen, the New night window, the quest's flags and the endings.

### Files

| File                                                        | Change                                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `source/game/core/night.ts`                                 | `pick` and `events` on the night; `createNight` builds `pick` and reads `start.events`; `meet`, `hasMet`                     |
| `source/game/core/hours.ts`                                 | `formatHourWords`                                                                                                            |
| `source/game/core/checkContent.ts`                          | The checker's `pick`; a run per name; bad tables reported; the events in the fresh nights and in the second pass             |
| `source/game/content/quest.ts`                              | `FriendEvening`, `FRIEND_EVENINGS`, the odds, `getFriendEvening`; `isFriendIn` reads it; `FRIEND_EARLY` and `FRIEND_LATE` go |
| `source/game/content/locations/rotorBar/room.ts`            | The bartender and the back room read the evening and name its hours; the corner table's three versions                       |
| `source/game/content/locations/rotorBar/street.ts`          | The smokers read the evening                                                                                                 |
| `source/game/content/locations/namestiRepubliky/stop.ts`    | The wallet and the drunk                                                                                                     |
| `source/game/content/locations/malinovskehoNamesti/stop.ts` | The fight                                                                                                                    |
| `source/game/content/locations/hlavniNadrazi/forecourt.ts`  | The phone                                                                                                                    |
| `tests/content.test.ts`                                     | `openSpot` takes a `pick` to pin, as `takeChoice` takes a `random`                                                           |
| `docs/direction.md`                                         | The status line; the Variation row; the phase 7 paragraph                                                                    |

### `pick` (`core/night.ts`)

```ts
export type Night = {
  …
  /**
   * The name the night picks for the key, by the table's odds, which sum to 1: `random(key)` is
   * read once and held against the odds in their written order, so the same key gives the same
   * name all night. The checker and the tests replace it.
   */
  pick: <TName extends string>(key: string, odds: Readonly<Record<TName, number>>) => TName;

  /** The events the player has met tonight, by key. `meet` writes it and `hasMet` reads it. */
  events: string[];
};
```

`createNight` builds `pick` from the night's `random`: the number for the key is compared with the
running sum of the odds, and the first name whose sum exceeds it is returned. The last name takes
whatever lies above the running sum, so a sum of 0.9999999999999999 from floating-point arithmetic
never leaves a gap. With `{music: 0.5, cards: 0.3, couple: 0.2}`, a number below 0.5 gives
`'music'`, below 0.8 `'cards'` and the rest `'couple'`. The return type is the union of the table's
names, so when the names are node ids a misspelt id fails to compile.

`createNight` also takes `events?: string[]` in its start, for the checker's second pass and the
tests, and starts the list empty otherwise. The whole-object test gains both fields.

The keys this spec adds, each a contract as spec 1 says: `'friend'`, `'cornerTable'`,
`'republikyArrival'`, `'malinovskehoArrival'`, `'forecourtArrival'` and `'walletMoney'`.

### The events the night has met (`core/night.ts`)

```ts
/** Records that the player met the event tonight; a key already there does nothing. */
export function meet(night: Night, key: string): void;

/** Whether the player met the event tonight. */
export function hasMet(night: Night, key: string): boolean;
```

Shaped like `findStory` and `hasStory`, over `night.events` instead of the collection. The key of an
event is the id of its first node, written in the stop's table, under `nodes` and in `meet`.

### The hour as a word (`core/hours.ts`)

```ts
/**
 * A whole hour as prose names it, on a twelve-hour clock: "eleven" for 1380, "midnight" for 1440.
 * Any other minute is the clock's form, "22:40".
 */
export function formatHourWords(minutes: number): string;
```

Beside `formatTime`. No "p.m.": the night's prose has never needed one, and the versions' hours are
whole hours.

### The friend's evening (`content/quest.ts`, `rotorBar/room.ts`, `rotorBar/street.ts`)

```ts
/** The friend's hours in Rotor's back room: an early visit, and a late one till the bar closes. */
export type FriendEvening = {early: Span; late: Span};

export const FRIEND_EVENINGS: Readonly<Record<'usual' | 'sooner' | 'later', FriendEvening>> = {
  usual: {early: [1020, 1200], late: [1380, 1620]}, // 17:00 to 20:00, 23:00 to close
  sooner: {early: [960, 1080], late: [1320, 1620]}, // 16:00 to 18:00, 22:00 to close
  later: {early: [1140, 1260], late: [1440, 1620]}, // 19:00 to 21:00, 00:00 to close
};
const FRIEND_ODDS = {usual: 0.5, sooner: 0.25, later: 0.25};

/** The night's evening: the back room, the hints and `isFriendIn` read it. */
export function getFriendEvening(night: Night): FriendEvening {
  return FRIEND_EVENINGS[night.pick('friend', FRIEND_ODDS)];
}

export function isFriendIn(night: Night): boolean {
  let {early, late} = getFriendEvening(night);

  return isWithin(night, early) || isWithin(night, late);
}
```

`getFriendEvening` exists because four readers need the evening: the back room, the bartender, the
smokers and `isFriendIn`. The key and the table are written once. `FRIEND_EARLY` and `FRIEND_LATE`
go; `PARTY` stays as it is. Rotor is open from 16:00 to 03:00 in the data, so every version's visits
lie inside its hours and every late visit ends with the close.

The bartender's answer reads the evening and names its hours:

```ts
text: (night) => {
  let {early, late} = getFriendEvening(night);

  return (
    night.quest.hasKeys ? standIn`…you have the keys.`
    : night.minutes < early[0] ? standIn`…has not seen your friend yet…`
    : isWithin(night, early) ? standIn`Your friend is in the back room…`
    : night.minutes < late[0] ?
      standIn`Your friend left at ${formatHourWords(early[1])}, the bartender says, and promised to be back at ${formatHourWords(late[0])}.`
    : standIn`Back in the back room again…`
  );
},
```

The smokers' answer and the back room's `away` text read the evening the same way; `away` says "They
will be back at eleven" through `formatHourWords(late[0])`. The `missed` text reads `isFriendIn` as
today. The shopkeeper's hint names no hour and does not change.

### The corner table (`rotorBar/room.ts`)

```ts
const table = defineScript({
  start: (night) => {
    let version = night.pick('cornerTable', {music: 0.5, cards: 0.3, couple: 0.2});

    return (
      version !== 'music' ? version
      : isWithin(night, GUITARIST) ? 'guitarist'
      : 'table'
    );
  },
  nodes: {
    // Music night: guitarist, song, table, welcomed, brushedOff and spilled, as today.
    cards: {
      speaker: TABLE,
      text: standIn`Four strangers play cards for small money, and a fifth chair is empty…`,
      choices: [
        {
          text: 'Sit in for a hand',
          price: 50,
          minutes: 15,
          odds: (night) => (getDrunkenness(night) >= 3 ? 0.3 : 0.5),
          next: ({roll}) => (roll?.won ? 'won' : 'lost'),
        },
        {text: 'Watch a while'},
      ],
    },
    won: {
      speaker: TABLE,
      text: standIn`…the pot is yours…`,
      onEnter: (night) => {
        night.money += 100;
        findStory(night, CARDS_STORY);
      },
    },
    lost: {speaker: TABLE, text: standIn`…the fifty is gone…`},
    couple: {
      speaker: TABLE,
      text: standIn`A couple at the corner table argue in whispers…`,
      choices: [{text: 'Listen in', minutes: 10, next: 'listened'}, {text: 'Leave them to it'}],
    },
    listened: {
      speaker: TABLE,
      text: standIn`…`,
      onEnter: (night) => {
        findStory(night, COUPLE_STORY);
      },
    },
  },
});
```

Music night is today's table unchanged: the guitarist from 22:00 to 01:00 and the strangers with a
spare chair at other hours, with their three stories. Cards night and the couple last all night. The
label of the hand reads `Sit in for a hand  15 min  50 Kč  50%`, or `30%` at three drinks, by the
label rules of actions with costs; a won hand adds 100 Kč in its entry effect, so the hand nets 50.
Two new titles: `The hand that paid for a round` and `The argument in whispers`.

### The events on arrival (`namestiRepubliky/stop.ts`, `malinovskehoNamesti/stop.ts`, `hlavniNadrazi/forecourt.ts`)

A stop's description becomes a script with a `start` that picks the version and the nodes of each
event. Náměstí Republiky:

```ts
const description = defineScript({
  start: (night) => {
    let event = night.pick('republikyArrival', {none: 0.5, wallet: 0.25, drunk: 0.25});

    return event === 'none' || hasMet(night, event) ? 'stop' : event;
  },
  nodes: {
    stop: {speaker: PLACE_NAME, text: standIn`…the description as today…`},
    wallet: {
      speaker: BENCH,
      text: (night) => standIn`A wallet lies on the bench… ${getWalletMoney(night)} Kč in notes…`,
      onEnter: (night) => {
        meet(night, 'wallet');
      },
      choices: [
        {
          text: 'Keep the money',
          onChoose: (night) => {
            night.money += getWalletMoney(night);
          },
          next: 'kept',
        },
        {text: 'Leave it', next: 'stop'},
      ],
    },
    kept: {
      speaker: BENCH,
      text: standIn`…`,
      onEnter: (night) => {
        findStory(night, WALLET_STORY);
      },
      next: 'stop',
    },
    drunk: {
      speaker: DRUNK,
      text: standIn`A man with a bottle insists you drink with him…`,
      onEnter: (night) => {
        meet(night, 'drunk');
      },
      choices: [
        {text: 'Drink with him', minutes: 10, drinks: 1, next: 'drank'},
        {text: 'Refuse', next: 'stop'},
      ],
    },
    drank: {
      speaker: DRUNK,
      text: standIn`…`,
      onEnter: (night) => {
        findStory(night, DRINK_STORY);
      },
      next: 'stop',
    },
  },
});
```

The rules this follows, for every event:

- **The version is picked with `pick`,** one table per stop with `none` among the names. The odds
  are the author's.
- **The event marks itself in its entry effect.** `start` has no side effects: the checker runs it
  on thousands of nights and must not change them. The key is the node's id.
- **Every path ends at the plain description,** through `next: 'stop'` on the outcome nodes and on
  the refusing choice. The author may end a path without it.
- **The refusing choice costs nothing,** which is the rule every node with choices already follows,
  and the checker holds the description to it as it holds every node.
- **An event may read the hour.** The fight happens only from 22:00: before that the `start` returns
  `'stop'` without marking anything, so a later arrival that night still meets it.
- **Effects are the existing ones.** Money, minutes, drinks and odds through the choice's fields, a
  gain through `night.money +=` in an effect, a story through `findStory`. The wallet's money is a
  number drawn where it is used, as the Variation row says:
  `100 + 100 * Math.floor(night.random('walletMoney') * 3)`, so it is 100, 200 or 300 Kč by the
  night, and the text names the amount.

Nothing about the forecourt is special: a player who steps out of the hall meets the event as one
who arrives by tram, and the key keeps it from showing twice.

| Stop                      | Table                                    | Event                                                                                                                                         |
| ------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Náměstí Republiky         | `{none: 0.5, wallet: 0.25, drunk: 0.25}` | **The wallet**: keep the money, 100 to 300 Kč and `The wallet on the bench`, or leave it.                                                     |
|                           |                                          | **The drunk**: drink with him, 10 minutes and one drink and `A drink at the stop`, or refuse.                                                 |
| Malinovského náměstí      | `{none: 0.6, fight: 0.4}`, from 22:00    | **The fight**: step in, 10 minutes with odds of 50%, 30% at three drinks; won, `The fight at the stop`; lost, half an hour more. Or stay out. |
| Hlavní nádraží, forecourt | `{none: 0.6, phone: 0.4}`                | **The phone**: buy it for 200 Kč with odds of 50%; won, `The phone from the forecourt`; lost, a brick. Or walk on.                            |

The texts are stand-in text, marked as such, and the stories' titles too.

### The checker (`core/checkContent.ts`)

- **Every check night's `pick` is the checker's.** Called, it notes the key and the table and
  returns the name at the run's index. A function is run at index 0; if it called `pick`, it runs
  again at index 1, 2 and so on, up to the longest table it saw, minus one. A function that called
  `pick` twice, with tables of two and three names, runs three times, and the two-name table wraps.
  A function that never called it runs once, as today. `withRandom` grows into this: a function that
  read `random` still runs under the six values, at index 0, and one that picked runs under each
  other name with the night's own value of `random`.
- **Bad tables are reported** under the path of the function that used them:
  `rotorBarRoom › The corner table › start: the odds of "cornerTable" sum to 0.9`, when the sum is
  off by more than a billionth, and `…: the odds of "cornerTable" give "couple" 0`, for an odd of 0
  or less.
- **Events.** The fresh night an effect runs on carries the check night's events, its `random` and
  its `pick`. The keys the effects met are gathered as the titles are. The second pass runs with
  every title achieved and every key met, so a `start` that reads `hasMet` is run with none met and
  with all met.
- **The comments** on `checkContent` and over `CHECK_RANDOM` say that versions are met by name, and
  that the six values are for the numbers content draws directly.
- **Time.** A run per name costs runs only where `pick` is called, and the second pass exists. The
  content test stays near its time today; the plan measures it.

### The direction document

- The status line says phase 7's first spec is built and its second designed.
- The Variation row says a version is picked by `night.pick` with a key and the odds of each name, a
  number is drawn with `night.random` where it is used, the checker runs every name of every table,
  and an event met once in a night marks itself on the night.
- The phase 7 paragraph links this spec.

## Error handling

| What goes wrong                                      | In CI                                    | In the running game                                        |
| ---------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| A table's odds do not sum to 1                       | The checker reports it under its path    | The last name takes the rest, or a name is never picked    |
| An odd is 0 or less                                  | The checker reports it                   | That name is never picked                                  |
| A version's node has a mistake                       | Every name is run, so it is reported     |                                                            |
| An event's node forgets `meet`                       | The content test for that stop fails     | The event shows on every arrival                           |
| An evening's visit lies outside Rotor's hours        | The content test fails                   | The friend is offered in a closed bar; never reached       |
| An evening's late visit does not end at the close    | The content test fails                   | The smokers say "came out at closing" too early            |
| A version's hour is not a whole hour                 |                                          | The text reads "22:40"                                     |
| The fight's half hour crosses 08:00                  |                                          | The window finishes and the night ends, as any late action |
| A jump-in lands at a stop whose seed has an event    |                                          | The event shows, as on arrival                             |
| A test pins `pick` to a name the table does not have | The dialogue reports the unknown node id |                                                            |

## Testing

Unit tests, in `tests/`:

- **`night.test.ts`.** `pick` with `random` pinned: 0 and 0.49 give the first name of
  `{a: 0.5, b: 0.3, c: 0.2}`, 0.5 and 0.79 the second, 0.8 and 0.99 the third; the same key gives
  the same name; a table summing just under 1 gives its last name at 0.9999999; `events` starts
  empty, or from the start; `meet` adds a key once; `hasMet`; the whole-object comparison gains
  `pick` and `events`.
- **`hours.test.ts`.** `formatHourWords`: 1380 "eleven", 1200 "eight", 1440 "midnight", 1620
  "three", 1360 "22:40".
- **`checkContent.test.ts`.** A `start` that picks one of three names, the third leading to a node
  with a word over 16 characters, is reported, which proves every name is run; a table summing to
  0.9 and a table with an odd of 0 are reported; a text that throws only when an event is met is
  reported, which proves the second pass carries the keys; a function that never picks runs once,
  counted through a spy.
- **`content.test.ts`.** Every evening's visits lie inside Rotor's hours and the late one ends at
  its close; the back room by the hour on each evening, with `pick` pinned; the bartender and the
  smokers name the evening's hours; the corner table's three versions offer their choices; a won
  hand adds the money and the story, a lost one neither; the couple's story; at each stop, `none`
  gives the plain description and each event its node, the refusing choice leads to the description,
  the taking choice has its effect, and a second opening on the same night gives the plain
  description; the fight before 22:00 is the plain description with nothing met; the checker passes
  on the content.

Browser tests, in `tests/`:

- **`nightScreenQuest.browser.test.ts`.** With a seed whose night picks the sooner evening, found by
  the test among the first few hundred seeds through `createNight`, the back room at 16:30 has the
  friend and the bartender names ten.
- **`nightScreenEvents.browser.test.ts`.** New. A jump-in to Náměstí Republiky with a seed that has
  the wallet: the window shows the wallet and its two choices; Keep the money raises the money in
  the status line by the drawn amount and the toast shows; the description follows; the place's name
  opens the plain description. A seed with `none` opens the plain description at once.

The lessons of the earlier phases' reviews hold for every new test and button.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes, and the checker test stays near its time today.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- `node scripts/list-stand-ins.mjs` lists the new texts.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- Saving the night, Continue, the record of nights and the texts read (spec 3).
- Varying the party's hours, the station, the start time or any opening hours.
- A jump-in parameter for a version or a met event: the author sets a table's odds to 1 while trying
  an event.
- The real text and the real events: the four events and the corner table's two new versions are
  placeholders.
- Changes to Somewhere and to Tellurion.

## Rejected

- **Repeating a name to weight it,** `['none', 'none', 'fight']`. Only fractions with small
  denominators, and the odds are implicit.
- **Weights scaled by their sum,** `{music: 5, cards: 3, couple: 2}`. The real odds are hidden, and
  a typo in one weight silently shifts every other version's odds.
- **Six fixed values of `random` for versions.** A version with small odds in the middle of a table
  is never met.
- **`pick` as a plain function over `random`.** The checker cannot see the table, so it can neither
  run every name nor report bad odds, and a test would pin a hash value instead of a name.
- **Marking an event met in `start`.** The checker runs `start` on thousands of nights; a `start`
  with effects would change them.
- **Booleans by name for the events,** as the quest's flags. Every event would edit `core/night.ts`;
  the quest's shape fits four fixed threads, not a growing list.
- **The event in the journey's script.** A second journey would repeat it, the text would show over
  black before the stop appears, and the event would live in `journeys.ts` instead of the stop's
  file.
- **An event in a span of hours without a key.** A journey out and back within the span would repeat
  the effect.
- **Finding the event's text in the log to know it was met.** A text is not an identity.
- **The party's hours moving with the friend's.** The invitation names the party; the friend's
  comings and goings are theirs.
