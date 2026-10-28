# Saving and Continue (Foam phase 7, spec 3 of 3): design

Date: 2026-10-27. App: `apps/foam`. Status: implemented by
[2026-10-27-saving-and-continue.md](../plans/2026-10-27-saving-and-continue.md). It is the last of
phase 7's three specs in the [direction document](../../direction.md). It builds on spec 2,
[versions](2026-10-26-versions-design.md), which is built before this one, and on spec 1,
[the seed](2026-10-25-seed-design.md). It closes phase 7.

## Background

After spec 2 a night is a number, and what the night decides is a hash of it. Nothing of a night
survives the page: the night lives in the night screen's contents, a reload or a closed tab loses
it, and the main menu offers only New Game. The one thing kept across nights is the collection of
stories, saved in the browser's storage at each find since phase 6. Two nights on one day are one
night: the default seed is the date.

The direction document's Saving row says an unfinished night is saved on every change of place and
every closed window, that Continue resumes it and Quit to menu keeps it, that the collection, a
record of past nights and the set of texts read are kept across nights, and that the default seed
counts the nights started on one day. The phase 6 stories spec deferred a collection screen with a
reset button to phase 7.

Three things shape this spec:

- **The night is plain data.** Apart from `random` and `pick`, which the seed rebuilds, and the
  collection, which has its own store, every field of the night is a number, a string, a list or a
  record of them. The save is the night as it stands, and the resume is the night built back.
- **A save is a closed window.** What a story window is showing, its node, its page and its revealed
  characters, is the engine's and private. A reload never runs the screen's hide, so every night
  stands at its last save whatever happens to the page, and Quit to menu is no exception: the night
  rewinds to the last window that ended, and a window the player left never happened.
- **A resume is the step after a closed window.** The night screen already has one function that
  looks at the night once a window has closed and decides what comes next: the end, a place the
  night moved to, a way out, a closing. A resumed night is handed to it.

## Decisions (from brainstorming)

1. **The saved night is the night's data,** less `random`, `pick`, the collection and the way out,
   in a store of its own that is all or nothing, as Somewhere's save is. Resume rebuilds the night
   from it and calls the step after a closed window, which shows the saved place under its
   description, or the Morning text, or a closing, as it does live.
2. **A night is saved when a story window's text ends and when a journey is picked.** Nothing is
   saved on hide: Quit to menu with a window open rewinds the night to the window's opening, with
   its costs, its roll, its log lines and its finds undone. The collection is saved with the night
   when a window's text ends and read back from the store on hide, so a find in an abandoned window
   is undone with the night. This reverses phase 6's decision that the screen saves at each find,
   whose reason was that nothing else kept the night.
3. **A Collection window from the main menu** lists the stories found and the past nights, newest
   first, each with its date, seed, ending and finds, with a Reset.
4. **Two confirmations,** shaped alike: Start on a saved night, and Reset. Close has the focus, so
   the action is a deliberate move.
5. **The texts read are kept by path,** `rotorBarRoom › The corner table › cards`, the checker's
   vocabulary, one entry per node, written when its first page appears, never rewound, and not yet
   read by the content: `hasRead` comes with the experiment that wants it.
6. **The record holds the seed, the date, the ending and the titles.** The ending is a field the
   Morning text's three ending nodes write, as the quest's flags are written by content.
7. **The default seed is the date for the first night of the day and the date followed by the
   night's number after that,** 202610272 for the second. Every Start counts, typed seed or not.
8. **The console prints** one line at boot with the counts and the paths, and one line for each text
   read for the first time.
9. **A jump-in night is a night like any other:** saved, and replacing a saved night without the
   confirmation. The address is the author's tool.
10. **One leak is accepted:** the roll count rewinds with the night, so a value won on a hard roll,
    quit and resumed, serves whatever is rolled next. The odds are shown and the game knows it is a
    game.

## Design

### What the player sees

1. The main menu shows Foam, then New Game, Collection and Options. With a saved night it shows
   Continue above New Game.
2. New Game opens the New night window as today. The field reads `20261027` for the first night of
   the day, `202610272` for the second, `202610273` for the third: the date, then the number of the
   night. Start counts the night, so a night started and abandoned at once still counts.
3. The night runs as before. Behind the scenes it is saved each time a story window's text ends and
   each time a journey is picked, and the collection is saved when a window's text ends instead of
   at each find.
4. Quit to menu from a place with no window open, then Continue: the same place opens under its
   description, with the status line as it was. The log shows the description once more at the same
   minute. A story found earlier in the night does not toast again.
5. Quit to menu with a story window open, for example after sitting in for a hand and before its
   text ends, then Continue: the night stands at the window's opening, with the 50 Kč and the 15
   minutes back and the hand's story not found. The player may sit in again, and the same roll comes
   up.
6. Quit to menu during the Morning text, then Continue: the Morning text opens over black again.
7. New Game with a saved night: Start opens a second window over the first, titled "Night in
   progress", reading "Start ends the saved night." with Start and Close. Start plays the new night
   and its first save replaces the old one. Close and Escape return to the New night window.
8. The night ends and the log screen opens as today. Quit to menu from it: no Continue, since the
   night is recorded.
9. Collection opens a window over the menu, in pages with Back and Next when it needs them, with
   Reset and Close under the text:

   ```
   Stories  7 found
   The regulars' bottle
   The hand that paid for a round
   …

   Nights  3
   27 Oct 2026  Seed 202610272  Stayed
     The hand that paid for a round
   27 Oct 2026  Seed 20261027  Left
     The regulars' bottle
     The timetable
   26 Oct 2026  Seed 7  Stranded
   ```

   The nights come newest first, each with the titles it found under it. "None yet" stands under
   either heading with nothing to list.

10. Reset opens a window titled "Reset", reading "Everything the game kept goes: the stories, the
    nights, the texts read and the saved night." with Reset and Close. Reset empties the window to
    "None yet" twice and takes Continue off the menu. Close and Escape keep everything.
11. A reload or a closed tab, then the page again: Continue is there, and the night stands at its
    last save, as after a Quit.
12. The jump-in starts a night as today. Its first save replaces a saved night without the second
    window.
13. In the console, one line at boot names how many nights and how many texts the game has kept, and
    one line reads `Read: rotorBarRoom › The corner table › cards` each time a text is read for the
    first time.

What does not change: the night's places, texts and windows, the Stories window, the log screen's
content, the seed on the log's first line, the jump-in's other parameters.

### Files

| File                                      | Change                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `source/game/core/save.ts`                | New. `SavedNight`, the schema, the store `foam:night`, `loadSavedNight`, `saveNight`, `clearSavedNight`                 |
| `source/game/core/night.ts`               | `Ending` and `ending` on the night; `restoreNight`                                                                      |
| `source/game/core/stories.ts`             | `reloadCollection`                                                                                                      |
| `source/game/core/nights.ts`              | New. `PastNight`, the store `foam:nights`, `nights`, `recordNight`, `countStart`, `getNextSeed`, `forgetNights`         |
| `source/game/core/todaySeed.ts`           | `formatDate`                                                                                                            |
| `source/game/core/contentPath.ts`         | New. `SEPARATOR`                                                                                                        |
| `source/game/core/textsRead.ts`           | New. The store `foam:textsRead`, `textsRead`, `markRead`, `forgetTextsRead`                                             |
| `source/game/core/checkContent.ts`        | Imports the separator                                                                                                   |
| `source/game/content/nightEnd.ts`         | The three ending nodes write `ending`                                                                                   |
| `source/game/screens/nightScreen.ts`      | `resuming`; the saves; the record and the clear; the resume; the collection read back on hide; `where` for every window |
| `source/game/screens/storyWindow.ts`      | `where`; `markRead` when a node's first page appears                                                                    |
| `source/game/screens/mainMenuScreen.ts`   | Continue and Collection; the confirmation before Start; the windows destroyed on hide                                   |
| `source/game/screens/newNightModal.ts`    | The field reads the day's next seed                                                                                     |
| `source/game/screens/listWindow.ts`       | New. `ListWindow`: the Stories window's paging, shared                                                                  |
| `source/game/screens/storiesWindow.ts`    | A use of the list window                                                                                                |
| `source/game/screens/collectionWindow.ts` | New. The other use: the two lists, Reset and Close                                                                      |
| `source/game/screens/confirmModal.ts`     | New. `openConfirmModal`                                                                                                 |
| `source/routes/_index.tsx`                | The console line at boot                                                                                                |
| `docs/direction.md`                       | The status line; the Saving and Stories rows; the phase 7 paragraph                                                     |

### The saved night (`core/save.ts`, `core/night.ts`)

```ts
export type SavedNight = Omit<Night, 'random' | 'pick' | 'collection' | 'leaving'>;

/** The saved night, or null when there is none or its place is not in the content. */
export function loadSavedNight(places: Readonly<Record<string, Place>>): SavedNight | null;

/** Writes the night's data: every field of `SavedNight`, picked by name. */
export function saveNight(night: Night): void;

export function clearSavedNight(): void;
```

The zod schema is annotated as `z.ZodType<SavedNight>`, so a field added to `Night` fails to compile
until the schema handles it. The log is a discriminated union on `kind`, as `core/log.ts` has it;
`events` is the list of keys spec 2 added. The store is `foam:night`, nullable and all or nothing,
as Somewhere's save is: null is "no night", and anything unusable lands there too, with the store's
warning, since a half-defaulted night would drop the player somewhere they never stood. No version
field: the schema is the version, and a failing save costs one night.

The loader takes the places as the jump-in does, because the schema cannot import the content. A
place the content no longer has warns `The saved night is in "x", which is not a place.` and gives
null, so Continue does not appear and the next night replaces the save. Unknown keys are stripped,
so a quest flag or an event the content stopped reading is harmless.

`Night` gains `ending`:

```ts
export type Ending = 'leave' | 'stay' | 'stranded';

export type Night = {
  …
  /** How the night ended: the Morning text's ending node writes it; null until then. */
  ending: Ending | null;
};
```

`createNight` starts it null, and the `onEnter` of the Morning text's `leave`, `stay` and `stranded`
nodes writes its name, as the quest's flags are written by content. The record reads it.

```ts
/** The night built back from its saved data: `random` and `pick` from the seed, no way out. */
export function restoreNight(saved: SavedNight, collection: Collection): Night {
  let {seed, place, minutes, money} = saved;

  // A number for the money draws nothing.
  return {...createNight({seed, place, minutes, money}, collection), ...saved};
}
```

It stays pure, so the core's unit tests never touch storage, and the whole-object test covers it.

### The moments (`screens/nightScreen.ts`)

1. **The story window's `onClosing`,** after the backdrop's fade is started: `saveNight` and
   `saveCollection`. The window calls it when its text has ended, so the last choice's effects, the
   last node's entry effect and the last page's log line are in the night, and the fade has not
   begun. A save that waited for every overlay to close would lose a finished window to Escape in
   the fade and then Quit, since the menu opens above a closing window.
2. **The travel window's `onClosed` with a destination,** after `logChoice` and `takeJourney` and
   before the journey's window opens: `saveNight`. This is the change of place, and a journey is
   never undone by a quit. Back saves nothing.
3. **The branch of `actOnNight` that shows the log:** `recordNight(night, todaySeed())`, then
   `clearSavedNight`, then `showLog`. A night is recorded once, when its Morning text has been read
   through. The save the Morning text's own closing wrote is cleared here a moment later.
4. **`onHide`:** `reloadCollection` replaces `saveCollection`. It reads the store back into the
   shared object in place, `collection.titles.splice(0, Infinity, ...stored.titles)`, so every night
   that holds it sees the stored titles. With no window open the store already equals the object, so
   the call is unconditional. `handleStories` loses its per-find save.

The first save of a night is written when the train's description ends. A night quit before that
leaves no Continue.

### Continue (`screens/mainMenuScreen.ts`)

The menu gains Continue and Collection, 96 wide like the others: Continue above New Game when there
is a saved night, Collection between New Game and Options. The UI root only appends, so when
Continue comes in, New Game, Collection and Options are taken out and added back after it, as
Somewhere's menu slots its Continue. Whether it is there is decided by
`loadSavedNight(nightStart.places) !== null`, checked on the menu's `onShow` and again when a window
over the menu closes, since Reset can take the save away while the menu is shown.

Continue's click reads the save once more, hands it to the night screen through
`nightScreen.contents.resuming`, as the night screen hands the night to the log screen through
`showLog`, and shows the night screen.

New Game's `onStart` becomes: with a saved night, open the "Night in progress" confirmation over the
New night window; without one, or from the confirmation's Start, do the start:
`countStart(todaySeed())`, `clearSavedNight()`, `nightScreen.contents.resuming = null`,
`nightStart.seed = seed`, then `showScreen(nightScreen)`. The clear makes "Start ends the saved
night" literal, and the null keeps a Continue that failed to show the screen from leaking into a
fresh night.

The main menu's contents hold the open window as today, and beside it the Collection window and the
confirmation. `onHide` destroys them topmost first; `onResize` resizes the Collection window.

### The resume (`screens/nightScreen.ts`)

`contents.resuming: SavedNight | null`, null from `onAttach`. `onShow` reads and empties it. With
nothing there it builds the night from `nightStart` as today. With a saved night it calls
`restoreNight(saved, collection)`. The resets follow as today, with one change: `storiesHandled`
starts at `night.stories.length`, so a resumed night queues no toast for its finds. Then, instead of
`showPlace` on the start's place, the resume calls `actOnNight(screen)`. With no place shown, that
function does the right thing for every state a save can hold:

- **A night that is over:** the end text opens over black. Its Morning lines were never saved, so
  the log doubles nothing. When it ends, the night is recorded and the save cleared.
- **A place a script changed, or a journey's destination:** the save holds the new place, and
  `showPlace` opens it under its description. A journey's own text is not shown again and was never
  logged: the pick was logged and paid.
- **Nothing pending:** the saved place under its description, logged once more at the saved minute.
- **A location closed on the player:** the room under its description, then its closing script when
  the description closes, as live.

The call is direct rather than through the `hasStoryClosed` flag, so the first frame is not black
and the flag keeps the meaning its comment gives it. A throw inside, such as a place the content
lost between the load and the show, lands on the error screen through `showScreen`'s catch, as a
start in an unknown place does today. The backdrop is set to the scrim before the call, as today.

The jump-in route stays as it is: it writes `nightStart` and shows the night screen with nothing to
resume.

### The record and the day's count (`core/nights.ts`)

```ts
export type PastNight = {seed: number; date: number; ending: Ending | null; stories: string[]};

/** Hydrated at module load: the nights ended, oldest first, and the day's count of starts. */
export const nights: {past: PastNight[]; day: {date: number; started: number}};

/** Appends the night's seed, the date, its ending and the titles it found, and saves. */
export function recordNight(night: Night, date: number): void;

/** Counts a start on the date: a new date starts at 1. Saves. */
export function countStart(date: number): void;

/** The date for a day with no start yet; the date followed by the next night's number after. */
export function getNextSeed(date: number): number;

/** Empties both in place and clears the store. */
export function forgetNights(): void;
```

`formatDate(date)` in `core/todaySeed.ts`, beside the function that makes the number, writes it as
`27 Oct 2026` for the Collection window. It stays out of the nights module so that its unit test
imports nothing that reads storage at load.

One store, `foam:nights`, whose two fields recover on their own with `.default().catch()`, as the
settings' fields do, so a bad list does not lose the count or the other way round. The date is
`todaySeed()`'s number, passed in by the screen, so the core stays free of the clock as the seed
spec wanted. `getNextSeed(20261027)` is `20261027` with no start on that date, and
`Number('20261027' + String(started + 1))` after: `202610272` for the second night, eight digits and
the count, under the field's fifteen.

The New night window opens with `getNextSeed(todaySeed())` in its field instead of the date, read
when the window opens as today. The jump-in's default stays the date.

### The texts read (`core/contentPath.ts`, `core/textsRead.ts`, `screens/storyWindow.ts`)

```ts
// core/contentPath.ts
/** Between the parts of a path, as the checker reports and `markRead` writes them. */
export const SEPARATOR = ' › ';

// core/textsRead.ts
/** Hydrated at module load: the paths of every node whose text the player has seen. */
export const textsRead: {paths: string[]};

/** Adds the node's path once, saves, and prints `Read: …` to the console when it is new. */
export function markRead(where: string, nodeId: string): void;

export function forgetTextsRead(): void;
```

The store is `foam:textsRead`, `{paths: string[]}`, with the list recovering to empty. The separator
has a pure module of its own, which the checker and `markRead` both import, so the two never drift
and the checker's unit test imports nothing that reads storage at load.

The story window takes `where`, the name of what opened it, and calls `markRead(where, id)` when a
node's first page appears, with the node's id found by identity in the script's table. A node that
is not in the table is named as the checker names it: `start` for a start written as a node, `next`
for an inline next. The night screen passes `where` as the checker builds it:
`${place.id} › description`, `${place.id} › ${spot.label}`, `journeys › ${way}`,
`${location.id} › closing`, and `end` for the Morning text.

The set never rewinds: a text seen was seen. Nothing in the content reads it yet, so the checker has
no pass over it.

### The console line (`routes/_index.tsx`)

After the game has started, one `console.info` with the counts and the list of paths as a second
argument, so the console shows it expandable: `Foam keeps 3 nights and 42 texts read.` The nights
are read on the Collection window, so they are not printed.

### The list window (`screens/listWindow.ts`, `screens/storiesWindow.ts`, `screens/collectionWindow.ts`)

The Stories window has everything the Collection window needs: a title block, a text cut into pages
by the room the screen gives, Back and Next when there is more than one page, the focus moving when
a turn disables the focused button, and a resize that builds the layout again. Rather than a second
copy of those lines, the paging becomes a shared class:

```ts
export type ListWindowOptions = {
  ui: UiRoot;
  scheduler: Scheduler;

  /** The title and the list for the width of the text; run on open, on resize and on refresh. */
  format: (textWidth: number) => {title: string; text: string};

  /** Buttons to the left of Close in the bottom row; none, and Close fills it. */
  actions: Button[];

  /** Under the top row, as the Stories window stands, or centred, as the Options window does. */
  placement: 'centre' | 'top';
  onClosed: () => void;
};

export class ListWindow {
  readonly modal: Modal;
  resize(): void;
  refresh(): void;
}
```

Built per opening and owning a `Modal`, which Close closes, and so does the cancel command. The room
for the lines is the scene area's on both screens, as the Stories window counts it, less the bottom
row. `refresh` runs the formatter again and shows the page the offset falls on, as a resize does.
The Stories window becomes one use of it, with its night's formatter, no actions and the top
placement; its behaviour, tests and screenshots do not change.

The Collection window is the other use, opened by the main menu's Collection button, centred, with
Reset as its one action. Its title is `Collection` and its text is the two lists: a heading
`Stories  7 found` in italic, each title on its own line in the order found, a blank line, a heading
`Nights  3` in italic, and each night as `27 Oct 2026  Seed 202610272  Stayed` with its titles under
it indented by two spaces, newest first. The ending words are `Left`, `Stayed` and `Stranded`; a
null ending ends the line after the seed. `None yet` stands under a heading with nothing to list.
Every line is wrapped to the text's width. The picture runs at half speed under it, as under
Options.

### The confirmations (`screens/confirmModal.ts`)

```ts
export function openConfirmModal({
  ui,
  scheduler,
  title,
  text,
  action,
  onAction,
  onClosed,
}: ConfirmModalOptions): Modal;
```

Shaped like the New night window: a `Panel` with the window padding and a column with a gap of 4,
holding the title block 136 wide, a `Text` of the line wrapped to 136, and a row of two buttons 65
wide with 6 between, the action's label on the left and Close on the right. Close is the modal's
initial focus, so Enter pressed twice cannot start or erase anything. The action's click calls
`onAction` unless the modal is closing, as the menu's buttons guard theirs; Close and Escape close
it, and the focus returns through the focus-scope pop.

- **Night in progress.** Title `Night in progress`, text `Start ends the saved night.`, action
  `Start`. Opened above the New night window by its Start or Enter when a save exists. Its
  `onAction` does the start of the Continue section; the night screen's show destroys both windows
  through the menu's hide.
- **Reset.** Title `Reset`, text
  `Everything the game kept goes: the stories, the nights, the texts read and the saved night.`,
  action `Reset`. Opened above the Collection window by its Reset. Its `onAction` calls
  `forgetStories`, `forgetNights`, `forgetTextsRead` and `clearSavedNight`, in that order, refreshes
  the Collection window, and closes itself. Continue leaves the menu when the Collection window
  closes.

### The direction document

- The status line says phase 7's first spec is built and its second and third are designed.
- The Saving row says when the night is saved, that a quit mid-window rewinds to the last save, that
  the collection is saved with the night, how the texts read are keyed, that the Collection window
  lists the stories and the nights with a Reset, and how the default seed is formed.
- The Stories row says the collection is saved with the night from phase 7 on.
- The phase 7 paragraph names the Collection window and links this spec.

## Error handling

| What goes wrong                                      | In CI                  | In the running game                                                          |
| ---------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| The stored night is not JSON                         |                        | The store warns; no Continue; the next night replaces it                     |
| The stored night fails the schema                    |                        | It lands on null without a warning; no Continue; the next night replaces it  |
| The stored night's place is not in the content       |                        | A console warning; no Continue                                               |
| Storage is unavailable, private mode or quota        |                        | Every store warns; the night plays on; nothing to continue after a quit      |
| A reload or a closed tab mid-window                  |                        | The night stands at its last save; the window's costs are not paid           |
| Quit before the train's description ends             |                        | No save, no Continue                                                         |
| Continue's transition fails                          |                        | The error screen; `resuming` is consumed by the show, and New Game clears it |
| An ending node forgets to write `ending`             | The content test fails | The record holds null and the night's line has no ending word                |
| The record's list or the day's count is unusable     |                        | Each field recovers on its own; the other survives                           |
| The texts-read store is unusable                     |                        | An empty set, collected again                                                |
| A spot label or a node id is renamed                 |                        | Its texts count as unread: the path is a contract, as keys are               |
| A jump-in with a saved night                         |                        | Replaced at the first save, without the confirmation                         |
| Two tabs play at once                                |                        | The last write wins; not handled                                             |
| The New night window opens past midnight             |                        | It reads the date when it opens, so the new day's first seed                 |
| Reset while the Collection window is on a later page |                        | The refresh shows the first page: the offset falls there                     |

## Testing

Unit tests, in `tests/`:

- **`night.test.ts`.** `restoreNight` rebuilds `random` and `pick` from the seed, starts `leaving`
  null and keeps every saved field, compared as a whole object; `ending` is null from `createNight`.
- **`todaySeed.test.ts`.** `formatDate`: `27 Oct 2026` for 20261027, `1 Jan 2027` for 20270101.
- **`content.test.ts`.** Each of the three ending nodes writes its ending in `onEnter`; the checker
  passes on the content.
- **`checkContent.test.ts`.** Unchanged beyond the separator's import.

Browser tests, in `tests/`, since the stores touch storage:

- **`save.browser.test.ts`.** New. A night saved and loaded is the same data; text that is not JSON,
  a payload missing a field and a place not in the content give null, the last with its warning;
  `clearSavedNight` removes the key.
- **`nights.browser.test.ts`.** New. `recordNight` appends and saves; `countStart` starts at 1 on a
  new date and adds one on the same; `getNextSeed` is the date with no start and the date followed
  by the number after; a bad list loads empty and keeps the count; `forgetNights` empties in place.
- **`textsRead.browser.test.ts`.** New. `markRead` adds a path once, saves and prints it the first
  time only; `forgetTextsRead`.
- **`stories.browser.test.ts`.** `reloadCollection` replaces the titles in place from the store.
- **`mainMenu.browser.test.tsx`.** Continue is shown with a stored night and not without; Continue
  opens the saved place with its status line; Start with a stored night opens the confirmation with
  Close focused, its Close returns to the New night window, its Start plays the new night and clears
  the save; the field reads the day's next seed after a start; Collection opens the window with the
  two lists; Reset's confirmation, Reset emptying the window to `None yet` twice, and Continue gone
  once the window closes; the picture runs at half speed under the Collection window.
- **`continue.browser.test.ts`.** New. A save is written when a window's text ends and when a
  journey is picked, and not before the first window ends; a quit mid-window then Continue: the
  money and the minutes back, no find in the night or the store, and the same roll on the same
  choice; Continue into the Morning text; the record written and the save cleared when the log
  screen opens; no toast for the finds of a resumed night; the `Read:` paths of a description, a
  spot, a journey and the end.
- **`storiesToast.browser.test.ts`.** The find reaches the store when the window's text ends, not at
  the toast; Quit to menu with a window open leaves the store at the last save.
- **`collectionWindow.browser.test.ts`.** New. The lists in pages on the narrowest screen, Back and
  Next with the focus rule, the nights newest first with their titles indented.

The lessons of the earlier phases' reviews hold for every new test and button.

Run from the repository root:

```sh
npx turbo run typecheck lint test --filter=foam --concurrency=1
```

## Done when

- The turbo command above passes, and the checker test keeps its time.
- In the running app, every step of "What the player sees" can be observed, in a wide browser window
  and in one narrower than 240 art pixels.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- `hasRead` in the content and the checker's pass over the texts read.
- Resuming mid-text.
- Several saved nights, or a night saved in a file or a link.
- Replaying a recorded night from the Collection window.
- Statistics over the record.
- Changes to Somewhere and to Tellurion.

## Rejected

- **A snapshot at Quit,** Somewhere's write on hide. A reload never runs the hide, so every night
  rewinds to its last save anyway, and Quit would be the one path that behaves differently. A
  snapshot also cuts a text the player cannot reopen, since the window's position is private, and
  the log would end mid-page.
- **Replaying the choices from the seed.** Deterministic since spec 1, but choices are known by
  their labels, journeys by a map pick and texts by functions of the night: ids for everything and a
  headless runner of the content.
- **An engine addition to resume mid-text.** A Tellurion change for a case the rewind makes
  unnecessary.
- **The save after every overlay has closed,** in `actOnNight`. The menu can sit above a closing
  window for as long as the player likes, and a Quit then loses a finished window.
- **Saving the way out.** It matters only between a way-out window's end and the travel window,
  `showPlace` clears it today, and pressing the way out again costs nothing.
- **The collection saved at each find beside a rewound night.** A resumed night would hold the title
  in the collection but not in its list: no toast, no log line, not counted by the Morning text, and
  a choice hidden by `hasStory` could not be taken again.
- **A staged variable in the save module,** as Somewhere stages. Foam hands state between screens
  through `contents`, as `showLog` does.
- **A version field in the schema.** The schema is the version; a failing save costs one night.
- **Recording an abandoned night.** Nothing ended; the direction's record is of past nights.
- **The ending inferred from the Morning text's last node.** A field the content writes survives an
  epilogue node, as the quest's flags do.
- **A resume without the description, or fading in from black.** A resume is not a change of place,
  and the live path needs no special case: the place comes under its description as a fresh night's
  first place does.
- **The texts read keyed by their string.** A text with a variable is several entries, and the real
  text, once written, resets every entry on the day the experiment becomes interesting.
- **A hash of the string.** Everything the string has, printed as numbers.
- **The text's template as its identity.** A side table from rendered strings to templates, filled
  at render time, and a plain literal has no template.
- **A key the author writes for each tracked text.** Nothing is collected until an experiment is
  designed; a deferral of the question.
- **Whole logs of past nights kept.** The richest data and a cap on the record, and the comparison
  still needs an identity.
- **A page as the unit.** A moved page break renames every later page, and no question the content
  would ask names a page.
- **Choices taken in the set.** A label carries its costs and changes with a price; its key is a
  question for the experiment that wants it.
- **A silent New Game, or a warning line in the New night window.** A night is half an hour of play;
  the confirmation is one small window built once.
- **The Collection as a screen of its own.** The menu's other two windows are windows, and a screen
  is registered, laid out and torn down for one list.
- **A second copy of the Stories window's paging.** Two hundred lines with the focus rule twice.
- **The count derived from the record and the save.** An abandoned night would vanish from both and
  its seed come round again as the next default.
- **A seed made by adding the count to the date.** Tomorrow's first night is today's second.
- **A reset button in Options,** rejected in phase 6 and still: the Collection window shows what
  Reset erases.
- **Printing the nights in the console.** The Collection window shows them.
