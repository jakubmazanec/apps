# The End of the Night and the Log (Foam Phase 5, Spec 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The night ends when the clock reaches 08:00: the window that crossed it closes to black,
an end text opens, and a screen of its own then shows the log of the night, every text read and
every choice taken with its time, page by page, with the night's status line and Menu button above
it.

**Architecture:** `night.log` is a list of entries that the story window writes as it shows a page
or takes a press, and the night screen writes once, for the travel picked; `core/log.ts` formats the
list into one marked text that `getPageBreaks` cuts into pages. The night screen checks the end
first whenever a window has closed: the first time it takes the place off and opens
`content/nightEnd.ts`, the second time it hands the night to the log screen. The log screen is a
`GameScreen` with the night screen's top row, one window titled "The night", a `TextBlock` (the
story window's two leaves, moved into a part both windows use) and Back and Next.

**Tech Stack:** TypeScript 6 (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Tellurion
(`GameScreen`, `Dialogue`, `Button`, `Container`, `Modal`, `Panel`, `Text`, `wrapText`), Pixi.js 8,
Vitest 4 (`unit` in Node, `browser` in Playwright's Chromium), Prettier 3, Turborepo.

**Spec:** `apps/foam/docs/superpowers/specs/2026-10-10-end-of-the-night-and-log-design.md`

Runs after the plan `apps/foam/docs/superpowers/plans/2026-10-10-locations-and-hours.md`, which is
built first: `core/hours.ts` holds `NIGHT_END`, the fixed bar's hours end at 08:00
(`[[960, 1380], [1410, 1920]]`), `tests/fixedWorld.ts` exports `FIXED_BAR_LOCATION`, the travel
window's parts are read through `getTravelParts(…).locations`, and `formatTime` formats a clock.

## Global Constraints

- Only files under `apps/foam/` change. Nothing under `apps/somewhere/` or `packages/tellurion/`. No
  dependency changes.
- Work on the current branch, `somewhere-update`. Commit at the end of each task with `git add` of
  the task's own paths; a message is one short imperative sentence, with no prefix and no trailer
  lines. Never use `git stash`. Commands run from `apps/foam` unless a step says otherwise.
- **Tests.** A task runs only the tests it touches: the unit project, or the browser files named in
  the task, plus `npm run typecheck` and `npx eslint source tests scripts`. The whole suite is CI's,
  after the last task. Lint expectation: 0 errors; the known warnings of earlier phases may print.
- Code style: `let` for locals, `const` only at module level; relative imports end in `.js`;
  comments say why and stay within 100 columns; never remove a comment. Class members are sorted
  alphabetically within their group (`perfectionist/sort-classes`), and so are the keys of a
  screen's contents type. Prettier formats (printWidth 100, no bracket spacing, single quotes) and
  lint fails on a difference: run `npx prettier --write` on the task's files before lint. A
  type-only import may close a cycle (`import/no-cycle` lets it through); a runtime cycle between
  screens gets the `eslint-disable-next-line import/no-cycle` comment the night screen and the main
  menu already carry, with the same reason.
- `exactOptionalPropertyTypes` is on: never set an optional field to `undefined`; a field that may
  hold `undefined` is declared `name: T | undefined`, as `LogEntry.speaker` is.
- Tests: the `vitest` object, not `vi`; every `vitest.fn` takes a type parameter; a blank line
  separates a group of `expect` lines from other statements; `describe(fn, …)` when named after a
  function; no `expect` inside `beforeAll` or `beforeEach`; game modules are imported after
  `bootGame`, never at the top of a browser test (types only at the top); every browser test file
  mocks `content/pictures/barPicture.js` with `PROOF_PICTURE`; taps go through `tap`
  (`userEvent.click`); `console.warn` for anything a browser test must print; a browser file boots
  the game once.
- `core/log.ts`, `core/night.ts`, `core/hours.ts`, `core/travel.ts`, `core/checkContent.ts` and
  everything under `content/` never import `core/game.ts`, directly or through a screen: the unit
  tests read them in Node. `formatLog` therefore takes its measure as a parameter.
- Exact values from the spec: the night is over at `night.minutes >= NIGHT_END` (1920); the end
  text's speaker is `Morning`; a logged choice is the label as the button read it
  (`Order a beer  10 min  45 Kč`) at the minute before its costs; a logged travel is
  `Walk to Rotor Bar  12 min` (the way word, `to`, the location's name, then the numbers two spaces
  apart, a price of 0 left out); a text entry is its time, two spaces and the window's title on one
  line and its text under them; a choice is one line in italic, its time, two spaces and its label;
  a blank line separates entries; the log screen's title is `The night  3 of 12` (two spaces); its
  buttons read `Back` and `Next`; the window is `WINDOW_WIDTH` (300) wide or the screen less the
  margins, and the text block holds `linesPerPage` lines, at least 1.
- Stand-in content keeps the limits of the content files' header comment: written with `standIn`, no
  word longer than 16 characters, every node sets `speaker`, italic marks in pairs.

## Review Focus

- **Escape on the log screen.** A stray Escape must not lose the log, which no screen can show
  again: it opens the night's menu above the window, and Escape again closes the menu. Pinned in
  Task 3.
- **The log screen without a log.** `showLog` never called, or a night whose log is empty, shows one
  empty page, `The night  1 of 1`, Back and Next both disabled, and Tab reaches Menu. Pinned in
  Task 3.
- **A resize while the menu lies over the log.** The pages are cut again, the page shown is the one
  that holds the offset the shown page began at, and the menu stays above. Pinned in Task 3.
- **New Game after a night that ended.** `hasEnded` is false again, the night is fresh and its log
  holds nothing but the first description. Pinned in Task 4.
- **A choice label with a stray mark.** The label's own marks are stripped before the line is
  wrapped in marks, so one asterisk cannot turn the rest of the log italic. Pinned in Task 1.

## File Structure

| File (under `apps/foam/`)                                     | Responsibility                                                                                              | Task    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| `source/game/core/log.ts`                                     | New. `LogEntry`, `logText`, `logChoice`, `formatLog`                                                        | 1       |
| `source/game/core/night.ts`                                   | `log` on the night; `createNight` starts it empty                                                           | 1       |
| `source/game/core/hours.ts`                                   | `isNightOver`                                                                                               | 1       |
| `source/game/core/travel.ts`                                  | `WAY_WORDS`, `formatTravel`                                                                                 | 1       |
| `source/game/screens/travelWindow.ts`                         | The way words from `core/travel.ts`                                                                         | 1       |
| `source/game/screens/storyWindow.ts`                          | Logs each page it shows and each choice pressed (2); its text block becomes a `TextBlock` (3)               | 2, 3    |
| `source/game/screens/nightScreen.ts`                          | The travel logged (2); `openMenu` moves out (3); the end, and black on the close of the crossing window (4) | 2, 3, 4 |
| `source/game/screens/menuModal.ts`                            | `openMenu`, shared by the night screen and the log screen                                                   | 3       |
| `source/game/core/getSceneArea.ts`                            | `WINDOW_GAP`, `CHOICES_GAP`, `BUTTON_GAP` move here from the story window                                   | 3       |
| `source/game/screens/textBlock.ts`                            | New. `TextBlock`                                                                                            | 3       |
| `source/game/screens/logScreen.ts`                            | New. The log screen                                                                                         | 3       |
| `source/routes/_index.tsx`                                    | Registers the log screen                                                                                    | 3       |
| `source/game/content/nightEnd.ts`                             | New. The end text                                                                                           | 4       |
| `source/game/core/checkContent.ts`                            | `Content.end`, checked under `end › start`                                                                  | 4       |
| `scripts/list-stand-ins.mjs`                                  | Counts `nightEnd.ts` with the journeys                                                                      | 4       |
| `tests/nightScreenHelpers.tsx`                                | `waitForTravelWindow`, `chooseWayOut`, `pickDestination` move here from the places test                     | 2       |
| `docs/direction.md`, `docs/superpowers/specs/…-log-design.md` | State that the spec is built; phase 5 is built                                                              | 5       |

---

### Task 1: The log's model, the end of the clock and a travel's words

**Files:**

- Create: `source/game/core/log.ts`
- Modify: `source/game/core/night.ts:15-36,44-59`, `source/game/core/hours.ts`,
  `source/game/core/travel.ts`, `source/game/screens/travelWindow.ts:127,307`
- Test: `tests/log.test.ts` (new), `tests/night.test.ts:14-24`, `tests/hours.test.ts`,
  `tests/travel.test.ts`

**Interfaces:**

- Consumes: `formatTime`, `NIGHT_END` (plan 3); `stripMarks`, `MARK`; `wrapText` from `tellurion`;
  `formatCosts`; `Destination`.
- Produces, in `core/log.ts`, the spec's `LogEntry` with its doc comments, and:

```ts
export function logText(night: Night, speaker: string | undefined, text: string): void;
export function logChoice(night: Night, text: string): void;

/**
 * The log as one marked text, wrapped to the width: a text entry is its time and its title on one
 * line and its text under them; a choice is one line in italic, its time and its label; a blank
 * line separates entries. Empty for an empty log. `measure` gives the width of a piece of text and
 * does not count the marks, as the story window's measure does not.
 */
export function formatLog(
  log: readonly LogEntry[],
  width: number,
  measure: (text: string) => number,
): string;
```

`Night` gains `log: LogEntry[]`
(`/** Every text read and every choice taken, with its time; the story window and the night screen write it. */`),
last; `createNight` starts it `[]`. `night.ts` imports the type from `./log.js` and `log.ts` imports
`{type Night}` from `./night.js` (type-only both ways). In `core/hours.ts`:

```ts
/** Whether the clock has reached the end of the night. */
export function isNightOver(night: Night): boolean;
```

In `core/travel.ts`:

```ts
/** The way as the travel window's row and a logged travel name it. */
export const WAY_WORDS: Readonly<Record<Way, string>> = {walk: 'Walk', tram: 'Tram', taxi: 'Taxi'};

/** "Walk to Rotor Bar  12 min  25 Kč": the way, the destination and its numbers. */
export function formatTravel(destination: Destination): string;
```

The travel window's `WAY_LABELS` goes; it imports `WAY_WORDS`.

Decisions the spec leaves to the plan:

- `formatLog` builds one block per entry and joins the blocks with `'\n\n'`. A text entry's first
  line is `formatTime(minutes)` and, when `speaker` is defined, two spaces and the speaker; its text
  follows on the next line, `wrapText(text, width, measure)`. A choice's block is
  ``wrapText(`${MARK}${time}  ${stripMarks(text)}${MARK}`, width, measure)`` (two spaces between the
  time and the label): the marks ride on the first and the last word, and `measure` does not count
  them.
- `formatTravel` is `` `${WAY_WORDS[way]} to ${location.name}` `` and, when
  `formatCosts(destination)` is not empty, two spaces and the costs.

- [ ] **Step 1: Write the failing tests**

`tests/log.test.ts`, with `measure = (text: string) => stripMarks(text).length * GLYPH_WIDTH` and a
night from `createNight({place: 'rotorBarRoom', minutes: 1180, money: 350})`:

- `describe(logText)`: `writes the page with the night's minutes and the window's title`:
  `logText(night, 'The bar', 'Hello.')` then `night.minutes = 1190` and
  `logText(night, undefined, 'No title.')`: `night.log` is
  `[{kind: 'text', minutes: 1180, speaker: 'The bar', text: 'Hello.'}, {kind: 'text', minutes: 1190, speaker: undefined, text: 'No title.'}]`.
- `describe(logChoice)`: `writes the label with the night's minutes`: `logChoice(night, 'Go')` gives
  `[{kind: 'choice', minutes: 1180, text: 'Go'}]`.
- `describe(formatLog)`:
  - `gives a text entry its time and title, a choice one italic line, and a blank line between`: the
    entries
    `{kind: 'text', minutes: 1180, speaker: 'The bar', text: 'The bartender nods at the taps.'}`,
    `{kind: 'choice', minutes: 1180, text: 'Order a beer  10 min  45 Kč'}`,
    `{kind: 'text', minutes: 1190, speaker: 'The bar', text: 'The beer is cold and the foam is thick, and for a while nothing else needs doing.'}`
    at width `36 * GLYPH_WIDTH` give exactly
    `'19:40  The bar\nThe bartender nods at the taps.\n\n*19:40  Order a beer  10 min  45 Kč*\n\n19:50  The bar\nThe beer is cold and the foam is\nthick, and for a while nothing else\nneeds doing.'`.
  - `wraps a long label, strips its own marks and keeps the whole line italic`:
    `{kind: 'choice', minutes: 1180, text: 'Ask about the *better* beer of the winter the pipes froze'}`
    at `20 * GLYPH_WIDTH` gives
    `'*19:40  Ask about the\nbetter beer of the\nwinter the pipes\nfroze*'`.
  - `keeps a text's marks`:
    `{kind: 'text', minutes: 1180, speaker: 'A patron', text: 'The beer was *better* then.'}` gives
    `'19:40  A patron\nThe beer was *better* then.'`.
  - `gives a page without a title its time alone`: `speaker: undefined`, text `'Dark.'` →
    `'19:40\nDark.'`.
  - `gives an empty string for an empty log`.
  - `a page that starts inside a choice's line is italic`: the long-label log above at
    `20 * GLYPH_WIDTH`; `let [offset] = getPageBreaks(formatted, 2)`;
    `splitMarked(formatted, offset, formatted.length)` has a `regular` that matches `/^[ \n]*$/` and
    an `italic` that contains `'winter the pipes'`.

`tests/night.test.ts`: the first test's `toEqual` gains `log: []`.

`tests/hours.test.ts`, `describe(isNightOver)`: `is over from 08:00`: a night at 1919 → false, 1920
→ true, 1921 → true.

`tests/travel.test.ts`, `describe(formatTravel)`: `names the way, the location and the numbers`:
with `alpha = START.locations.rotorBar`, `{location: alpha, way: 'walk', minutes: 12, price: 0}` →
`'Walk to Alpha  12 min'`; `{…, way: 'tram', minutes: 17, price: 25}` →
`'Tram to Alpha  17 min  25 Kč'`; `{…, way: 'taxi', minutes: 11, price: 170}` →
`'Taxi to Alpha  11 min  170 Kč'`.

Run:
`npx vitest run --project unit tests/log.test.ts tests/night.test.ts tests/hours.test.ts tests/travel.test.ts`
Expected: FAIL (module not found; no `log`; no `isNightOver`; no `formatTravel`).

- [ ] **Step 2: Implement**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/log.ts source/game/core/night.ts source/game/core/hours.ts source/game/core/travel.ts source/game/screens/travelWindow.ts tests/log.test.ts tests/night.test.ts tests/hours.test.ts tests/travel.test.ts
npx vitest run --project unit
npm run typecheck
npx eslint source tests scripts
git add source/game/core/log.ts source/game/core/night.ts source/game/core/hours.ts source/game/core/travel.ts source/game/screens/travelWindow.ts tests/log.test.ts tests/night.test.ts tests/hours.test.ts tests/travel.test.ts
git commit -m "Keep a log on the night and know when the night is over"
```

Expected: PASS (every `toEqual` on a night elsewhere is in a browser test, Task 2); typecheck 0;
eslint 0 errors.

### Task 2: The story window and the night screen write the log

**Files:**

- Modify: `source/game/screens/storyWindow.ts:187-236,324-371,379-413`,
  `source/game/screens/nightScreen.ts` (`createTravelWindow`'s `onClosed`)
- Test: `tests/nightScreen.browser.test.ts:986-1020,1141-1191`,
  `tests/nightScreenPlaces.browser.test.ts`, `tests/nightScreenHelpers.tsx`

**Interfaces:**

- Consumes: `logText`, `logChoice`, `formatTravel` (Task 1); `formatChoice`.
- Produces: the story window logs the runner's first page in its constructor, right after
  `#showNode()`, and in `update` in the branch that calls `#showNode()` again (the node or the page
  has changed, or the node was entered again); never in `resize`. The entry is
  `logText(this.#night, node.speaker, this.dialogue.pageText)` for a node that is not null. A choice
  button's `onClick` calls `logChoice(this.#night, formatChoice(choice, this.#night))` with
  `choice = this.#choices[index]` before `this.dialogue.choose(index)`. The night screen's
  `onClosed` of the travel window calls
  `logChoice(screen.contents.night, formatTravel(destination))` before `takeJourney`.
- `tests/nightScreenHelpers.tsx` gains `waitForTravelWindow(harness)`,
  `chooseWayOut(harness, label)` and `pickDestination(harness, travelWindow, location)`, moved from
  `tests/nightScreenPlaces.browser.test.ts` with their comments, taking the harness as their first
  parameter; the places test imports them.

- [ ] **Step 1: Write the failing browser tests**

`tests/nightScreen.browser.test.ts`:

- In `an arrow key focuses the first choice, and Enter orders a beer`: the `toEqual` on the night
  gains `log: expect.any(Array)`, and after it `night.log.slice(-2)` matches
  `[{kind: 'choice', minutes: 1180, text: BEER_LABEL}, {kind: 'text', minutes: 1190, speaker: 'The bartender', text: expect.stringContaining('She pulls a beer')}]`
  (`toMatchObject`): the choice at the press, before its ten minutes; its text at 19:50.
- In `a resize in the middle of a text keeps the place and wraps the text again`: before the resize,
  `night.log.filter((entry) => entry.kind === 'text' && entry.speaker === 'A patron')` has 3 entries
  (the table, the talk and the ceiling, whose long text is one page of the runner); after
  `readPages` the count is still 3: the window's own pages and a resize log nothing.

`tests/nightScreenPlaces.browser.test.ts`, in `a journey, from the door to the arrival`: after
`startJourney`, with
`let describe = (entry) => [entry.kind, entry.minutes, entry.kind === 'text' ? entry.speaker : entry.text]`,
`contents.night.log.slice(-4).map(describe)` is
`[['text', 1180, 'The street'], ['choice', 1180, 'Take a taxi'], ['choice', 1180, 'Taxi to The bar  6 min  120 Kč'], ['text', 1186, 'The taxi']]`;
after `waitForPlace`, the last entry is `['text', 1186, 'The bar']`.

Run:
`npx vitest run --project browser tests/nightScreen.browser.test.ts tests/nightScreenPlaces.browser.test.ts`
Expected: FAIL (the log stays empty).

- [ ] **Step 2: Implement, and move the three helpers**

As in Interfaces.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/screens/storyWindow.ts source/game/screens/nightScreen.ts tests/nightScreen.browser.test.ts tests/nightScreenPlaces.browser.test.ts tests/nightScreenHelpers.tsx
npx vitest run --project browser tests/nightScreen.browser.test.ts tests/nightScreenPlaces.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/screens/storyWindow.ts source/game/screens/nightScreen.ts tests/nightScreen.browser.test.ts tests/nightScreenPlaces.browser.test.ts tests/nightScreenHelpers.tsx
git commit -m "Write every page shown, every choice pressed and every travel picked into the log"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 3: The text block and the log screen

**Files:**

- Create: `source/game/screens/textBlock.ts`, `source/game/screens/logScreen.ts`
- Modify: `source/game/core/getSceneArea.ts`,
  `source/game/screens/storyWindow.ts:58-64,137,155-171,559-571,619-649,699-728`,
  `source/game/screens/menuModal.ts`, `source/game/screens/nightScreen.ts:516-546,575-577,709-713`
  (`openMenu` moves out), `source/routes/_index.tsx:17-34,50-52`
- Test: `tests/logScreen.browser.test.ts` (new); `tests/nightScreen.browser.test.ts` is unchanged
  and is the check for the story window and for the moved menu

**Interfaces:**

- Consumes: `formatLog` (Task 1); `getPageBreaks`, `splitMarked`, `stripMarks`, `measureText`,
  `formatStatus`, `createWindowTitle`, `TITLE_HEIGHT`, `WINDOW_PADDING`, `getSceneArea`,
  `TOP_ROW_WIDTH`, `playFocusSound`, `input`; the night screen's `openMenu`, moved.
- Produces: in `core/getSceneArea.ts`, moved from the story window with their comments,
  `export const WINDOW_GAP = 4` (between the title block and the text),
  `export const CHOICES_GAP = 8` (between the text and the buttons under it) and
  `export const BUTTON_GAP = 4` (between two buttons in a column); the story window imports them. In
  `screens/textBlock.ts`:

```ts
/**
 * A text in two leaves of the same size at the same place, one per font, regular and italic: every
 * letter advances by 6 in both, so a letter lands where it would in one text, and each leaf has
 * spaces where the other one draws. The story window and the log screen show their text in one.
 */
export class TextBlock extends Container {
  constructor({width, height}: {width: number; height: number});

  /**
   * Shows the piece of the marked text from `start` to `end`. The marks before `start` are counted,
   * so a piece that starts inside an italic passage starts in italic.
   */
  show(text: string, start: number, end: number): void;
}
```

The story window's `#regularLeaf`, `#italicLeaf` and `leafLayout` go; `#textBlock` is
`TextBlock | null`, built in `#showNode` with `{width: textWidth, height: textHeight}` and added to
the panel as a child; `#showRevealed` calls
`this.#textBlock?.show(this.#wrapped, pageStart, revealedCount)`. `getWindowParts` still finds the
block: it is a `Container` whose two children are `Text`s.

In `screens/logScreen.ts`, `export const logScreen: GameScreen<LogScreenContents>` with

```ts
type LogScreenContents = {
  back: Button;

  /** The log as one marked text, wrapped to the text's width. */
  formatted: string;

  /** The topmost overlay at the end of the last update; see the night screen. */
  lastTopOverlay: Overlay | null;
  linesPerPage: number;
  menuButton: Button;
  menuModal: Modal | null;
  next: Button;

  /** The night whose log is shown; null before the first `showLog`. */
  night: Night | null;
  optionsModal: Modal | null;

  /** The page shown, from 0. */
  page: number;

  /** The offset at which each page starts: 0, then the breaks. */
  pageStarts: number[];
  panel: Panel;

  /** Keeps the night for the next show; `onShow` lays the screen out from it. */
  showLog: (night: Night) => void;
  statusText: Text;
  textBlock: TextBlock | null;
  title: Text;
  titleBlock: Container | null;
};
```

`routes/_index.tsx` imports `logScreen` with the other screens and calls
`importedGame.addScreen(logScreen)` after the night screen.

Decisions the spec leaves to the plan:

- **Children and Tab.** The UI root gets `statusText`, `panel`, `menuButton`, in that order: the Tab
  order is depth-first, so with nothing focused Tab reaches Next (Back is disabled on the first
  page) before Menu. An arrow key follows the engine's rule from the top left, as everywhere.
  Nothing is focused on show: `GameScreen.hide` cleared the focus, and `onShow` focuses nothing.
- **Layout.** `layOut(screen)`: `area = getSceneArea(…)`; the root's view layout is
  `{width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', paddingTop: area.top}`,
  so the panel is centred in the scene area as the story window is, while the status text and Menu
  stand `position: 'absolute'` in the top row exactly as the night screen's `layOut` places them
  with no place shown; `windowWidth = Math.min(WINDOW_WIDTH, Math.floor(area.width - 2 * MARGIN))`,
  `textWidth = Math.max(1, windowWidth - 2 * WINDOW_PADDING_X)`,
  `linesPerPage = Math.max(1, Math.floor((area.height - 2 * MARGIN - 2 * WINDOW_PADDING_Y - TITLE_HEIGHT - WINDOW_GAP - CHOICES_GAP - BUTTON_HEIGHT) / LINE_HEIGHT))`;
  `formatted = formatLog(night?.log ?? [], textWidth, (text) => measureText(stripMarks(text)))`;
  `pageStarts = [0, ...getPageBreaks(formatted, linesPerPage)]`; the page becomes the last index
  whose start is at or below the offset the shown page began at (`pageStarts[page] ?? 0` read before
  the cut). The panel's old title block and text block are removed and destroyed, Back and Next are
  taken out of their row before the row is destroyed (as the travel window's `#takeApart` keeps its
  controls), and the panel gets a new title block (`createWindowTitle('', textWidth)`, whose first
  child is `title`), a new `TextBlock` of `textWidth × linesPerPage * LINE_HEIGHT`, and a new row
  `Container` of Back and Next with `gap: BUTTON_GAP`, `width: textWidth`, `height: BUTTON_HEIGHT`
  and `marginTop: CHOICES_GAP - WINDOW_GAP`, the panel's layout being
  `{...WINDOW_PADDING, flexDirection: 'column', gap: WINDOW_GAP}`. Then `showPage(screen)`.
- **`showPage(screen)`**: the title is `` `The night  ${page + 1} of ${pageStarts.length}` ``;
  `textBlock.show(formatted, pageStarts[page], pageStarts[page + 1] ?? formatted.length)`; Back is
  disabled on page 0 and enabled otherwise, Next disabled on the last page and enabled otherwise;
  when the focused button is now disabled and the other is not, `ui.focus(other)`.
- **Back and Next** are built in `onAttach` with `createLabel` as the night screen builds Menu,
  `layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'}`, and `onClick` moves `page` by one
  (within bounds) and calls `showPage`.
- **The status** is written in `onShow` from `formatStatus(night)` (`''` for no night), in the
  outline font, as the night screen's `writeStatus` writes it.
- **The menu** is shared. The night screen's `openMenu` moves, unchanged in what it does, into
  `screens/menuModal.ts` as `export function openMenu(screen: MenuScreen): void` with
  `type MenuScreen = {state: GameScreenState; ui: UiRoot; scheduler: Scheduler; contents: {menuModal: Modal | null; optionsModal: Modal | null}}`,
  which both screens satisfy structurally (a `GameScreen<T>` is never named, so the generic never
  has to agree); its comment moves with it, and the night screen's Menu button and Escape rule call
  it. The log screen's Menu button calls it too; `onUpdate` runs the night screen's Escape rule with
  `lastTopOverlay`; `onHide` destroys the Options window and the menu, as the night screen's does.
  `menuModal.ts` then imports `mainMenuScreen` (for Quit to menu) and `optionsModal.ts`; that import
  closes a cycle through the night screen and the main menu and carries the `import/no-cycle`
  disable comment the two screens already use, with the same reason. The night screen's existing
  menu tests are the check for the move.
- **`showLog(night)`** sets `contents.night = night` and `contents.page = 0`; it does not lay out:
  the screen is shown right after, and `onShow` lays out. A screen shown without `showLog` lays out
  an empty log.
- **`onResize`** calls `layOut`, which keeps the page by its offset; an open menu is an overlay and
  is not touched.

- [ ] **Step 1: Write the failing browser tests**

`tests/logScreen.browser.test.ts`: boots at 960 × 540 with the `playMusic` spy installed before the
boot, as the night screen test does; `logScreen` and `createNight`, `logText`, `logChoice` are
imported after the boot; a describe with a long timeout. A night is built by hand:

```ts
let night = createNight({place: FIXED_BAR, minutes: 1180, money: 350});

for (let index = 0; index < 12; index += 1) {
  logText(
    night,
    'The bar',
    `Page ${index}: the bartender dries a glass and watches the room over its rim, and *nobody* is in a hurry.`,
  );
  logChoice(night, 'Ask about the better beer of the winter the pipes froze, and listen');
  night.minutes += 10;
}

night.money = 120;
```

A helper `getLeaves()` returns the regular and the italic `Text` of `logScreen.contents.textBlock`
(its two children). `showLog(night)` and `await game.showScreen(logScreen)` open it; the tests
follow each other in order.

- `shows the final status, the first page, Back disabled and nothing focused`: `logScreen.state` is
  `'shown'`; `readText(statusText)` is `'21:40   120 Kč   0.0'`; `readText(title)` is
  `` `The night  1 of ${pageStarts.length}` `` with `pageStarts.length > 2`; `back.isDisabled` true,
  `next.isDisabled` false; `ui.focused` null; the regular leaf's text starts with
  `'19:40  The bar'`; the italic leaf's text contains `'nobody'`.
- `Tab focuses Next first`: `ui.focusNext()` (a direct call, as Tab makes it and as the places test
  calls it): `describeFocus(ui.focused)` is `'Next'` and `ui.isRingVisible` is true.
- `Enter on Next reads the log through, the window keeps its height, and the focus moves to Back at the end`:
  take the panel's box; `press('Enter')` until `next.isDisabled`, at most 40 times, and after each
  press `readText(title)` reads `page + 1` and the panel's box equals the one taken;
  `describeFocus(ui.focused)` is `'Back'`; the regular leaf's text is not page 1's.
- `Enter on Back reads it back`: `press('Enter')` until `back.isDisabled`; the title is
  `The night  1 of N` and the focus is on Next.
- `a page that starts inside a choice's line is italic`: find a page index `p > 0` whose start is
  inside a choice line (`formatted.slice(0, pageStarts[p]).split('*').length % 2 === 0`); set the
  page by pressing Next; the regular leaf's first line matches `/^ *$/` and the italic leaf's first
  line contains a letter.
- `a resize keeps the page and the title fits the narrowest screen`: Next twice; note
  `offset = pageStarts[page]`; `setViewport(harness, 292, 524)`; `vitest.waitFor` the panel's width
  138; `pageStarts[page] <= offset` and `offset < (pageStarts[page + 1] ?? Infinity)`;
  `readText(title).length <= 19`; the status text's box is `{left: 4, top: 24}`; then
  `setViewport(harness, 960, 540)` in a `finally`.
- `a resize while the menu is open keeps the menu above`: `menuButton.activate()`; `setViewport` to
  292 × 524; `ui.topOverlay` is still `contents.menuModal`; back to 960 × 540; `menu.close()`.
- `Menu and Escape open the night's menu above the window, and Escape closes it`:
  `menuButton.activate()`: `contents.menuModal` is not null and is `ui.topOverlay`;
  `press('Escape')` and `vitest.waitFor` `contents.menuModal` null; `press('Escape')` opens it
  again; `menu.close()` and wait.
- `Quit to menu shows the main menu and plays its music`: Escape,
  `ui.focus(getMenuButton(menu, 'Quit to menu'))`, Enter, `vitest.waitFor` `mainMenuScreen.state`
  `'shown'`; `logScreen.contents.menuModal` null; `playMusic` called twice.
- `an empty log is one empty page with both buttons disabled, and Tab reaches Menu`:
  `showLog(createNight({place: FIXED_BAR, minutes: 1920, money: 0}))`, `showScreen(logScreen)`: the
  title is `'The night  1 of 1'`, both disabled, the regular leaf's text is `''`; `ui.focusNext()`:
  `describeFocus(ui.focused)` is `'Menu'`; then `showScreen(mainMenuScreen)`.

Run: `npx vitest run --project browser tests/logScreen.browser.test.ts` Expected: FAIL, module not
found.

- [ ] **Step 2: Implement the text block, the log screen and the route**

As in Interfaces and the decisions.

- [ ] **Step 3: Check and commit**

```bash
npx prettier --write source/game/core/getSceneArea.ts source/game/screens/textBlock.ts source/game/screens/logScreen.ts source/game/screens/storyWindow.ts source/game/screens/menuModal.ts source/game/screens/nightScreen.ts source/routes/_index.tsx tests/logScreen.browser.test.ts
npx vitest run --project browser tests/logScreen.browser.test.ts tests/nightScreen.browser.test.ts tests/nightScreenNarrow.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/core/getSceneArea.ts source/game/screens/textBlock.ts source/game/screens/logScreen.ts source/game/screens/storyWindow.ts source/game/screens/menuModal.ts source/game/screens/nightScreen.ts source/routes/_index.tsx tests/logScreen.browser.test.ts
git commit -m "Show the log of the night on a screen of its own"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 4: The end of the night

**Files:**

- Create: `source/game/content/nightEnd.ts`
- Modify: `source/game/screens/nightScreen.ts:44-102,244-278,481-514,613-634`,
  `source/game/core/checkContent.ts` (`Content`, the scripts loop), `scripts/list-stand-ins.mjs`
- Test: `tests/nightScreenEnd.browser.test.ts` (new), `tests/checkContent.test.ts`,
  `tests/content.test.ts`, `tests/listStandIns.test.ts`

**Interfaces:**

- Consumes: `isNightOver` (Task 1); `logScreen.contents.showLog` (Task 3); `leavePlace`, `layOut`,
  `openStory`, `getNextPlace`, `prepareNextPlace` as today.
- Produces: `content/nightEnd.ts` exports `nightEnd`, exactly the spec's block, with the content
  files' header comment on the stand-in. `Content` gains `end: RunnableDialogueScript<Night>`,
  checked with `checkScript('end', content.end, null)` after the journeys. `list-stand-ins.mjs`
  lists `nightEnd.ts` after `journeys.ts`. `NightScreenContents` gains `hasEnded: boolean`
  (`/** Whether the end text has opened: the night is over, and the next close shows the log. */`),
  false at attach and at `onShow`. `actOnNight` checks the end first, exactly the spec's block;
  `getNextPlace` returns `undefined` once the night is over; `openStory`'s `onClosing` sets
  `isPlaceChanging` when the place changes or the night is over. The import of `logScreen` carries
  the `import/no-cycle` disable comment (the log screen imports the main menu, which imports this
  screen).

- [ ] **Step 1: Write the failing tests**

`tests/checkContent.test.ts`: `check` passes `end: oneNode('Morning.', 'Morning')`; new
`reports a fault of the end script`: `check({end: oneNode('Morning.', '')})` contains
`end › start: no speaker`.

`tests/content.test.ts`: `checkContent({…, end: nightEnd})`; new `the end text reads the money`:
`new Dialogue({script: nightEnd, context: createNight({place: 'rotorBarRoom', minutes: 1925, money: 120})}).pageText`
contains `'120 Kč'`, and the node's speaker is `'Morning'`.

`tests/listStandIns.test.ts`: the listed lines include one starting with `nightEnd.ts`.

`tests/nightScreenEnd.browser.test.ts`: boots at 960 × 540 after
`useFixedWorld({place: FIXED_BAR, minutes: 1915})` (07:55); `logScreen` is imported after the boot;
`describe` with a long timeout; a `describeEntry` helper as in Task 2; the tests follow each other
in order, and each that names a time sets `nightStart.minutes` before its `restartAt` and leaves it
(the fixed world is restored in `afterAll`).

- `the action that crosses 08:00 finishes, the end text opens over black, and the log screen shows the log`:
  `startNewGame`; `let {night} = contents`; close the description; open `The bartender`, Enter,
  ArrowDown, Enter (the beer, to 08:05); `pressThrough` and Enter close the beer's text;
  `vitest.waitFor` a story window whose speaker is `'Morning'`; `contents.place` is null,
  `contents.nextPlace` is null, `contents.hasEnded` is true, `contents.isPlaceChanging` is true,
  `readText(contents.statusText)` is `'08:05   305 Kč   1.0'`; `pressThrough` and Enter;
  `vitest.waitFor` `logScreen.state` `'shown'`; `nightScreen.state` is `'attached'`;
  `readText(logScreen.contents.statusText)` is `'08:05   305 Kč   1.0'`;
  `night.log.map(describeEntry)` is
  `[['text', 1915, 'The bar'], ['text', 1915, 'The bartender'], ['choice', 1915, 'Order a beer  10 min  45 Kč'], ['text', 1925, 'The bartender'], ['text', 1925, 'Morning']]`,
  and the last entry's text contains `'305 Kč'`: the closing script never ran.
- `a travel that arrives after 08:00 shows its text and then the end, never the destination`:
  `restartAt(harness, FIXED_SQUARE)` (still at 07:55); close the description;
  `chooseWayOut(harness, 'Walk')`,
  `pickDestination(harness, await waitForTravelWindow(harness), FIXED_BAR_LOCATION)` (12 minutes, to
  08:07); the journey's window has the speaker `'On foot'`; three `nextFrame`s and
  `contents.nextPlace` is still null; `pressThrough` and Enter; `vitest.waitFor` the `'Morning'`
  window; `contents.place` is null; `pressThrough` and Enter; `vitest.waitFor` the log screen; the
  log's last four entries are
  `[['choice', 1915, 'Walk'], ['choice', 1915, 'Walk to The bar  12 min'], ['text', 1927, 'On foot'], ['text', 1927, 'Morning']]`.
- `a night that starts at 08:00 ends after its description`: `nightStart.minutes = 1920` (what a
  jump-in with `time=08:00` writes there), `restartAt(harness, FIXED_BAR)`; `pressThrough` and Enter
  on the description; the `'Morning'` window; `pressThrough` and Enter; the log screen; the log is
  `[['text', 1920, 'The bar'], ['text', 1920, 'Morning']]`.
- `Quit to menu above the end text shows the main menu, and New Game starts a fresh night`:
  `nightStart.minutes = 1915`, `restartAt(harness, FIXED_BAR)`, the beer as above, the `'Morning'`
  window open; `press('Escape')`, `ui.focus(getMenuButton(menu, 'Quit to menu'))`, Enter;
  `vitest.waitFor` `mainMenuScreen.state` `'shown'`; `startNewGame`; `contents.hasEnded` is false,
  `contents.night.log.map(describeEntry)` is `[['text', 1915, 'The bar']]` and
  `readText(contents.statusText)` is `'07:55   350 Kč   0.0'`.

Run:
`npx vitest run --project unit tests/checkContent.test.ts tests/content.test.ts tests/listStandIns.test.ts && npx vitest run --project browser tests/nightScreenEnd.browser.test.ts`
Expected: FAIL (no `end`; no `nightEnd.ts`; the beer's close shows the room, or the closing).

- [ ] **Step 2: Implement**

As in Interfaces.

- [ ] **Step 3: List the stand-ins**

Run: `node scripts/list-stand-ins.mjs` Expected: a line `nightEnd.ts` with one stand-in after
`journeys.ts`.

- [ ] **Step 4: Check and commit**

```bash
npx prettier --write source/game/content/nightEnd.ts source/game/screens/nightScreen.ts source/game/core/checkContent.ts scripts/list-stand-ins.mjs tests/nightScreenEnd.browser.test.ts tests/checkContent.test.ts tests/content.test.ts tests/listStandIns.test.ts
npx vitest run --project unit
npx vitest run --project browser tests/nightScreenEnd.browser.test.ts tests/nightScreenPlaces.browser.test.ts tests/jumpIn.browser.test.ts
npm run typecheck
npx eslint source tests scripts
git add source/game/content/nightEnd.ts source/game/screens/nightScreen.ts source/game/core/checkContent.ts scripts/list-stand-ins.mjs tests/nightScreenEnd.browser.test.ts tests/checkContent.test.ts tests/content.test.ts tests/listStandIns.test.ts
git commit -m "End the night at 08:00 and show the log"
```

Expected: PASS; typecheck 0; eslint 0 errors.

### Task 5: Whole check and hand-over

**Files:** `docs/direction.md`,
`docs/superpowers/specs/2026-10-10-end-of-the-night-and-log-design.md`.

- [ ] **Step 1: Run everything once**

From the repository root: `npx turbo run typecheck lint test --filter=foam --concurrency=1`
Expected: every task succeeds (this is the one full run; CI repeats it). Then
`git diff --stat f673ea40 -- apps/somewhere packages/tellurion` prints nothing.

- [ ] **Step 2: State that the spec is built**

- `docs/direction.md`: in the phase 5 list, item 4 ends "It is built:" with links to the spec and to
  this plan; the sentence before the phase 5 list says phase 5 is built, and the line at the top of
  the document says phases 1 to 5 are built.
- The spec's status: "implemented by
  [2026-10-10-end-of-the-night-and-log.md](../plans/2026-10-10-end-of-the-night-and-log.md)".

```bash
git add docs/direction.md docs/superpowers/specs/2026-10-10-end-of-the-night-and-log-design.md
git commit -m "State that the end of the night and the log are built"
```

- [ ] **Step 3: Push and hand over the checks in the running app**

Push `somewhere-update` (the open pull request deploys it). Report as left for the author, on the
deployed build: every step of the spec's "What the player sees" in a wide window and in one narrower
than 240 art pixels; a beer at 07:55 and a walk that arrives after 08:00; the log read through with
Enter and back with Enter; Escape on the log screen; a phone turned while the log is shown; and the
review of phase 5, which the direction document says decides what is kept and reopens the content
model after phase 6.
