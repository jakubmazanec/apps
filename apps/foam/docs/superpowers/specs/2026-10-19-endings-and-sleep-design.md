# The endings and sleep (Foam phase 6, spec 3 of 3): design

Date: 2026-10-19. App: `apps/foam`. Status: implemented by
[2026-10-21-endings-and-sleep.md](../plans/2026-10-21-endings-and-sleep.md). It is the last of phase
6's three specs in the [direction document](../../direction.md). It builds on spec 2,
[the quest's threads](2026-10-19-quest-threads-design.md), which is built before this one, and on
phase 5's [end of the night and log](2026-10-10-end-of-the-night-and-log-design.md). It closes the
first prototype: one whole night.

## Background

After spec 2 the night has its three threads, and the night's state remembers what the player did
about them. Two things are missing:

- **The Morning text is phase 5's single text.** Whatever the night did, it reads the money and
  ends. The phase 5 spec reserved this: "Phase 6 replaces it with the quest's endings, which may
  branch through a function `start` on the night."
- **Nothing passes time.** The review of the quest simulated the night with the real minutes: the
  keys can be in hand at 17:07 and every thread done by 20:05, and from 03:00 to 08:00 nothing in
  the game is open. The only free clocks are Rotor's spare chair, the shelter's question and
  walking; the game has no wait on purpose. Five hours of nothing is fifty taps of two walking
  texts, every night.

The direction document's phase 6 row says the night ends well in two ways, with the keys or with a
ticket, or badly, and that the player may sleep the rest of it away. Its Hours row says the night
ends when the clock reaches 08:00 and the action that crosses it finishes first; this spec keeps
that and adds the choice that moves the clock there.

Three things shape this spec:

- **The ending is read from the four flags alone.** Not from the place, not from the money: a tram
  arriving at 08:07 writes the place before the end check, and a rule on the money would take 300 Kč
  in an effect the player never pressed. The ticket, then the keys, then stranded.
- **Holding both is the player's call.** Keys and a ticket together give two choices in the Morning
  text, which spec 4 of phase 5 allowed for.
- **Sleep is a choice that sets the clock to 08:00.** The clock reaches 08:00, the action that
  crosses it finishes first, the Morning text follows: exactly the Hours row, no engine change, one
  line in the log.

## Decisions (from brainstorming)

1. **Three endings:** leave, with a ticket; stay, with the keys; stranded, with neither. The order
   is the ticket, then the keys.
2. **Both flags give a choice:** `Take the train` or `Stay`, in the Morning text, each leading to
   its ending.
3. **A line on the bottle in every ending:** handed over, carried all night, or never bought.
4. **Sleep where it is written:** the hall's benches, Židenice's bench and the shelter at Náměstí
   Republiky, and, with the keys, `Walk to the flat and sleep` in every outdoor way out.
5. **The Morning text may count the stories,** since spec 1 keeps the night's list.

## Design

### What the player sees

1. The night runs as spec 2 left it.
2. At 23:40 on Dvořákova, with the keys in the pocket, the street's way out offers Walk, Take a
   taxi, `Walk to the flat and sleep` and Stay. The sleep choice opens one page, the flat at night;
   the status line jumps to 08:00; the window closes to black and the Morning text opens: the stay
   ending, with a line on the bottle and the night's stories. Then the Stories window and the log,
   as spec 1 has them. The log reads `23:40  Walk to the flat and sleep`, then the flat's page at
   08:00, then Morning at 08:00.
3. Without the keys, the hall's benches offer `Doze till the first train` at any hour, and the bench
   at Židenice and the shelter at Náměstí Republiky offer `Sleep it off` with the choices they have.
   Each opens one page and moves the clock to 08:00.
4. At 08:00, however reached, the Morning text branches: with a ticket, the leave ending, on the
   08:04 train; with the keys and no ticket, the stay ending; with neither, the stranded ending.
   With both, the Morning text is one page and two choices, `Take the train` and `Stay`, and the
   chosen ending follows.
5. Every ending ends through its text and the night goes to the Stories window and the log.

What does not change: the end check, the log screen, the stories, the quest's threads, the hours.

### Files

| File                                                     | Change                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `source/game/core/hours.ts`                              | `sleepTillMorning`                                                  |
| `source/game/core/createWayOut.ts`                       | The flat choice, visible with the keys                              |
| `source/game/content/nightEnd.ts`                        | The four nodes and the function `start`; the bottle line; the count |
| `source/game/content/locations/hlavniNadrazi/hall.ts`    | The benches                                                         |
| `source/game/content/locations/zidenice/zidenice.ts`     | The bench's sleep choice                                            |
| `source/game/content/locations/namestiRepubliky/stop.ts` | The shelter's sleep choice                                          |

### Sleep (`core/hours.ts`, `core/createWayOut.ts`, three places)

```ts
/** Moves the clock to the end of the night: the night is over once the window closes. */
export function sleepTillMorning(night: Night): void {
  night.minutes = NIGHT_END;
}
```

The level of drunkenness falls with the clock as it does for any minutes, so the player wakes sober
or nearly. The choice carries no `minutes` field and shows no number in its label: it costs the rest
of the night, which the text says.

**With the keys, from any outdoor place.** Every outdoor way out is built by `createWayOut`, so the
helper gains the choice once, between the ways and Stay:

```ts
{
  text: 'Walk to the flat and sleep',
  isVisible: (night) => night.quest.hasKeys,
  onChoose: sleepTillMorning,
  next: {speaker: 'The flat', text: standIn`…`},
},
```

The target is an inline node of one page, the flat at night, and the way out's script keeps its one
named node. The checker's way-out run sees an effect that sets no `leaving` and returns.

**Without the keys, in three places.** The hall gains a spot, the benches, whose node offers
`Doze till the first train` and `Stay on your feet`; Židenice's bench gains `Sleep it off` beside a
free `Leave him to it`; the shelter at Náměstí Republiky gains `Sleep it off` beside the choices it
has. Each sleep choice calls `sleepTillMorning` and leads to a node of one page. Three places, one
indoors that never closes and two outdoors, so a stranded player is never far from one: the hall is
a door from the forecourt, and the shelter is four minutes from the shop.

The log shows the choice at its minute and the page at 08:00, because the effect runs before the
page is shown. The end check runs when the window closes, finds the night over, takes the scene to
black and opens the Morning text, as for any window that crosses 08:00.

### The endings (`content/nightEnd.ts`)

```ts
export const nightEnd = defineScript({
  start: ({quest}) =>
    quest.hasTicket && quest.hasKeys ? 'both'
    : quest.hasTicket ? 'leave'
    : quest.hasKeys ? 'stay'
    : 'stranded',
  nodes: {
    both: {
      speaker: 'Morning',
      text: standIn`…a ticket in one pocket and the keys in the other…`,
      choices: [
        {text: 'Take the train', next: 'leave'},
        {text: 'Stay', next: 'stay'},
      ],
    },
    leave: {
      speaker: 'Morning',
      text: (night) => standIn`…the 08:04…${bottleLine(night)}${storiesLine(night)}`,
    },
    stay: {
      speaker: 'Morning',
      text: (night) => standIn`…the flat…${bottleLine(night)}${storiesLine(night)}`,
    },
    stranded: {
      speaker: 'Morning',
      text: (night) => standIn`…${bottleLine(night)}${storiesLine(night)}`,
    },
  },
});
```

`bottleLine` returns one of three sentences from `quest.bottleGiven`, `quest.hasBottle` and neither;
`storiesLine` reads `night.stories.length`: none, one, or the count. Both are functions in the file,
stand-in like the rest. The texts stay within the stand-in limits: two or three sentences a page,
every node sets `speaker`, the marks in pairs.

`both` is a node with choices, so by the way-out rule it offers one that costs nothing; both do. The
leave text reads as the player on the platform wherever they slept, and the stay text as the player
at the flat; the texts are written so that either holds whether the night ended at 08:00 on its own
or through a sleep choice.

The checker reaches all four nodes through `start` on the sixteen quest states of spec 2: `both` on
the states with both flags, `leave` with the ticket alone, `stay` with the keys alone, `stranded` on
the rest. The content test asserts the four routes.

### The direction document

With this spec the direction document's Hours row gains that a sleep choice moves the clock to
08:00, and the phase 6 list marks the three specs designed.

## Error handling

| What goes wrong                                              | In CI                                               | In the running game                                                       |
| ------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
| A sleep choice is pressed at 07:59                           |                                                     | The clock moves one minute; the night ends as it would have               |
| A sleep choice is pressed after 08:00 (a jump-in at 08:00)   | Not possible: the night ends after the first window |                                                                           |
| The flat choice is visible without the keys                  | The content test fails                              |                                                                           |
| `both` lacks a free choice                                   | The checker reports no way out                      |                                                                           |
| The player holds both and the Morning text's choice is taken |                                                     | The chosen ending; the other is never shown                               |
| The night ends with a travel arriving after 08:00            |                                                     | As phase 5: the travel's text, then the Morning text, from the four flags |
| The bottle was opened at the party                           |                                                     | `bottleGiven` is true: the promise kept                                   |

## Testing

Unit tests, in `tests/`:

- **`hours.test.ts`.** `sleepTillMorning` sets the clock to 08:00 and the level falls accordingly.
- **`createWayOut.test.ts`.** The flat choice is visible with the keys and hidden without; its
  effect ends the night; it sets no `leaving`; the way out keeps its ways and Stay.
- **`content.test.ts`.** The end's start by the flags: ticket to `leave`, keys to `stay`, both to
  `both`, none to `stranded`; the bottle line's three forms; the stories line for none, one and
  several; `both` offers two free choices; the three sleep places offer their choice; the game's
  content gives the empty list.

Browser tests, in `tests/`, on the game's content through jump-ins:

- **`nightScreenEnd.browser.test.ts`.** `quest=ticket` in the hall at 07:50: the beer or the doors
  cross 08:00 and the leave ending shows; `quest=keys` on Dvořákova: the stay ending;
  `quest=keys,ticket`: the Morning text offers Take the train and Stay, and each leads to its
  ending; no flags: stranded. On Dvořákova at 23:40 with `quest=keys` the street's way out offers
  the flat; the press shows the flat's page, the status line reads 08:00, and the log holds the
  choice at 23:40, the page at 08:00 and Morning at 08:00. In the hall at 23:00 without flags the
  benches' doze reaches the stranded ending. Without the keys the flat choice is absent.

The lessons of the earlier phases' reviews hold for every new test and button.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- A whole night can be played from the train to the Stories window and the log by each of the three
  endings.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- The place read in the Morning text (the author may add it when writing the real text).
- A confirmation before sleeping.
- Sleep in a bar: a bar closes, and its closing script puts the player outside.
- A seed, saving the night, Continue (phase 7).
- Changes to Somewhere and to Tellurion.

## Rejected

- **The leave ending read from the place and the money.** A tram arriving after 08:00 writes the
  place first, and a rule on the money takes 300 Kč in an effect the player never pressed; a ticket
  in the pocket at Malinovského would read as stranded.
- **The place deciding between the keys and the ticket.** The player decides, in the Morning text.
- **An end before 08:00.** The Hours row says 08:00; the sleep choice moves the clock there and the
  rule stands.
- **A general wait of an hour.** Spec 3 of phase 5 rejected a wait; five presses from 03:00 and
  nothing for the twelve hours after 20:05.
- **The sleep choice in every place.** Scene buttons do not come and go, and a sleep in a bar fights
  its closing; three places and the flat suffice.
- **The flat as a place.** A new location for one page; the choice's inline node tells it.
- **Four endings for the bottle.** A line composed in the text, not a node per combination.
