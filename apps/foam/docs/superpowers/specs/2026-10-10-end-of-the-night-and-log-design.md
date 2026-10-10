# The end of the night and the log (Foam phase 5, spec 4 of 4): design

Date: 2026-10-10. App: `apps/foam`. Status: designed. It is the last of phase 5's four specs in the
[direction document](../../direction.md). It builds on spec 3,
[locations and hours](2026-10-10-locations-and-hours-design.md), which is built before this one.
Phase 6, the quest, follows.

## Background

Spec 3 leaves a night with hours: locations open and close, people come at certain hours, and the
clock starts at 16:00. But the clock has no end, and the night leaves nothing behind:

- The clock runs on past 08:00. A bar reached after 08:00 reads `closed` on the destination button,
  as any bar after its last span does, a station or a stop reads nothing, the travel is taken, and
  the night goes on.
- Nothing records what the player read or chose. The story window shows a page and forgets it; a
  choice applies its costs and is gone.
- Quit to menu is the only way out of a night.

The direction document's Hours and Journal rows say what this spec builds: the night ends when the
clock reaches 08:00, and the action that crosses it finishes first; a plain log of the night, every
text read and every choice taken, each with its time, is shown page by page on a screen of its own
when the night ends, with a button to the menu on every page.

Three things shape this spec:

- **The night is one run.** 08:00 is the end: not a place, not a closing, and no text waits beyond
  it. What the player takes away is the log.
- **The crossing action finishes first.** The end is noticed where spec 3 notices a closing: when a
  window has closed and nothing lies above the scene. A beer, a travel or a door that crosses 08:00
  is read to its end.
- **The log is what the player read,** in the words and at the time they read it. It is written by
  the window that showed the text, not by the content, so a stand-in text and a real text log the
  same way, and no text function is evaluated twice.

## Decisions (from brainstorming)

1. **08:00 is the end.** The night is over once the clock stands at 08:00 or later (night minute
   1920), noticed when a window has closed. Spec 3's spans end at 08:00 with the end excluded, so
   08:00 reads as closed everywhere.
2. **An end text before the log.** A stand-in script of its own, `content/nightEnd.ts`, opens over
   black after the window that crossed 08:00, as a travel's window does. Phase 6 replaces it with
   the endings.
3. **The end comes first.** The check runs before the move to a new place, a way out and the
   closing. A travel that arrives after 08:00 never shows its destination, and a closing never runs
   on the close that ends the night.
4. **The log is on the night.** `night.log` is a list of entries. A text is logged per page as the
   window shows it, with the window's title and the clock when it appeared; a choice with its label
   as the button read it, numbers included, and the clock before its costs.
5. **The story window writes the log.** It alone knows the page it shows and the moment of a press.
   The night screen logs the one choice made outside a story window: the travel picked in the travel
   window, as `Walk to Rotor Bar  12 min`.
6. **A screen of its own, with the night's frame.** The log screen has the night screen's top row:
   the status line, now final, and the Menu button, which opens the night's menu, as Escape does.
   The window below it is titled "The night" and shows the log page by page, with Back and Next.
7. **Nothing in the travel window.** Spec 3's destination button reads `closed` for a bar after
   08:00 and nothing for a stop; the night's end is not written there.

## Design

### What the player sees

1. The night runs as spec 3 left it until the clock reaches 08:00.
2. The action that crosses 08:00 finishes: a beer ordered at 07:55 types its text to the end, a walk
   that arrives at 08:10 types its arrival. When that window closes, the scene goes to black, and
   the end text opens over it under the title "Morning": two or three sentences, which may read the
   night. The status line stands at the final minute, say `08:05   120 Kč   1.5`.
3. When the end text closes, the log screen replaces the night screen at once; screen changes do not
   fade. The scene is gone: the screen is black.
4. The log screen keeps the night's top row: the status line as it stood at the end, and the Menu
   button. Under it stands one window, as wide as the story window and as tall as the screen allows,
   titled `The night  1 of 12`. It shows the log from its first page:

   ```
   19:40  The bar
   The bartender nods at the taps.

   19:40  Order a beer  10 min  45 Kč

   19:50  The bar
   The beer is cold and the foam is
   thick, and for a while nothing else
   needs doing.

   19:50  The door
   The door lets in the cold and the
   sound of a tram in Dvořákova street.

   19:50  Go out

   19:50  Dvořákova
   The street is …
   ```

   A text is its time and the window's title on one line, and its text under them, italic words
   kept. A choice is one line in italic: its time and its label as the button read it. A travel
   picked in the travel window is a choice too: `20:05  Walk to Rotor Bar  12 min`, and the travel's
   text follows at the minute of arrival under its own title. A blank line separates entries. An
   entry may run over a page's end and go on at the top of the next.

5. Under the text stand Back and Next. Back is greyed out on the first page and Next on the last. A
   page turn replaces the text at once, with no typing and no cursor, and the title counts along.
   Nothing is focused when the screen opens; Tab or an arrow focuses the first button that takes it.
6. Menu, or Escape, opens the night's menu above the window: Resume, Options and Quit to menu. Quit
   to menu shows the main menu, and the log is gone. The music plays on through all of it.
7. A night that starts at or after 08:00 (a jump-in with `time=08:00`) shows its place's description
   and ends when it closes.
8. New Game from the main menu starts a fresh night with an empty log.

What does not change: the travel window, the hours, the closing, the form of the status line, the
story window's look and the fades.

### Files

| File                                  | Change                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `source/game/core/hours.ts`           | `NIGHT_END`, `isNightOver`                                                            |
| `source/game/core/night.ts`           | `log` on the night; `createNight` starts it empty                                     |
| `source/game/core/log.ts`             | New. `LogEntry`, `logText`, `logChoice`, `formatLog`                                  |
| `source/game/core/travel.ts`          | `formatTravel`; the way words move here from the travel window                        |
| `source/game/core/checkContent.ts`    | `Content` gains `end`, checked like the journeys                                      |
| `source/game/content/nightEnd.ts`     | New. The end text                                                                     |
| `source/game/screens/textBlock.ts`    | New. `TextBlock`: the story window's two leaves, regular and italic, as one part      |
| `source/game/screens/storyWindow.ts`  | Logs each page it shows and each choice pressed; its text block becomes a `TextBlock` |
| `source/game/screens/logScreen.ts`    | New. The log screen                                                                   |
| `source/game/screens/nightScreen.ts`  | The end; the travel logged; black on the close of the crossing window                 |
| `source/game/screens/travelWindow.ts` | The way words from `core/travel.ts`                                                   |
| `source/routes/_index.tsx`            | Registers the log screen                                                              |
| `scripts/list-stand-ins.mjs`          | Counts `nightEnd.ts` with the journeys                                                |
| `tests/fixedWorld.ts`                 | The fixed bar's hours end at 08:00                                                    |

### The end (`core/hours.ts`, `screens/nightScreen.ts`)

```ts
/** The minute the night ends: Saturday 08:00. A span's `to` is at most this. */
export const NIGHT_END = 1920;

/** Whether the clock has reached the end of the night. */
export function isNightOver(night: Night): boolean {
  return night.minutes >= NIGHT_END;
}
```

Spec 3's span rule (`to ≤ 1920`) reads the same number; it reads `NIGHT_END`.

The night screen gains `hasEnded: boolean` in its contents, false whenever a night is shown.
`actOnNight` checks the end before anything else:

```ts
function actOnNight(screen: NightScreen): void {
  let {hasEnded, night, place} = screen.contents;

  if (isNightOver(night)) {
    if (hasEnded) {
      logScreen.contents.showLog(night);
      // showScreen never rejects; a failure lands on the error screen.
      void game.showScreen(logScreen);
    } else {
      screen.contents.hasEnded = true;
      leavePlace(screen);
      layOut(screen);
      openStory(screen, nightEnd);
    }

    return;
  }

  // A place the night moved the player to, a way out and the closing, as spec 3 has them.
  …
}
```

The first time the check finds the night over, the place is taken off the screen, as a travel takes
it off, and the end text opens over black. The second time, after the end text has closed, the log
screen takes over; the night screen's `onHide` tears the night down, as it does for Quit to menu.

The crossing window takes the scene to black with it, as a window that changes the place does:
`onClosing` sets `isPlaceChanging` when the night is over as well as when the place changes.
`getNextPlace` returns nothing once the night is over, so `prepareNextPlace` builds no place behind
the crossing window, drops one it had built, and a door that crossed 08:00 leads nowhere. A way out
the night still holds in `leaving` is ignored once the night is over; a way out costs nothing, so
only a jump-in at 08:00 can bring the two together.

The order of `actOnNight` is: the end, a place the night moved the player to, a way out, the
closing. The end comes first so that a travel arriving after 08:00 never shows its destination, and
a location whose hours end at 08:00 never runs its closing script on the close that ends the night.

The check runs after every window, so a jump-in with `time=08:00` or later shows the place's
description and ends when it closes. `getJumpIn` reads a time before noon as the next day, so
`time=08:00` is minute 1920; nothing in it changes.

### The end text (`content/nightEnd.ts`)

```ts
export const nightEnd = defineScript({
  start: {
    speaker: "Morning",
    text: (night) => standIn`
      The sky has gone grey and the first trams of Saturday are full of people who slept.
      Whatever the night was, it is over, and you have ${night.money} Kč left in your pocket.
    `,
  },
});
```

Stand-in text with today's limits. It has no choices: the window ends through its text. The checker
checks it under `end › start`, as it checks a journey's script; `Content` gains `end`.
`list-stand-ins.mjs` counts it with the journeys. Phase 6 replaces it with the quest's endings,
which may branch through a function `start` on the night.

### The log (`core/log.ts`, `core/night.ts`)

```ts
export type LogEntry =
  | {
      kind: "text";

      /** The clock when the page appeared. */
      minutes: number;

      /** The window's title; a page without one has none. */
      speaker: string | undefined;

      /** The page as the author wrote it, italic marks included. */
      text: string;
    }
  | {
      kind: "choice";

      /** The clock at the press, before the choice's costs. */
      minutes: number;

      /** The label as the button read it: "Order a beer  10 min  45 Kč". */
      text: string;
    };

export function logText(night: Night, speaker: string | undefined, text: string): void;
export function logChoice(night: Night, text: string): void;

/**
 * The log as one marked text, wrapped to the width: a text entry is its time and its title on one
 * line and its text under them; a choice is one line in italic, its time and its label; a blank
 * line separates entries. Empty for an empty log.
 */
export function formatLog(log: readonly LogEntry[], width: number): string;
```

`Night` gains `log: LogEntry[]`, and `createNight` starts it empty. A script may read it, as it may
read the roll; nothing in this spec does. The checker's check nights have one and never write it.

`formatLog` builds the lines entry by entry and joins them with line ends. Each text is wrapped with
`wrapText` and the measure of the stripped text, as the story window wraps a page, so a line holds
as many letters as the window shows. A choice's line is the time, two spaces and the label, with the
label's own marks stripped first and the whole line wrapped in marks, so a stray asterisk cannot
turn the rest of the log italic. The times come from `formatTime`. The result is one string with
line ends, which the log screen cuts into pages with `getPageBreaks`; `splitMarked` reads a page's
italic from the start of the whole, so a page that starts inside a choice's line starts in italic.

### Where the log is written (`screens/storyWindow.ts`, `screens/nightScreen.ts`)

The story window logs a page when it first shows it: in its constructor, for the runner's first
page, and in `update` when the runner's node or page has changed or the runner has entered the same
node again, the test that rebuilds the window's parts today. A resize shows the same page again and
logs nothing. The entry is `logText(night, node.speaker, dialogue.pageText)`: the page as the runner
evaluated it, so a text that is a function is evaluated once, by the runner.

A choice is logged in its button's click, before `dialogue.choose(index)`:
`logChoice(night, formatChoice(choice, night))`, the label the button showed, unwrapped. The press
is the moment before the choice's costs, so the beer is logged at 19:40 and its text at 19:50. A
greyed-out choice takes no press and is never logged.

The night screen logs the travel in the travel window's `onClosed`, before `takeJourney`:
`logChoice(night, formatTravel(destination))`. The travel stands at the minute of departure, and its
text, which the travel's window shows, at the minute of arrival:

```ts
/** "Walk to Rotor Bar  12 min  25 Kč": the way as the travel window's row names it, the destination and its numbers. */
export function formatTravel(destination: Destination): string;
```

The way words (`Walk`, `Tram`, `Taxi`) move from the travel window to `core/travel.ts`, and the
window reads them there.

The place's description, the closing script, a travel's text and the end text all go through the
story window, so all are logged. The description is logged at every arrival and at every press of
the place button: the player read it again.

### The log screen (`screens/logScreen.ts`)

A `GameScreen` of its own, registered in `routes/_index.tsx` with the others, handed the night as
the error screen is handed its error: `logScreen.contents.showLog(night)` before `showScreen`. The
night is kept until the next `showLog`; `onShow` lays the screen out from it. Nothing registers the
screen in the tests' harness: `bootGame` renders the route, which registers it.

**The frame.** The screen is black, with no picture. The top row is the night screen's without a
place: the status line, in the outline font, with the night's final status, at the left where the
place button stands on a wide screen and under the top row on a narrow one, and the Menu button at
the right. `getSceneArea` gives the area under the row, as on the night screen.

**The window.** One panel, centred in the scene area, as wide as the story window (`WINDOW_WIDTH`,
or the screen less the margins when that is narrower). From top to bottom: the title block, the text
block and a row of two buttons, with the story window's gaps between them. The window is as tall as
the area allows: the text block holds `linesPerPage` lines, the most that fit the area's height less
the margins, the paddings, the title block and its gap, and the buttons' row and its gap, at
least 1. The height does not change from page to page.

The title is `The night  3 of 12`, through `createWindowTitle`. "The night" is short so that a count
of two-digit pages fits the title's line on the narrowest screen, which holds 19 characters.

The text block is a `TextBlock`: the story window's two leaves, regular and italic, of the same size
at the same place, moved into a part of their own that both windows use. It shows the page's slice
of the formatted log through `splitMarked`, whole and at once: no typing, no blips, no cursor.

**The pages.** `onShow` and `onResize` format the log for the text width (`formatLog`) and cut it
with `getPageBreaks(formatted, linesPerPage)` into pages: a page runs from one break to the next,
the first from the start and the last to the end. An entry may run over a page's end. The count is
the number of pages, 1 for an empty log. A resize keeps the player's place: the page shown after it
is the one that holds the offset at which the shown page began.

**The buttons.** Back and Next, in a row under the text, left to right. Back is disabled on the
first page and Next on the last, in the theme's disabled look; a disabled button takes no tap, no
focus and no key. Nothing is focused when the screen is shown; Tab or an arrow focuses the first
button that takes it, Next on the first page. When a turn disables the button that has the focus,
the focus moves to the other button, so Enter on Next reads the log through and Enter on Back reads
it back; the ring follows the rule it follows everywhere.

**The menu.** The Menu button and Escape open the night's menu (`openMenuModal`) above the window,
with Resume, Options and Quit to menu, as on the night screen; Escape follows the night screen's
rule for the frame in which it closed an overlay. Options opens the Options window. Quit to menu
shows the main menu, whose `onShow` plays its music again, as after Quit to menu from the night. The
log screen's `onHide` destroys the open modals, as the night screen's does.

**Why the night's menu.** Back, Next and Menu in one row need 116 pixels, and the text of the
narrowest screen has 114; the Menu button of the night screen is where the player knows it; and a
stray Escape must not lose the log, which no screen can show again.

### The checker (`core/checkContent.ts`)

`Content` gains `end: RunnableDialogueScript<Night>`, checked under `end › start` as the journeys
are checked, on the check nights of every place, time and level. No new rule: the end text may
branch or carry choices one day.

The check nights' times, each half hour from 16:00 to 07:30 and both sides of every opening and
closing, stay as spec 3 has them. Nothing a script reads changes at 08:00: only the night screen
reads the end.

### The tests' fixed world (`tests/fixedWorld.ts`)

The fixed bar's beer takes ten minutes already, which crosses 08:00 from 07:55. The fixed bar's
hours end at 08:00, so a beer at 07:55 brings the end and the closing together on one close, and the
test sees the end text and no closing script.

## Error handling

| What goes wrong                                                                      | In CI             | In the running game                                                                   |
| ------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| The end text lacks a speaker, or has a word too long or marks in odd number          | The checker fails | The window shows it as any text                                                       |
| The end text's function throws                                                       | The checker fails | The story window's runner throws, and the error screen shows it                       |
| A night ends in a closed bar's room, with a jump-in at 08:00 (`&place=rotorBarRoom`) | Not checked       | The description, then the end text; the closing never runs                            |
| A travel arrives after 08:00                                                         | Not checked       | Its text, then the end text; the destination is never shown                           |
| The log screen is shown without `showLog`                                            | Not possible      | An empty log: one empty page, `1 of 1`                                                |
| A resize while the menu is open                                                      |                   | The pages are cut again and the page is kept; the menu stays above                    |
| A choice's label carries a mark                                                      | Not checked       | The mark is stripped from the log's line; the button shows the asterisk, as today     |
| The log holds a text with a line end                                                 | Not possible      | `prose` joins lines; `wrapText` keeps a line end it is given, which starts a new line |

## Testing

Unit tests, in `tests/`:

- **`hours.test.ts`.** `isNightOver` at 07:59, at 08:00 and at 08:01.
- **`night.test.ts`.** `createNight` starts an empty log.
- **`log.test.ts`.** New. `logText` and `logChoice` write the entries with the night's minutes.
  `formatLog` gives the lines of the sketch above, wraps a long text and a long label, strips a
  label's marks, keeps a text's marks, puts a blank line between entries and gives `""` for an empty
  log. A page cut with `getPageBreaks` that starts inside a choice's line is italic by
  `splitMarked`.
- **`travel.test.ts`.** `formatTravel` for a walk, for a tram with a price and for a taxi.
- **`checkContent.test.ts`.** The end script is checked under `end › start`; a sample end script
  without a speaker is reported.
- **`content.test.ts`.** The game's content gives the empty list; the end text, run through a
  `Dialogue`, reads the money.
- **`listStandIns.test.ts`.** `nightEnd.ts` is counted.

Browser tests, in `tests/`:

- **`nightScreenEnd.browser.test.ts`.** New. A night in the fixed bar at 07:55: the beer's text is
  read to the end, the window closes to black, the end text opens with "Morning", and when it closes
  the log screen is shown with the final status and the log in order (the description, the bar's
  text, the beer, its text, the end text), each with its time; the closing script did not run. A
  travel that arrives after 08:00 shows its text and then the end text, never the destination. A
  jump-in at 08:00 ends after the description. Quit to menu from the menu above the end text shows
  the main menu.
- **`logScreen.browser.test.ts`.** New. A log of many entries on a wide screen and on the narrowest:
  the window's height does not change between pages, Back is disabled on the first page and Next on
  the last, the title counts, Tab focuses Next first, the focus moves when a turn disables its
  button, a resize keeps the page, Menu and Escape open the menu, Quit to menu shows the main menu,
  and the status line shows the night's status. A page that starts inside a choice's line is italic.
- **`nightScreen.browser.test.ts`.** A page is logged once, a resize in the middle of it
  notwithstanding; a choice is logged with its label before its costs; a travel is logged at
  departure and its text at arrival.

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
- `node scripts/list-stand-ins.mjs` prints the list, with the end text.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- Saving the log, or anything else, between runs (phase 7).
- The quest, its endings and the list of stories found (phase 6).
- The journal as a novel (shelved).
- Showing the log during the night, or from the main menu.
- The night's end in the travel window: the destination button reads `closed` for a bar after 08:00,
  as spec 3 decided, and nothing for a stop.
- A confirmation before Quit to menu.
- A page that keeps an entry whole.
- Changes to Somewhere and to Tellurion.

## Rejected

- **The night over only after 08:00 (minutes above 1920).** 08:00 is the end excluded from every
  span, so 08:00 is closed everywhere, and a jump-in at `time=08:00` ends after one window.
- **Straight from the crossing window to the log screen.** The night would cut from a bar to a list
  with no beat, and phase 6's endings need the place the end text takes.
- **The log written by the content,** in `defineScript`'s mapped `onChoose` and `onEnter`. A node's
  text is evaluated by the runner after `onEnter`, so the content would evaluate it a second time,
  and the checker's and the tests' runs would log too.
- **The log written by the night screen through callbacks from the window.** The window knows the
  moment of the press, before the costs; passing it out adds two callbacks for one line each.
- **An entry per node, with all its pages.** The runner shows one page at a time and keeps the pages
  to itself; per page is what the window sees, and the log reads the same.
- **A choice logged without its numbers.** The numbers are what the player read, and the log is the
  record of the budget.
- **A travel not logged, or logged through its text alone.** The log would jump from a door to "You
  walk…" with no record of the pick, its way or its price.
- **Back, Next and Menu in one row inside the window.** They do not fit the narrowest screen, and
  the Menu button has a place already.
- **The Menu button leading straight to the main menu, with Escape doing nothing.** Two Menu buttons
  in the same place doing different things, no Options, and a stray Escape made harmless by hand.
- **The story window's tap to turn the page, with its cursor, forward only.** The reader of a log
  goes back.
- **The log as a window over the night screen.** The direction says a screen of its own; the night
  is over, and its scene would have to be kept black under the window.
- **The bar's picture behind the log, as on the main menu.** The night is over.
- **An entry kept whole on a page.** Short entries would leave pages ragged, and the story window
  splits a text across pages too.
