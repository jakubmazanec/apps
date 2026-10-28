# The author (Foam phase 8, spec 2 of 2): design

Date: 2026-10-28. App: `apps/foam`. Status: designed; its plan follows once spec 1 is built. It is
the second of phase 8's two specs in the [direction document](../../direction.md). It builds on spec
1, [the phone](2026-10-28-phone-design.md), which is designed.

## Background

After spec 1 the author writes to the player on the phone: a message is a scene with a condition on
the night, it arrives between windows, and the player reads it in the story window and replies
through its choices. The author is a voice. The direction document's principles say he can sometimes
be met in a place as a character, with the avatar Jakub, and nothing of that is built. A place's
buttons are fixed: every spot of a place is a button whenever the place is shown.

This spec puts Jakub in a place for two hours of the night, tells the player where through the
phone, and lets them meet him.

Three things shape this spec:

- **One seat a night, picked by the seed.** The night picks where he sits from three seats with
  their hours, as it picks a scene's version. The invitation names the seat, and the place's button
  follows the same pick, so the message and the place never disagree.
- **A button that appears is a spot with a condition.** A spot gains an optional `isVisible` on the
  night, read whenever the night screen looks at the night, as a choice's `isVisible` is read when
  its node is entered. The button is built with the place as every button is, and hidden or shown
  since; a hidden button leaves the screen and the Tab order. No new kind of button, no rebuild.
- **A meeting is a scene.** Jakub's button opens a script written like any scene's, with the same
  nodes, choices, costs and effects. The first meeting, in any seat, finds one story.

## Decisions (from brainstorming)

1. **Jakub is met through a button labelled "Jakub" that appears in the place during his hours.**
   Reaching him through a button the place already has (the regulars, the bar, the benches) was
   rejected as less visible: a player who read the invitation should see him.
2. **Three seats:** The Whisky Shop's room from 17:00 to 19:00, Rotor's room from 21:00 to 23:00,
   and the main station's hall from 07:00 to the end. The odds are
   `{shop: 0.4, rotor: 0.4, hall: 0.2}`. Every seat lies inside its location's hours: the shop is
   open from 16:30 to 21:00, Rotor to 03:00, and the hall never closes.
3. **The invitation is the tenth message** of the brainstorm, sent at 16:30, in a node per seat.
4. **Each meeting has its own flavour.** At the shop he stands the player a dram; at Rotor he asks
   how the night goes and tells a story from the real bar; at the hall he waits for the same train
   and answers whether any of it was real. No money changes hands at a meeting.
5. **One story, "The author",** found at the first meeting anywhere, once across all nights.
6. **The text is stand-in text,** as spec 1's is. The author's avatar keeps his name: he is the one
   exception to the rule that people have no names, and the files' header comments say so.

## Design

### What the player sees

1. At 16:30 a message arrives: Jakub says where he will be tonight. On one seed: "I'm at The Whisky
   Shop in Husovice from five to seven, by the regulars. No obligation." On another, Rotor's bar
   from nine to eleven; on a third, the hall from seven, the bench under the board. The hours in the
   text are the seat's. Replies: "Maybe", and "Why?", which gets "To see if it works. The game, not
   Brno."
2. At The Whisky Shop at 18:00 on the first seed, the room has a button more than usual: "Jakub".
   Pressing it opens his scene: he looks up from a notebook and pushes a glass across. "Take the
   dram" reads "Take the dram 15 min", costs no money, adds a drink and a quarter of an hour, and he
   says which of the regulars are real. "Ask which bits are real" gets an answer; "Leave him to it"
   ends the window. The toast "A story" over "The author" shows at the first node.
3. A player who walks into the shop at 16:40 and reads the shelves finds the "Jakub" button there
   when the shelves' window closes after 17:00. One who stays past 19:00 sees the button go when
   their next window closes.
4. On the second seed, Rotor's room has the button from 21:00 to 23:00. He asks how the night is
   going, and his words depend on the keys and the bottle. "Ask for a story" costs ten minutes and
   gets one from the real bar; "Say nothing" ends the window.
5. On the third seed, the hall has the button from 07:00. He is on the bench under the board, on the
   same train. "Was any of it real?" gets "The places, every one. The friend is three people. The
   brick is mine." "Say nothing" ends the window.
6. A second meeting, that night or another, finds no story again and shows no toast. The Stories
   window and the Collection list "The author" once.
7. The log shows the meeting's texts under "Jakub" and the replies as choices, as any scene's.
8. A jump-in into the seat's place at the seat's hour, with a seed that picks it, shows the button
   at once under the description.

What does not change: the phone, the other messages, the places' other buttons, the travel window,
the menus, the end and the log.

### Files

| File                                                  | Change                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `source/game/core/place.ts`                           | `isVisible` on `Spot`                                                                       |
| `source/game/screens/nightScreen.ts`                  | `showSpots`: hides and shows the spot buttons by their conditions, on show and on each look |
| `source/game/core/checkContent.ts`                    | A spot's condition run on every check night                                                 |
| `source/game/content/author.ts`                       | New: `AUTHOR`, `AUTHOR_STORY`, `Seat`, `SEATS`, `getSeat`, `isAuthorIn`                     |
| `source/game/content/phone/invitation.ts`             | New: the invitation                                                                         |
| `source/game/content/phone/index.ts`                  | The invitation in the list, after the hello; the sender from `author.ts`                    |
| `source/game/content/locations/whiskyShop/room.ts`    | Jakub's spot and scene                                                                      |
| `source/game/content/locations/rotorBar/room.ts`      | Jakub's spot and scene                                                                      |
| `source/game/content/locations/hlavniNadrazi/hall.ts` | Jakub's spot and scene                                                                      |
| `tests/fixedWorld.ts`                                 | A spot with a condition, for the screen's tests                                             |
| `docs/direction.md`                                   | The status line; the Author row; the phase 8 paragraph                                      |

### A spot's condition (`core/place.ts`)

```ts
export type Spot = {
  …
  /**
   * Offered only while it holds: the night screen reads it when the place is shown and whenever it
   * looks at the night, and hides or shows the button. Absent, the button always shows. It has no
   * side effects: the checker runs it on thousands of nights.
   */
  isVisible?: (night: Night) => boolean;
};
```

### The night screen (`screens/nightScreen.ts`)

```ts
// Hides and shows the place's buttons by their conditions on the night, in place: a hidden button
// keeps its position, leaves the Tab order by itself, and comes back where it was. A button whose
// spot has no condition always shows.
function showSpots(screen: NightScreen): void;
```

It walks the shown place's spots and buttons together and sets `button.view.visible` to
`spot.isVisible?.(night) ?? true`. It runs at the end of `showPlace`, after `layOut`, and in
`actOnNight` after the messages are received and before the way out and the closing, in the branch
where the night's place is the place shown. The buttons are built as today, with every spot, in
`buildPlace`; a place built ahead has every button visible until `showPlace` runs. A focus on a
button that hides moves away as Tellurion's focus does for a hidden view.

### The checker (`core/checkContent.ts`)

A spot's `isVisible`, when it has one, runs on every check night of its place through `withRandom`,
under the path `${id} › ${label} › isVisible`, as a choice's `isVisible` runs: a throw is reported,
a pick in it runs under every name, and a pick in a branch is reported. The result is not read. The
spot's script is checked as today, whether the button would show or not.

### The author (`content/author.ts`)

```ts
/** The author's avatar, the one person in the game with a real name. */
export const AUTHOR = 'Jakub';

export const AUTHOR_STORY = standIn`The author`;

export type Seat = 'hall' | 'rotor' | 'shop';

/** Where the author sits on a night that picks the seat, and his hours there. */
export const SEATS: Readonly<Record<Seat, {place: PlaceId; hours: Span}>> = {
  shop: {place: 'whiskyShopRoom', hours: [1020, 1140]}, // 17:00 to 19:00
  rotor: {place: 'rotorBarRoom', hours: [1260, 1380]}, // 21:00 to 23:00
  hall: {place: 'hlavniNadraziHall', hours: [1860, 1920]}, // 07:00 to the end
};

const SEAT_ODDS = {shop: 0.4, rotor: 0.4, hall: 0.2};

/** The night's seat: the invitation and the three places read it. */
export function getSeat(night: Night): Seat {
  return night.pick('authorTonight', SEAT_ODDS);
}

/** Whether the author is in the place now. */
export function isAuthorIn(night: Night, place: PlaceId): boolean {
  let seat = SEATS[getSeat(night)];

  return seat.place === place && isWithin(night, seat.hours);
}
```

The key `authorTonight` is a contract, as every pick's key is. The phone's files take the sender
from `AUTHOR` in place of their own constant.

### The invitation (`content/phone/invitation.ts`)

Key `invitation`, sender `AUTHOR`, arrives at `night.minutes >= 990`. Its `start` reads `getSeat`
and returns the seat's node, `shop`, `rotor` or `hall`, each with a text that names the place and
its hours through `formatHourWords` on `SEATS[seat].hours`, so a change to the hours changes the
text. Each node offers "Maybe", which ends the window, and "Why?", which leads to `why`: "To see if
it works. The game, not Brno."

### The meetings (`whiskyShop/room.ts`, `rotorBar/room.ts`, `hlavniNadrazi/hall.ts`)

Each file gains a spot `{label: AUTHOR, x, y, script, isVisible: (night) => isAuthorIn(night, id)}`
with the place's own id, and a script whose every node has the speaker `AUTHOR`. The first node's
entry effect calls `findStory(night, AUTHOR_STORY)`. The positions are the plan's to place where no
other button lies on any screen; the content test holds every place's buttons apart.

| Seat  | First node                                                                                                                     | Choices                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shop  | A man with a notebook at the end of the counter says the player's name and pushes a glass across                               | "Take the dram", `minutes: 15`, `drinks: 1`, to a node where he says which regulars are real; "Ask which bits are real", to a node; "Leave him to it", which ends the window |
| Rotor | He asks how the night is going; the text is a function of the quest: keys and bottle given, keys only, bottle only, or neither | "Ask for a story", `minutes: 10`, to a node with one story from the real bar; "Say nothing", which ends the window                                                           |
| Hall  | On the bench under the board, with a ticket for the 08:04                                                                      | "Was any of it real?", to a node: the places every one, the friend three people, the brick his; "Say nothing", which ends the window                                         |

The rules every meeting follows: the first node's entry effect finds the story, never `start`; every
node with choices offers a way out that costs nothing; the dram costs no money, so a broke player
can take it; a text that branches reads the quest or the level, which the checker's nights cover,
never the money.

### The direction document

- The status line says phase 8's two specs are designed.
- An Author row in the decisions: Jakub can be met; the night picks one of three seats with their
  hours; the invitation names it; a place's button may carry a condition on the night and appears
  and goes by it; meeting him gives the story "The author".
- The phase 8 paragraph's second item links this spec.

## Error handling

| What goes wrong                                      | In CI                                        | In the running game                                                    |
| ---------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| A spot's condition throws                            | The checker reports it under the spot's path | `actOnNight` throws inside `onUpdate`'s try: the error screen shows it |
| A seat's hours lie outside its location's hours      | The content test fails                       | The button shows in a room the player cannot be in; never reached      |
| A seat names a place that is not in the content      | The content test fails                       | No button anywhere; the invitation names a place                       |
| The invitation's hours and the seat's differ         |                                              | They cannot: the text reads the seat's hours                           |
| Jakub's button lies on another button on some screen | The content test fails                       | Two buttons overlap                                                    |
| The meeting's window runs past the seat's end        |                                              | The window finishes; the button hides when it closes                   |
| The focus is on the button when it hides             |                                              | Tellurion drops a focus on a hidden view; Tab starts over              |
| A jump-in into the seat's place at its hour          |                                              | The button shows at once, as the arrival events do                     |
| The pick sits in a branch of a condition             | The checker reports it                       | The names the branch skips were never checked                          |

## Testing

Unit tests, in `tests/`:

- **`checkContent.test.ts`.** A spot whose condition throws is reported under
  `zidenice › The door › isVisible`; a condition that picks from a table of three runs under every
  name, counted through a spy; a spot without a condition runs nothing more.
- **`content.test.ts`.** `getSeat` gives each seat over fifty seeds; `isAuthorIn` holds on each
  seat's place from its first minute to the minute before its end and not outside, with `pick`
  pinned, and never in another place; every seat's hours lie inside its location's hours; the
  invitation's node per seat names the seat's hours in words; each meeting's first node offers its
  choices and finds the story on entry; the dram adds a drink and 15 minutes and leaves the money;
  Rotor's text differs by the quest; a second opening on a night that has the story finds nothing;
  the stories count goes up by one; Jakub's button lies on no other button on the three screens,
  which the existing overlap test covers once the spots are in.

Browser tests, in `tests/`:

- **`spots.browser.test.ts`.** New, on the fixed world, which gains a spot "A regular" in the bar
  with `isVisible: (night) => night.minutes >= 1200`: the button is built hidden at 19:40 and Tab
  skips it; two beers take the clock to 20:00, and when the window closes the button is visible and
  takes Enter; a resize keeps it; after a journey out and back it is built visible.
- **`author.browser.test.ts`.** New, on the game's content, with seeds found by `findSeed` through
  `getSeat`: a jump-in to the shop at 18:00 on a shop seed shows "Jakub", the meeting opens, the
  toast reads "A story" over "The author", the dram costs fifteen minutes and a drink on the status
  line; on a Rotor seed the shop has no such button; at Rotor at 22:00 on the Rotor seed it does.

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

- A second seat in one night, or a seat in another place than the three.
- A meeting that changes the quest, the money or a later message.
- Jakub writing about the meeting afterwards.
- A toast or a sound when the button appears: the invitation told the player.
- A long arc across nights, which the direction keeps shelved after phase 8.
- The real text: every message and meeting is a placeholder.
- Changes to Somewhere and to Tellurion.

## Rejected

- **Meeting Jakub through a button the place already has.** Less visible, and the invitation would
  send the player to the regulars to find him.
- **A kind of button of its own for people who come and go.** A spot with a condition is one field
  and no new kind.
- **Rebuilding the place's buttons when a condition changes.** Hiding keeps the positions, the
  z-order under the backdrop and the Tab order; a rebuild would drop a focus and redo every button.
- **A condition read every frame.** The night is looked at between windows, as everything else is.
- **The pick inside each spot's condition.** Three copies of one table; `isAuthorIn` holds it once.
- **Hours written in the invitation's text.** A change to the seat's hours would need the text
  edited too, the loose end phase 7 closed for the friend.
- **A toast when he appears.** A button is not a find.
