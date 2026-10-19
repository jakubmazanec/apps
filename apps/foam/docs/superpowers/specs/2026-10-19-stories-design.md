# Stories (Foam phase 6, spec 1 of 3): design

Date: 2026-10-19. App: `apps/foam`. Status: designed, not yet planned. It is the first of phase 6's
three specs in the [direction document](../../direction.md). It builds on phase 5's
[end of the night and log](2026-10-10-end-of-the-night-and-log-design.md). Spec 2, the quest's
threads, and spec 3, the endings and sleep, follow.

## Background

Phase 5 leaves a night that runs from 16:00 to 08:00, logs every text read and every choice taken,
and shows the log on a screen of its own at the end. Nothing in it is a story:

- The content is scripts of nodes and choices. A node that tells an anecdote, the guitarist in
  Rotor's room from 22:00 to 01:00 or the regulars' bottle saved for an occasion, is a text like any
  other. The game does not know it was worth finding.
- The night's state holds the clock, the money, the place, the drunkenness, the last roll and the
  log. Nothing remembers what the player found, and nothing outlives the night: Quit to menu or a
  reload forgets everything but the volumes.
- The log is read once, at the end, and cannot be seen again.

The direction document's principles say the fun is the stories and the uniqueness of each run, the
quest only frames the night, and the stories found are kept. Its phase 6 row says the stories found
are listed at the end. The brainstorm of 2026-10-19 cut phase 6 into three specs and put the stories
first, so that the quest's scenes are written with the helper already there.

Three things shape this spec:

- **A story is an achievement.** It is given by the script, in an effect, with the full branching
  the script has: the hour, the dice, the level, the quest. It is achieved once across all runs. A
  later night that takes the same choice gets nothing, and the author may take the choice away once
  its story is achieved.
- **The moment is felt.** A toast shows the title when it is achieved, the log keeps the line, and a
  Stories window in the night's menu lists what the night has given so far.
- **The collection is the player's,** not the night's. It is saved in the browser's storage from
  this spec on, so the rule holds across reloads and days. Phase 7 keeps the seed and Continue.

## Decisions (from brainstorming)

1. **A story is given by the script,** through `findStory(night, title)` called by hand in a
   choice's `onChoose` or a node's `onEnter`, as a door sets the place by hand. No mark the window
   detects, and no field mapped by `defineScript`.
2. **Once across all runs.** The collection, a list of titles, is shared by every night of the
   player. A title already in it does nothing: no toast, no log line, no entry in the night's list.
3. **A choice may go once its story is achieved,** through `hasStory(night, title)` in `isVisible`.
   The checker runs with an empty and a full collection, so the way out that costs nothing is
   checked both ways.
4. **The collection is saved now,** in the browser's storage through Tellurion's persisted store
   under a second key, as the volumes are. The night screen saves after each find and on hide.
5. **A toast at the moment.** A notice at the bottom of the screen, above every window, "A story"
   over the title, 100 ms in, 3 seconds, 100 ms out, taking no tap. Two finds queue.
6. **The log keeps the line,** as a third entry kind, one italic line: `23:10  A story: …`.
7. **A Stories window in the night's menu,** between Resume and Options, lists the night's finds
   with their times, in pages, and opens over the log screen at the end before the log is read.
8. **Eleven stories in the content that exists,** with stand-in titles written with the `standIn`
   tag, so the stand-in script counts them; two of them take their choice with them.
9. **The jump-in forgets** with `stories=none`. No reset button until phase 7's collection screen.

## Design

### What the player sees

1. The night runs as phase 5 left it. At 23:10 the player presses the corner table in Rotor's room
   and asks for a song. The guitarist's node opens and its page types.
2. While it types, a small window fades in at the bottom of the screen, above the story window and
   its dimmed backdrop: the rose title "A story" and under it, in white, "The guitarist who plays
   for one". It stays 3 seconds and fades out. A tap on it is a tap on what is under it.
3. The log gains the line `23:10  A story: The guitarist who plays for one`, in italic, between the
   choice and the page, so the log screen shows the find where it happened.
4. Escape or Menu opens the night's menu: Resume, Stories, Options, Quit to menu. Stories opens a
   window above the menu titled `Stories  1 found`, listing
   `23:10  The guitarist who plays for one`. Close or Escape returns to the menu with the focus on
   Stories. Before the first find, the window reads `Stories  0 found` and `None yet`.
5. At 08:00 the Morning text ends and the log screen opens with the Stories window already above the
   log, titled `Stories  3 found` with the night's three lines. Close or Escape shows the log, with
   nothing focused. Menu, then Stories, opens it again; its empty text reads `None` now that the
   night is over.
6. On the next night, the corner table at 23:10 gives the song again, with no toast and no line: the
   story is achieved. The smokers on Dvořákova, whose cigarette story the player achieved last
   night, no longer offer the cigarette. The Stories window of the new night counts only what the
   new night found.
7. A reload keeps the collection. `?place=rotorBarRoom&time=23:00&stories=none` starts a night with
   the collection forgotten.

What does not change: the story window, the travel window, the hours, the end at 08:00, the log
screen's pages and buttons, the status line.

### Files

| File                                   | Change                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `source/game/core/stories.ts`          | New. `Collection`, the persisted store, `collection`, `saveCollection`, `forgetStories`            |
| `source/game/core/night.ts`            | `collection` and `stories` on the night; `createNight` takes a collection; `findStory`, `hasStory` |
| `source/game/core/log.ts`              | The `story` entry kind, `logStory`, its line in `formatLog`                                        |
| `source/game/core/checkContent.ts`     | Every effect runs on every check night; titles gathered and checked; two collections               |
| `source/game/core/getJumpIn.ts`        | `stories=none`                                                                                     |
| `source/routes/_index.tsx`             | Calls `forgetStories` for the jump-in                                                              |
| `source/game/screens/toast.ts`         | New. `Toast`                                                                                       |
| `source/game/screens/storiesWindow.ts` | New. `StoriesWindow`                                                                               |
| `source/game/screens/menuModal.ts`     | The Stories button; the window's slot and the night on the menu screen; teardown                   |
| `source/game/screens/nightScreen.ts`   | Passes the collection; handles the finds: the toast queue and the save; the window                 |
| `source/game/screens/logScreen.ts`     | Opens the Stories window in `onShow`; resizes and tears it down                                    |
| `source/game/content/locations/…`      | Eleven `findStory` calls, two `hasStory` conditions, the header comment's line                     |
| `tests/fixedWorld.ts`                  | A patron whose node finds a story and a choice hidden once achieved                                |
| `tests/nightScreenHelpers.tsx`         | `describeEntry` reads a story entry; getters for the toast and the window                          |

### The collection and the helpers (`core/stories.ts`, `core/night.ts`)

```ts
export type Collection = {
  /** The titles of every story achieved across all runs, in the order found. */
  titles: string[];
};

const storiesSchema = z.object({titles: z.array(z.string()).default([]).catch([])});
const storiesStore = new PersistedStore({key: 'foam:stories', schema: storiesSchema.prefault({})});

/** The player's collection, hydrated from storage at module load. */
export const collection: Collection = storiesStore.load();

export function saveCollection(): void {
  storiesStore.save(collection);
}

/** Empties the collection in place, so every night that holds it sees it empty, and clears the store. */
export function forgetStories(): void {
  collection.titles.length = 0;
  storiesStore.clear();
}
```

A missing, unreadable or invalid value gives an empty collection, with the store's warning, as a bad
settings value gives the defaults. Only the night screen and the route import this module, so the
core's unit tests never touch storage.

The night gains two fields and `createNight` a second argument:

```ts
export type Night = {
  …
  /** The player's collection; shared by every night of the player, read and written by the helpers. */
  collection: Collection;

  /** The stories this night achieved, with the clock, in the order found. */
  stories: {title: string; minutes: number}[];
};

export function createNight(start: {…}, collection: Collection = {titles: []}): Night;
```

The night screen passes the module's collection, in `onAttach` for its placeholder night and in
`onShow` for the real one. The checker and the tests pass nothing and get a fresh empty one, or pass
one of their own: the collection is an argument, not a singleton read inside `createNight`, because
the checker needs nights with an empty collection and nights with a full one.

```ts
/** Records the story, once across all runs: a title already in the collection does nothing. */
export function findStory(night: Night, title: string): void {
  if (night.collection.titles.includes(title)) {
    return;
  }

  night.collection.titles.push(title);
  night.stories.push({title, minutes: night.minutes});
  logStory(night, title);
}

/** Whether the story is in the collection, from this night or an earlier one. */
export function hasStory(night: Night, title: string): boolean {
  return night.collection.titles.includes(title);
}
```

Content calls them in effects:

```ts
song: {
  speaker: TABLE,
  onEnter: (night) => {
    findStory(night, standIn`The guitarist who plays for one`);
  },
  text: standIn`…`,
},
```

```ts
{
  text: 'Ask for a cigarette',
  minutes: 5,
  drunkenness: {min: 2},
  isVisible: (night) => !hasStory(night, TRAM_STORY),
  next: 'cigarette',
},
```

The helper is pure on the night. Saving belongs to the night screen, as saving the volumes belongs
to the Options window.

### The log (`core/log.ts`)

```ts
| {
    kind: 'story';

    /** The minute of the night the story was achieved. */
    minutes: number;

    /** The story's title. */
    text: string;
  }
```

`logStory(night, title)` pushes it. `formatLog` renders it as it renders a choice, one italic line
with the marks round the whole: `*23:10  A story: The guitarist who plays for one*`, wrapped at the
width. The log screen pages it like any line, and `splitMarked` reads its italic as it reads a
choice's. The test helper `describeEntry` reads its text as a choice's.

### The toast (`screens/toast.ts`, `screens/nightScreen.ts`)

`Toast` is a part the night screen owns, as it owns the backdrop:

```ts
export type ToastOptions = {
  scheduler: Scheduler;
  title: string;
  /** The width the title wraps at: the story window's text width. */
  textWidth: number;
  /** Called once the toast has faded out. */
  onDone: () => void;
};

export class Toast {
  readonly view: Container;
  constructor(options: ToastOptions);
  /** Fades in, waits, fades out, then calls `onDone`. */
  show(): void;
  /** Lays the toast out again at a new width. */
  resize(textWidth: number): void;
  destroy(): void;
}
```

Its view is a panel in the Look row's form, a column with the window's paddings and gap: the rose
title line "A story" through `createWindowTitle`, and under it a text leaf with the title wrapped by
`wrapText` at the text width. The panel is as wide as its longest line plus the window's paddings,
at most the story window's width. On the narrowest screen the text is 19 glyphs wide, "The guitarist
who plays for one" takes two lines, and the toast is 59 pixels tall. The view's event mode is none,
so it takes no tap and no focus; a tap on it reaches what is under it.

`show` uses Tellurion's `Fader` on the screen's scheduler for the 100 ms in and out, and the
scheduler's one-shot timer for the 3 seconds between. A screen change clears the scheduler before
`onHide`, so a toast never outlives its screen.

The night screen's contents gain `toast: Toast | null`, `toastQueue: string[]` and
`storiesHandled: number`, the count of the night's finds it has handled; `onShow` resets the three.
`onUpdate`, after it updates the story window, handles the finds:

```ts
function handleStories(screen: NightScreen): void {
  let {night, toastQueue} = screen.contents;

  // Compared each frame, as the status string is.
  while (screen.contents.storiesHandled < night.stories.length) {
    toastQueue.push(night.stories[screen.contents.storiesHandled]!.title);
    screen.contents.storiesHandled += 1;
    saveCollection();
  }

  if (screen.contents.toast === null && toastQueue.length > 0 && screen.state === 'shown') {
    showToast(screen, toastQueue.shift()!);
  }
}
```

`showToast` builds the toast, positions it at the bottom of the screen, centred, one margin above
the edge, adds it to the UI root last, so it is above the story window, its backdrop, the travel
window and the Menu button, and shows it; `onDone` removes it from the root, destroys it and clears
the slot, so the next title in the queue gets its toast on the next frame. A menu opened while a
toast shows is added after it and goes above it.

`showPlace` re-adds the status line, the Menu button, the spot buttons and the backdrop to the UI
root in order; a toast still showing is re-added after them, so it stays on top through the fade to
black. `layOut` re-centres it on a resize and gives it the new text width. `onHide` destroys it and
empties the queue, and calls `saveCollection()` once more, so Quit to menu loses nothing.

The log screen needs no toast: nothing is found there.

### The Stories window (`screens/storiesWindow.ts`, `screens/menuModal.ts`, `screens/logScreen.ts`)

`StoriesWindow` is built per opening, as the menu and the Options window are, and owns a modal, as
the travel window does:

```ts
export type StoriesWindowOptions = {
  ui: UiRoot;
  scheduler: Scheduler;
  night: Night | null;
  /** Called once the window has closed. */
  onClosed: () => void;
};

export class StoriesWindow {
  readonly modal: Modal;
  constructor(options: StoriesWindowOptions);
  /** Lays the window out again for the screen's size, keeping the page. */
  resize(): void;
}
```

The modal has the 100 ms fade, nothing focused on open, and closes on cancel, so Escape closes it;
it is added as an overlay in the constructor. Its panel:

- The title, through `createWindowTitle`: `Stories  3 found`. Seventeen characters at most for two
  digits, within the narrowest screen's 19.
- A `TextBlock` with the night's list: one entry per line, `23:10  The guitarist who plays for one`,
  wrapped at the text width, in the night's order, no blank lines between. An empty list reads
  `None yet` while the night runs and `None` once `isNightOver` says it is over. A null night reads
  as empty and over.
- The width is the story window's: `WINDOW_WIDTH`, or the screen less the margins when narrower. The
  block holds as many lines as the list needs, up to the lines the scene area allows after the
  margins, the paddings, the title and its gap, and the button rows and their gaps, counted as the
  log screen counts its lines. A list that needs more is cut into pages with `getPageBreaks`.
- Back and Next, in a row under the text, only when there is more than one page, greyed at the ends
  as on the log screen; when a turn disables the focused button the focus moves to the other.
- Close, under them, full width, always.

`resize` lays the panel out again for the new width and height and shows the page that holds the
first line of the page shown before.

**The menu.** `openMenuModal` gains `onStories` and a Stories button between Resume and Options; the
buttons share the width of the longest label, still "Quit to menu". The menu screen type gains
`storiesWindow: StoriesWindow | null` and `night: Night | null`; `openMenu` wires `onStories` to a
new window above the menu, which stays open underneath, as for Options, and Close or Escape returns
to it with the focus on Stories. `destroyMenus` destroys the window too. Both screens call `resize`
on it from their `onResize`.

**At the end.** The log screen's `onShow` lays the screen out, which gives the UI root its layout,
and then opens the Stories window above the log; a modal is sized against that layout, so the order
is fixed. Close or Escape shows the log with nothing focused. Escape here closes the window and does
not open the menu, by the cancel rule that exists: the overlay on top had `close`.

### The checker (`core/checkContent.ts`)

Today a choice's effect runs only for a place's or a spot's script, on one fresh night at 16:00, to
check the way out; a node's entry effect never runs. Three changes:

1. **Every effect runs on every check night.** For every script, places, spots, closings, journeys
   and the end, each choice's mapped effect and each node's entry effect run on a fresh check night
   of their own, one per place, time and level. The way-out rules move onto these runs unchanged. An
   entry effect that throws is reported as a choice's is: `${path}: throws "…"`.
2. **The titles are gathered and checked.** After each run the checker reads what the night's list
   gained. Each title is checked once, under the path of the effect that gave it: not empty, no
   italic mark, no word longer than `WORD_ROOM`, phrased as the text's word rule is. An effect that
   gives a story under a condition of its own, on the hour or on the roll, is still caught, because
   the effects run on every check night and after the roll.
3. **Two collections.** Every check night is made twice: with an empty collection and with a full
   one holding every title gathered. Everything the checker calls runs on both: the texts, the
   starts, the nexts, the odds, the visibility and the effects. So a text that reads `hasStory` is
   evaluated both ways, and the way out that costs nothing holds when achieved stories hide choices.
   The count doubles, from 1050 to 2100 nights per script, a fraction of a second over 45 scripts.

The content test keeps its one line: the game's content gives the empty list.

### The jump-in (`core/getJumpIn.ts`, `routes/_index.tsx`)

`getJumpIn` reads `stories`. Its only value is `none`, which sets `forgetStories: true` on the
result; any other value is ignored with the warning the other parameters give, and, as for every
parameter, a valid `place` is needed. The route calls `forgetStories()` when the flag is set, before
it shows the night screen, so the night starts with an empty collection and an empty store.

### The content

Eleven scenes get the helper, where the content already branches on the hour, the dice, the level or
the money, plus two plain anecdotes. Every title is stand-in text written with the `standIn` tag, so
`scripts/list-stand-ins.mjs` counts it; each content file's header comment gains the line that a
story's title is a stand-in too. Every call sits in an entry effect, because the story is the text
the player then reads.

| Place and node                    | Reached by                            | Title, stand-in                 |
| --------------------------------- | ------------------------------------- | ------------------------------- |
| Rotor's room, `song`              | 22:00 to 01:00, after Ask for a song  | The guitarist who plays for one |
| Rotor's room, `welcomed`          | the spare chair's roll won            | A seat at the table             |
| Rotor's room, `spilled`           | the roll lost above 0.9               | The spilled beer                |
| Rotor's street, `cigarette`       | level 2 or more                       | The tram that stopped early     |
| The Whisky Shop's room, `bottle`  | level 1 or less                       | A bottle saved for an occasion  |
| The Whisky Shop's room, `goodOne` | 180 Kč                                | The good one                    |
| The forecourt, `given`            | 20 Kč to the stranger                 | Twenty crowns                   |
| The hall, its start node          | no condition                          | The station that never moved    |
| Náměstí Republiky, `knows`        | the shelter's roll won                | The man who knew the timetable  |
| Židenice, the bench               | no condition                          | A train not on the timetable    |
| Rotor's closing script, its start | the bar closes with the player inside | Thrown out at three             |

Ask for a cigarette and Ask about the bottle gain `isVisible: (night) => !hasStory(night, title)`,
so a later night no longer offers them. Both nodes keep their free way out, which the checker
confirms on the full collection.

The collection holds titles. A title renamed when the real text is written counts as a new story for
a player who achieved the old one; the old title stays in their store, unmatched and harmless. Phase
7 can give stories ids if that matters by then.

### The direction document

With this spec the direction document gains a Stories row in Decisions, rewords the phase 6 row and
the Text row, drops "the story collection is kept" from the phase 7 row, and lists phase 6's three
specs.

## Error handling

| What goes wrong                                                    | In CI                                           | In the running game                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------- |
| Storage is missing, or the stored value is unreadable or invalid   |                                                 | The store warns once; the collection starts empty                     |
| A save fails                                                       |                                                 | The store warns; the night goes on, the toast still shows             |
| An entry effect or a choice's effect throws                        | The checker reports it under its path           | The runner throws and the error screen shows it, as today             |
| A title is empty, carries a mark, or has a word over 16 characters | The checker reports it                          | The toast and the list show it as it is                               |
| An achieved story hides the only free choice of a node             | The checker reports no way out, full collection | The player would be stuck in the window                               |
| A story is found in the frame a screen change starts               |                                                 | No toast is built; `onHide` saves the find                            |
| Two stories are found in one frame                                 |                                                 | Both are saved at once; the toasts follow one another                 |
| The Stories window is opened on the log screen with no night       | Not possible                                    | `Stories  0 found`, `None`                                            |
| A resize while the Stories window is open                          |                                                 | The window lays out again and keeps its page; the menu under it stays |

## Testing

Unit tests, in `tests/`:

- **`night.test.ts`.** A new night has an empty list and its own empty collection; a collection
  passed in is the one the night holds; the whole-object comparison gains the two fields.
- **`stories.test.ts`.** New. A find adds the title to the collection, to the night's list with the
  minute and to the log; the same title again adds nothing anywhere; a title already in a collection
  handed to a new night gives nothing; `hasStory` both ways; two nights sharing one collection see
  each other's finds.
- **`log.test.ts`.** A story entry renders as one italic line with "A story:", and a long one wraps
  inside its marks.
- **`checkContent.test.ts`.** An entry effect that throws is reported; an empty title, a marked
  title and a long word are reported under the effect's path; a title given under an hour condition
  inside the effect is found; a text that throws only when a story is achieved is reported, which
  proves the full collection runs; a choice hidden by an achieved story that leaves no free way out
  is reported.
- **`getJumpIn.test.ts`.** `stories=none` gives the flag; another value is ignored with a warning;
  without a place it is ignored.
- **`listStandIns.test.ts`.** A `standIn` title is counted.
- **`content.test.ts`.** The game's content gives the empty list; the entry effect of Rotor's song
  records its title on a night.

Browser tests, in `tests/`:

- **`stories.browser.test.ts`.** New, on the model of the settings suite with a fresh import per
  test: nothing stored gives an empty collection; a stored list loads; text that is not JSON gives
  an empty one; the save writes the titles; forgetting empties the object in place and removes the
  key.
- **`storiesToast.browser.test.ts`.** New, in the fixed world, which gains a patron whose node finds
  a story and a choice hidden once achieved: the toast appears above the window with "A story" and
  the title; a tap on it reaches the window and continues the text; it is gone after its time,
  checked with generous waits since frames run 100 to 250 ms; two finds in one node show one toast
  after the other; the collection is in storage after the find; the same node on a second New Game
  gives no toast, no entry, and the hidden choice is gone; the menu has Stories, the window lists
  the find, Escape returns to the menu with the focus on Stories; a resize keeps the window; Quit to
  menu destroys it.
- **`logScreen.browser.test.ts`.** The Stories window opens above the log at the end with the
  night's list; Close shows the log with nothing focused; Menu then Stories opens it again; an empty
  night reads `None`; Escape closes the window and does not open the menu.
- **`nightScreenEnd.browser.test.ts`.** The end flow passes through the Stories window to the log.
- **`jumpIn.browser.test.ts`.** `stories=none` starts with an empty collection and an empty store.

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
- `node scripts/list-stand-ins.mjs` counts the eleven titles.
- No file under `apps/somewhere/` or `packages/tellurion/` has changed.

## Non-goals

- The quest, its flags and its scenes (spec 2), and the endings and sleep (spec 3).
- A collection screen from the main menu, across nights, and a reset button (phase 7).
- Ids for stories; titles are the key.
- A sound when a story is achieved.
- The journal as a novel (shelved).
- Changes to Somewhere and to Tellurion.

## Rejected

- **A mark on a node or a spot that the window detects.** The conditions a story depends on are the
  script's; an effect carries them all, a mark carries none.
- **A `story` field on the choice and the node, mapped by `defineScript`.** Read as data by the
  checker, but one more content API before real content repeats the pattern; the helper is one line
  too, and sits inside any condition the effect writes.
- **The list of stories as the distinct titles of the log.** "The timetable" and "The bench" are not
  stories.
- **The collection as a singleton read inside `createNight`.** The checker needs nights with an
  empty collection and nights with a full one, and the core's unit tests would warn on storage.
- **Saving inside `findStory`.** The core stays free of storage; the screen saves, as the Options
  window saves the volumes.
- **The collection in memory until phase 7.** The once-across-all-runs rule would be half true, and
  every reload during the author's checks would re-achieve everything.
- **A story found by a choice's effect for the eleven.** The story is the text the player then
  reads; a choice's effect would give it a page early.
- **The count in the status line.** The longest status is 24 characters and the narrowest screen's
  row holds 23; nothing fits.
- **A sound with the toast.** The set has a click, an error and a blip, none of which says "a
  story".
- **The list on the log screen's first page.** The window serves the menu during the night too; one
  part for both.
- **Back, Next and Close in one row.** They do not fit the narrowest screen, as the log screen
  found.
- **A reset button in Options.** It erases progress with nothing to show what it erases; phase 7's
  collection screen is its place.
