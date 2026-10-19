# The quest's threads (Foam phase 6, spec 2 of 3): design

Date: 2026-10-19. App: `apps/foam`. Status: designed, not yet planned. It is the second of phase 6's
three specs in the [direction document](../../direction.md). It builds on spec 1,
[stories](2026-10-19-stories-design.md), which is built before this one, and on phase 5's
[locations and hours](2026-10-10-locations-and-hours-design.md) and
[actions with costs](2026-10-09-actions-with-costs-design.md). Spec 3, the endings and sleep,
follows.

## Background

After spec 1 the night has stories but no reason: the player arrives by train at 16:00 with 350 Kč
and wanders. The night's state holds the clock, the money, the place, the drunkenness, the last
roll, the log and the stories; nothing in it can remember what the player set out to do.

The direction document's phase 6 row gives the night a quest with three threads: a friend who has
the keys to a bed in Brno, a bottle promised for a birthday, and the morning train home. The night
ends well with the keys or with a ticket, and the endings are spec 3. This spec builds the threads:
where they are set up, where they are advanced, what they cost, and what the night remembers.

The brainstorm of 2026-10-19 sent the first proposal to a review that simulated nights with the real
minutes, prices and hours. Four of its findings shape this spec:

- **The keys could not fail.** The friend was reachable 7 of 16 hours, every place hinted, and a
  failed roll was re-rolled for the price of a press. So a failed search costs an hour.
- **The friend and the bottle sat in one room.** The friend's first window moves to Rotor's room;
  the bottle stays at The Whisky Shop; the birthday is at Rotor. Three legs, a closing to beat.
- **The ticket was never worth buying** against free keys. With the hour-costing search, a player
  without the keys at 20:00 faces a real question: keep 300 Kč for the machine, or spend it and
  gamble on Rotor at 23:00.
- **Nothing passed time after the threads were done.** That is spec 3's sleep.

Three things shape the rest:

- **The threads are content.** They are scripts in the places that exist, written as the places are
  written: a spot whose `start` branches on the hour, as the guitarist's table does, a choice with a
  price that greys out when the player is broke, a roll with odds that fall with the drinks.
- **The night remembers with plain fields.** Four booleans on the night, written in a choice's
  effect or a node's entry effect and read by a function `start` or `next`. No flag store.
- **The numbers are the author's.** The friend's hours, the party's hours, the prices and the cost
  of a failed search are named constants in one file, so you tune them without touching the places,
  and phase 7's seed can vary them.

## Decisions (from brainstorming)

1. **Three threads in one night,** chosen by the author over a pool of quests or one quest: the
   keys, the bottle and the ticket, each set on the train, none forced.
2. **The friend is in Rotor's room twice by the hour:** 17:00 to 20:00, setting up for the birthday,
   and 23:00 until the bar closes at 03:00. Between, nowhere the player can go.
3. **The search rolls and a failure costs an hour.** The odds fall with the drinks. Found, the keys
   change hands and the friend stays; a second visit is a chat.
4. **Hints by the hour,** through the people that exist, by hand: the bartender, the smokers, the
   shopkeeper. Hints never read the bottle or the ticket.
5. **The bottle is sold at The Whisky Shop** for 250 Kč, greyed out when the player cannot pay, and
   handed over at the birthday in Rotor's room from 20:00 to 01:00. Drunk enough, the player opens
   it on the spot; the promise is kept either way.
6. **A ticket machine in the hall** sells the ticket for 300 Kč at any hour. No closing time: the
   hour-costing search is tension enough.
7. **`night.quest` holds four booleans:** `hasBottle`, `bottleGiven`, `hasKeys`, `hasTicket`.
8. **The constants live in `content/quest.ts`.**
9. **The checker enumerates the sixteen quest states,** on both collections of spec 1.
10. **The jump-in takes `quest=`,** a list of the flags to start with.
11. **Two stories of the quest's own:** the keys, and the birthday.

## Design

### What the player sees

1. The night starts on the train at 16:00 with 350 Kč. The carriage has two new things: the bag,
   which holds the friend's note, "Keys are with me. Find me, I'm out.", and the invitation to a
   birthday at Rotor Bar tonight with a bottle promised; and the timetable, which says the train
   home leaves the main station at 08:04 and a ticket costs 300 Kč. The description says, in one
   sentence, that the night is the player's.
2. At Rotor's room a new spot, the back room, is where the friend is. From 17:00 to 20:00 and from
   23:00 to 03:00 it offers `Look for them  10 min  70%`; the odds read 40% at three drinks or more.
   Won, the keys change hands, the story "The keys" is achieved, and the back room becomes a chat
   for the rest of the night. Lost, an hour is gone and the text says so. Before 17:00 and between
   20:00 and 23:00 the back room is empty and the text says when the friend is expected.
3. The bartender at Rotor's bar, the smokers on Dvořákova and the shopkeeper at The Whisky Shop each
   offer `Ask after your friend`, free, with an answer that depends on the hour: not yet, in the
   back room, gone till eleven, bought a bottle this afternoon and said something about Dvořákova.
4. The shelves at The Whisky Shop offer `Buy the bottle for the birthday  250 Kč` while the shop is
   open and the player has none. Broke, it is greyed out. Bought, the bag holds it and the choice is
   gone.
5. At Rotor's room a second new spot, the long table, is the birthday. Before 20:00 it is being
   laid; from 20:00 to 01:00, with the bottle, it offers `Hand over the bottle`, and the hand-over
   achieves "The birthday"; at three drinks or more the bottle is opened on the spot and the text
   tells it; without the bottle the table is a party the player is not quite part of; after 01:00 it
   is glasses and a tablecloth.
6. In the main station's hall a new spot, the ticket machine, offers `Buy a ticket home  300 Kč` at
   any hour, greyed out when the player cannot pay. Bought, the machine shows the ticket in the
   pocket.
7. The night goes on as before. The Morning text is still phase 5's single text until spec 3.
8. `?place=rotorBarRoom&time=20:30&quest=bottle` starts at the party with the bottle in the bag.

What does not change: the travel window, the map, the hours of the locations, the closings, the log,
the status line, the stories' toast and window.

### Files

| File                                                  | Change                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `source/game/core/night.ts`                           | `Quest`, `quest` on the night, `createNight` reads `start.quest`        |
| `source/game/core/checkContent.ts`                    | Check nights over the sixteen quest states                              |
| `source/game/core/getJumpIn.ts`                       | `quest=`                                                                |
| `source/game/content/quest.ts`                        | New. The spans, the prices, the cost of a failed search, the two titles |
| `source/game/content/locations/train/train.ts`        | The bag and the timetable; one sentence in the description              |
| `source/game/content/locations/rotorBar/room.ts`      | The back room, the long table, the bartender's hint                     |
| `source/game/content/locations/rotorBar/street.ts`    | The smokers' hint                                                       |
| `source/game/content/locations/whiskyShop/room.ts`    | The bottle on the shelves, the shopkeeper's hint                        |
| `source/game/content/locations/hlavniNadrazi/hall.ts` | The ticket machine                                                      |
| `scripts/list-stand-ins.mjs`                          | Counts `quest.ts`                                                       |
| `tests/nightScreenHelpers.tsx`                        | A helper that starts a night from a jump-in with quest flags            |

### The night (`core/night.ts`)

```ts
export type Quest = {
  /** The bottle for the birthday is in the bag. */
  hasBottle: boolean;

  /** The bottle was handed over at the birthday. */
  bottleGiven: boolean;

  /** The friend gave the player the keys. */
  hasKeys: boolean;

  /** A ticket for the morning train is in the pocket. */
  hasTicket: boolean;
};

export type Night = {
  …
  /** What the night has done about its three threads; content writes it in effects. */
  quest: Quest;
};
```

`createNight` starts every flag false, or from `start.quest` when the start names one, as the
jump-in does:
`{...{hasBottle: false, bottleGiven: false, hasKeys: false, hasTicket: false}, ...start.quest}`. The
whole-object test gains the field.

### The constants (`content/quest.ts`)

```ts
/** The friend is in Rotor's back room from 17:00 to 20:00. */
export const FRIEND_EARLY: Span = [1020, 1200];

/** And again from 23:00 until the bar closes. */
export const FRIEND_LATE: Span = [1380, 1620];

/** The birthday at Rotor's long table. */
export const PARTY: Span = [1200, 1500];

export const BOTTLE_PRICE = 250;
export const TICKET_PRICE = 300;

/** The minutes a failed search for the friend costs, on top of the choice's own. */
export const SEARCH_HOUR = 60;

export const KEYS_STORY = standIn`The keys`;
export const BIRTHDAY_STORY = standIn`The birthday`;

/** Whether the friend is in the back room now. */
export function isFriendIn(night: Night): boolean {
  return isWithin(night, FRIEND_EARLY) || isWithin(night, FRIEND_LATE);
}
```

The start money stays in `nightStart`, 350 Kč, so the bottle leaves 100 and the ticket 50: the
player affords one of them, not both, and the keys cost nothing but hours. `FRIEND_LATE` ends with
Rotor's hours, so the closing and the friend's leaving are one close. The content test checks that
the three spans lie inside Rotor's hours in the data.

### The train (`content/locations/train/train.ts`)

Two spots join the window, the passenger and the door, at positions the overlap test accepts:

- **The bag**, one script of one node of two pages: the note, then the invitation. The note gives
  the keys and "Find me, I'm out", no place; the invitation gives the birthday, Rotor Bar, tonight,
  and the bottle promised.
- **The timetable**, one node: the 08:04 train from the main station, and the price of a ticket,
  read from `TICKET_PRICE`.

The description gains one sentence: the night is the player's until the morning.

### The friend (`content/locations/rotorBar/room.ts`)

A new spot, the back room, with the script `backRoom`:

```ts
start: (night) => (night.quest.hasKeys ? 'chat' : isFriendIn(night) ? 'there' : 'away'),
nodes: {
  there: {
    speaker: BACK_ROOM,
    text: standIn`…the room is full and your friend is somewhere in it…`,
    choices: [
      {
        text: 'Look for them',
        minutes: 10,
        odds: (night) => (getDrunkenness(night) >= 3 ? 0.4 : 0.7),
        next: ({roll}) => (roll?.won ? 'found' : 'missed'),
      },
      {text: 'Not now'},
    ],
  },
  found: {
    speaker: BACK_ROOM,
    onEnter: (night) => {
      night.quest.hasKeys = true;
      findStory(night, KEYS_STORY);
    },
    text: standIn`…the keys change hands…`,
  },
  missed: {
    speaker: BACK_ROOM,
    onEnter: (night) => {
      night.minutes += SEARCH_HOUR;
    },
    text: (night) => standIn`…an hour gone…${isFriendIn(night) ? '' : ' and the back room has emptied'}`,
  },
  away: {
    speaker: BACK_ROOM,
    text: (night) => standIn`…${night.minutes < FRIEND_EARLY[0] ? 'not yet' : 'back at eleven'}…`,
  },
  chat: {speaker: BACK_ROOM, text: standIn`…`},
},
```

The label reads `Look for them  10 min  70%`, or `40%` at three drinks or more, through the label
rules of actions with costs. The roll runs on the press, before the choice's minutes; `missed` adds
the hour on entry, as `spilled` adds ten minutes today, so the clock moves by 70 on a failure. A
failure at 02:30 lands at 03:40, after the bar's close; the window finishes, the closing runs, and
the player is on Dvořákova. Found, the friend stays in the back room for the rest of their hours:
`chat` is the text until the night ends.

### The hints (`rotorBar/room.ts`, `rotorBar/street.ts`, `whiskyShop/room.ts`)

The bar, the smokers and the shopkeeper each gain a free choice `Ask after your friend` that leads
to a node whose text is a function of the hour:

| Who            | Before 17:00                                                                                                            | 17:00 to 20:00      | 20:00 to 23:00                  | From 23:00       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------- | ---------------- |
| The bartender  | not yet                                                                                                                 | in the back room    | left at eight, back at eleven   | in the back room |
| The smokers    | not seen                                                                                                                | went in a while ago | out, said something about later | went back in     |
| The shopkeeper | bought a bottle this afternoon, said something about Dvořákova; the shop is open 16:30 to 21:00, so the one text serves |

The node ends through its text. Hints read the hour and `hasKeys` only: with the keys, each says the
friend is wherever they are and nothing more. They never read the bottle or the ticket, which keeps
their branches to one axis.

### The bottle (`whiskyShop/room.ts`)

The shelves' node gains a choice before the dram and the good one:

```ts
{
  text: 'Buy the bottle for the birthday',
  price: BOTTLE_PRICE,
  isVisible: (night) => !night.quest.hasBottle,
  onChoose: (night) => {
    night.quest.hasBottle = true;
  },
  next: 'wrapped',
},
```

`wrapped` is a node of text: the bottle in the bag. The label reads
`Buy the bottle for the birthday  250 Kč`; the window greys it out below 250, by the Costs row.
Bought, the choice is gone and the shelves offer the drams as before.

### The birthday (`rotorBar/room.ts`)

A new spot, the long table, with the script `longTable`:

```ts
start: (night) =>
  !isWithin(night, PARTY)
    ? night.minutes < PARTY[0] ? 'laid' : 'over'
    : night.quest.bottleGiven ? 'thanked'
    : night.quest.hasBottle ? 'withBottle'
    : 'withoutBottle',
nodes: {
  withBottle: {
    speaker: LONG_TABLE,
    text: standIn`…`,
    choices: [
      {
        text: 'Hand over the bottle',
        onChoose: (night) => {
          night.quest.bottleGiven = true;
        },
        next: (night) => (getDrunkenness(night) >= 3 ? 'opened' : 'given'),
      },
      {text: 'Keep it for now'},
    ],
  },
  given: {speaker: LONG_TABLE, onEnter: (night) => findStory(night, BIRTHDAY_STORY), text: standIn`…`},
  opened: {speaker: LONG_TABLE, onEnter: (night) => findStory(night, BIRTHDAY_STORY), text: standIn`…opened on the spot…`},
  withoutBottle: {speaker: LONG_TABLE, text: standIn`…`},
  thanked: {speaker: LONG_TABLE, text: standIn`…`},
  laid: {speaker: LONG_TABLE, text: standIn`…`},
  over: {speaker: LONG_TABLE, text: standIn`…`},
},
```

`hasBottle` stays true after the hand-over, so the shelves never offer a second bottle, and the
ending reads `bottleGiven` for the promise kept and `hasBottle && !bottleGiven` for a bottle carried
all night. The same title on `given` and `opened` is one story told two ways, as spec 1 allows.

### The ticket machine (`hlavniNadrazi/hall.ts`)

A new spot in the hall, with the script `machine`:

```ts
start: (night) => (night.quest.hasTicket ? 'ticketed' : 'machine'),
nodes: {
  machine: {
    speaker: MACHINE,
    text: standIn`…`,
    choices: [
      {
        text: 'Buy a ticket home',
        price: TICKET_PRICE,
        onChoose: (night) => {
          night.quest.hasTicket = true;
        },
        next: 'bought',
      },
      {text: 'Walk away'},
    ],
  },
  bought: {speaker: MACHINE, text: standIn`…the 08:04…`},
  ticketed: {speaker: MACHINE, text: standIn`…the ticket in your pocket…`},
},
```

The hall never closes, so the machine sells at any hour. The label reads
`Buy a ticket home  300 Kč`.

### The checker (`core/checkContent.ts`)

The check nights gain a third axis beside the time and the level: the quest state, every one of the
sixteen combinations of the four flags. With spec 1's two collections, a script is checked on 2 × 16
× 1050 nights, 33,600. The roll loop of a choice with odds and a function `next` runs 100 rolls on
each, so the content's handful of such choices cost a few million calls; the plan measures the
content test and it must stay under a few seconds. Nothing else changes: every start, text, next,
odds, visibility and effect runs on every night, so `away`, `there`, `chat`, `laid`, `over`,
`withBottle`, `withoutBottle`, `thanked`, `machine` and `ticketed` are each reached on some night
and checked.

### The jump-in (`core/getJumpIn.ts`, `routes/_index.tsx`)

`quest=` takes a comma-separated list of `keys`, `bottle`, `given` and `ticket`, in any order, and
sets the matching flags on the start; `createNight` reads them. A name that is not one of the four
is ignored with a warning naming it. As for every parameter, a valid `place` is needed.
`?place=hlavniNadraziHall&time=07:50&quest=ticket` is spec 3's first check.

### The stand-ins (`scripts/list-stand-ins.mjs`)

The script counts `content/quest.ts` with the journeys and the end, so the two titles are listed;
the places' new texts are counted in their folders as today. The count rises from spec 1's 76 by
about 35.

## Error handling

| What goes wrong                                             | In CI                                        | In the running game                                                       |
| ----------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| A span of the quest lies outside Rotor's hours in the data  | The content test fails                       | The friend or the party is offered in a closed bar; never reached         |
| The search's failure lands after the close                  |                                              | The window finishes, the closing runs, the player is outside, as today    |
| The player is broke at the shelves or the machine           |                                              | The choice is greyed out and takes no press                               |
| The player holds the keys and buys a ticket, or the reverse |                                              | Both flags true; spec 3's Morning text offers the choice                  |
| The player opens the bottle at the party at three drinks    |                                              | `bottleGiven` true, the story achieved; the ending reads the promise kept |
| A jump-in names an unknown flag                             |                                              | A warning; the other flags apply                                          |
| An effect writes a flag the checker's night does not have   | Not possible: every check night has the four |                                                                           |

## Testing

Unit tests, in `tests/`:

- **`night.test.ts`.** A new night has every flag false; a start with flags keeps them; the
  whole-object comparison gains the field.
- **`content.test.ts`.** The three spans lie inside Rotor's hours in the data; the back room's start
  by the hour and by the keys; the search's roll won sets the keys and achieves the story, lost adds
  the hour; the shelves' bottle sets the flag and is hidden after; the long table's start by the
  hour and the flags, and the opened branch at three drinks; the machine's start by the ticket; the
  hints' texts by the hour; the game's content gives the empty list.
- **`checkContent.test.ts`.** A text that throws only with the keys is reported, which proves the
  quest states run.
- **`getJumpIn.test.ts`.** `quest=keys,ticket` gives the two flags; an unknown name warns and is
  ignored; the order does not matter.
- **`listStandIns.test.ts`.** `quest.ts` is counted.

Browser tests, in `tests/`, on the game's content through jump-ins, as the jump-in suite does:

- **`nightScreenQuest.browser.test.ts`.** New. At Rotor's room at 17:30 the back room offers the
  search with its odds in the label; with the night's random pinned to win, the keys toast appears
  and the back room reads as a chat afterwards; pinned to lose, the status line shows the hour gone.
  At 20:30 the back room is away. At the shop at 17:00 with 100 Kč the bottle is greyed out; with
  350 it is bought, the status drops to 100 and the choice is gone. At Rotor at 20:30 with
  `quest=bottle` the long table offers the hand-over and the birthday toast appears; with
  `quest=bottle&drunkenness=3` the opened text shows. In the hall the machine sells the ticket and
  reads it back. The bartender's answer changes with the hour.

The lessons of the earlier phases' reviews hold for every new test and button.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes, and the content test runs in a few seconds at most.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- `node scripts/list-stand-ins.mjs` lists `quest.ts` and the new texts.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- The endings and the sleep choices (spec 3). Until then the Morning text is phase 5's.
- A pool of quests or a seed (phase 7).
- The friend's name and the real text (the author's).
- Hints that read the bottle or the ticket.
- A closing time for the ticket machine.
- Changes to Somewhere and to Tellurion.

## Rejected

- **A pool of three quests, one drawn per night,** and **the keys alone**: the author chose all
  three in one night.
- **One chain, the friend holding the ticket.** The author chose the keys and the train as two ways
  to end the night.
- **The friend at The Whisky Shop first.** One counter would have held the friend and the bottle;
  the review's timeline D did the quest in two presses in one room.
- **A free failed search.** With presses free and the friend reachable 7 of 16 hours, the keys could
  not be failed and the ticket was never worth buying.
- **The ticket machine closing at 22:00.** A machine at any hour is what a station has; the
  hour-costing search is tension enough.
- **A flag store or a quest API.** Four booleans and the effects that exist.
- **Hints branching on the hour and every flag.** Five places by three hours by two flags by two
  would be sixty texts; one axis each.
- **Representative quest states in the checker** instead of all sixteen: the states are few enough
  to enumerate, and a missed pair would be the one that breaks.
