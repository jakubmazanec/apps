# The phone (Foam phase 8, spec 1 of 2): design

Date: 2026-10-28. App: `apps/foam`. Status: implemented by
[2026-10-28-phone.md](../plans/2026-10-28-phone.md). It is the first of phase 8's two specs in the
[direction document](../../direction.md). It builds on phase 7, which is built and reviewed. Spec 2,
the author, follows.

## Background

After phase 7 a night is a seed, its scenes come in versions, and an unfinished night is saved and
resumed. The author is in the direction document's principles: he is the storyteller, has the avatar
Jakub, speaks to the player through the in-game phone and can sometimes be met in a place. Nothing
of that is built. The only phone in the game is the one a man sells by the taxis on Nádražní, and it
is a brick half the time.

The direction document's phase 8 row says the phone works, the author writes to the player, and
Jakub can be met in a place. This spec builds the phone and the author's messages. Spec 2 puts him
in a place.

Three things shape this spec:

- **A message is a scene.** It is written with `defineScript` as every scene button's script is,
  with the same nodes, choices, costs, odds, effects and `next` functions, and the story window runs
  it as it runs a scene. The checker walks it with the same code. Nothing new interprets it.
- **The player only replies.** The author writes; a message arrives when its condition on the night
  holds; the player opens the phone when they like, and the replies are the message's choices.
  Nobody starts a conversation from the player's side.
- **The night is looked at between windows.** A message arrives when the night screen looks at the
  night, as a closing, a way out and a change of place take effect then. Nothing arrives while a
  window is open, and nothing arrives once the night is over.

## Decisions (from brainstorming)

1. **The phone is a thread read in the story window.** A Phone button carries the count of unread
   messages. Opening the phone opens the oldest unread message in the story window, titled by the
   sender, and the replies are its choices. Past messages are not reread in the phone: the log keeps
   them. A chat window of its own, and messages that open by themselves as scenes, were rejected.
2. **Only the author writes in this phase.** A message names its sender all the same, so a message
   from someone else is content only, later.
3. **A message is content with a key, a sender, a condition and a script.** The condition is a
   function of the night: the clock, the place, the quest's flags, the stories, the events met, the
   level, the money, or a pick by the seed. It arrives once per night, the first time the condition
   holds.
4. **Chains go through the events the night has met.** A reply that matters calls `meet`, and a
   later message's condition reads `hasMet`. The night gets no field per chain.
5. **The Phone button stands in a row at the bottom of the screen,** at its right end, as the Menu
   button stands at the right end of the top row. The top row has no room for it on the narrowest
   screen, and a button in the scene's corner would lie on a scene button sooner or later. Scene
   buttons and windows lay out between the two rows.
6. **The button is greyed out while nothing is unread,** as a choice the player cannot afford is,
   and reads "Phone 1", "Phone 2" and so on while messages wait.
7. **An arrival shows a toast and plays a sound.** The toast says "A message" over the sender, in
   the story toast's shape. The sound is Somewhere's chime, copied into Foam's bundle.
8. **Reading costs nothing.** A reply may cost what any choice costs.
9. **A message counts as read when its window's text ends,** where the night is saved, so a quit
   mid-window leaves it unread, as the quit rewinds the night to the window's opening.
10. **Nine messages,** chosen from forty-eight ideas for the spread of nights they make differ: an
    opening in versions, a hint on most nights, a warning that chains on a refusal, a nag that
    chains on a skip, an offer that fails on some nights, a bet the seed settles, a wrong number on
    one night in ten, a reaction to a story, and a last call at dawn. The tenth, the invitation,
    belongs to spec 2 with the meeting it leads to.
11. **The text is stand-in text,** marked as the places' texts are, and the author replaces it when
    he writes the real text.
12. **A branch on the money is a `start` that returns a node id.** The checker's nights all carry
    the same money, so a text that branched on it would be checked on one side only; two nodes are
    both checked under their own keys.

## Design

### What the player sees

1. A new night opens on the train under its description, as today, with a greyed "Phone" button at
   the bottom right of the screen, on every screen size. When the description closes, a toast at the
   bottom says "A message" over "Jakub", the chime plays, and the button reads "Phone 1".
2. Pressing Phone opens the story window titled "Jakub". The hello types out, in one of three
   versions by the seed, with an extra sentence for a player whose collection is not empty. The
   replies are "Hi", "Who is this?" and "Mute". "Mute" ends the window and nothing changes. When the
   window closes, the button is greyed out again and reads "Phone".
3. At 17:00 without the keys, on seven nights in ten, a message names the hours the friend will be
   at Rotor tonight. At 20:10 a message bets fifty on a guitar in Rotor's corner; "Bet" takes it,
   and at 22:05 a message settles it by the night's corner table.
4. A beer that takes the level to four brings "Water. Now." The reply "Water" reads "Water 10 min"
   and costs ten minutes; "Another" costs nothing, and a fifth drink brings a second message and a
   story.
5. After a long action, such as a failed search that cost an hour, two messages can arrive at once:
   the toasts follow one another, as two stories' toasts do, and the button reads "Phone 2". Each
   press opens the oldest one.
6. Every message read is in the log with its time and the sender, and every reply as a choice. A
   message never opened is not in the log.
7. Quit to menu while a message's window is open, then Continue: the night resumes at the window's
   opening, and the message is unread again. Quit after the window closed: Continue shows the count
   as it was, and no toast.
8. A sleep takes the clock to 08:00 and the night ends when the window closes; no message arrives on
   the way, and the end text opens as today.

What does not change: the scenes, the journeys, the travel window, the menus, the Stories and
Collection windows, the seed and the versions. The log screen's page is one row shorter, as the
bottom row says.

### Files

| File                                                        | Change                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `source/game/core/night.ts`                                 | `phone` on the night, two lists of keys; `createNight` starts them empty                                                                   |
| `source/game/core/phone.ts`                                 | New: `Message`, `receiveMessages`, `getUnreadMessage`, `readMessage`                                                                       |
| `source/game/core/save.ts`                                  | `phone` in the schema                                                                                                                      |
| `source/game/core/getSceneArea.ts`                          | `BOTTOM_ROW_HEIGHT`; the area's `bottom`; the height takes the bottom row away                                                             |
| `source/game/core/assets.ts`                                | The `phone` sound                                                                                                                          |
| `source/game/core/checkContent.ts`                          | `messages` in `Content`; each checked as a script; conditions run; keys and senders held                                                   |
| `source/game/screens/topRow.ts`                             | `createPhoneButton`, `setPhoneCount`                                                                                                       |
| `source/game/screens/toast.ts`                              | A `heading` option                                                                                                                         |
| `source/game/screens/nightScreen.ts`                        | The Phone button; arrivals in `actOnNight`; reading; the toast queue with headings; the layout with the bottom row; dropped keys on resume |
| `source/game/content/phone/index.ts`                        | New: the messages in order                                                                                                                 |
| `source/game/content/phone/*.ts`                            | New: one file per message                                                                                                                  |
| `source/game/content/locations/rotorBar/room.ts`            | `getCornerTable` exported for the bet; `GUITARIST_STORY` exported                                                                          |
| `source/game/content/locations/rotorBar/location.ts`        | `THROWN_OUT_STORY` exported                                                                                                                |
| `source/game/content/locations/hlavniNadrazi/forecourt.ts`  | `CROWNS_STORY` exported                                                                                                                    |
| `source/game/content/locations/malinovskehoNamesti/stop.ts` | `FIGHT_STORY` exported                                                                                                                     |
| `public/phone.wav`                                          | New: a copy of Somewhere's `chime.wav`                                                                                                     |
| `tests/checkContent.test.ts`, `tests/content.test.ts`       | Their content objects carry the messages                                                                                                   |
| `docs/direction.md`                                         | The status line; the phase 7 review; the Phone row; the phase 8 paragraph                                                                  |

### The night's phone (`core/night.ts`)

```ts
export type Night = {
  …
  /**
   * The phone: the keys of the messages that have arrived and wait, oldest first, and of those
   * read. The night screen writes both through `core/phone.ts`.
   */
  phone: {unread: string[]; read: string[]};
};
```

`createNight` starts both lists empty. `restoreNight` gets them from the saved night, as it gets the
events. The whole-object test gains the field.

### The messages (`core/phone.ts`)

```ts
export type Message = {
  /** Names the message: the path of its texts and its place in the night's lists. */
  key: string;

  /** The sender, as the toast names it. Every node of the script sets it as the speaker. */
  from: string;

  /**
   * Whether the message arrives now. The night screen reads it whenever it looks at the night, for
   * a message that has not arrived; the first time it holds, the message is unread. It has no side
   * effects: the checker runs it on thousands of nights.
   */
  arrives: (night: Night) => boolean;

  script: RunnableDialogueScript<Night>;
};

/**
 * Moves every message whose condition holds, and that has neither arrived nor been read, to the end
 * of the unread list, in the list's order, and returns them.
 */
export function receiveMessages(night: Night, messages: readonly Message[]): Message[];

/** The oldest unread message, or undefined with none. */
export function getUnreadMessage(night: Night, messages: readonly Message[]): Message | undefined;

/** Moves the key from the unread list to the read list; a key not unread does nothing. */
export function readMessage(night: Night, key: string): void;

/** Takes every key the content lacks out of both lists, with a console warning for each. */
export function dropUnknownMessages(night: Night, messages: readonly Message[]): void;
```

A saved night may hold a key the content has dropped since. The night screen calls
`dropUnknownMessages` on a resume, before it looks at the night, as the loader warns of a saved
place the content lacks; after it, every key in the lists is a message.

### The bottom row (`core/getSceneArea.ts`, `screens/topRow.ts`)

```ts
/** The row at the bottom of the screen: a margin, the Phone button and a margin. */
export const BOTTOM_ROW_HEIGHT = MARGIN + BUTTON_HEIGHT + MARGIN;

export type SceneArea = {
  top: number;

  /** Distance from the bottom of the screen to the area: the bottom row. */
  bottom: number;

  width: number;
  height: number;
};
```

`getSceneArea` takes the bottom row away from the height on every screen, as it takes the top row,
so the log screen's page is one row shorter too. Where a screen or a window needs the whole height,
the picture and the travel window, it reads `area.top + area.height + area.bottom`. The toast's
strip stands `BOTTOM_ROW_HEIGHT` above the bottom edge, so it lies one margin above the Phone
button.

The top row module grows two functions beside the Menu button's:

```ts
/** The Phone button at the right end of the bottom row; `onClick` opens the oldest unread message. */
export function createPhoneButton(onClick: () => void): Button;

/**
 * Writes the count into the label, "Phone" for none and "Phone 2" for two, gives the button the
 * label's width, and greys it out for none.
 */
export function setPhoneCount(phoneButton: Button, count: number): void;
```

The label is the button's one child, a `Text` built by `createLabel`; `setPhoneCount` writes it as
`setStatus` writes the status line, and sets the button's width with `getButtonWidth`. The button is
right-aligned, so a wider label grows to the left. Greyed out is Tellurion's `disable`, which takes
the button out of the Tab order and off the pointer; `enable` puts it back.

### The toast (`screens/toast.ts`)

`ToastOptions` gains `heading: string`, which replaces the constant "A story": the night screen
passes "A story" for a find and "A message" for an arrival, and the second line is the title or the
sender. The width is the widest of the heading and the lines. Nothing else changes.

### The night screen (`screens/nightScreen.ts`)

The contents gain:

```ts
/** The Phone button in the bottom row, built once with the screen. */
phoneButton: Button;

/** The count the button shows, as last written. */
phoneCount: number;

/** The key of the message whose window is open, for the window's end to mark it read; null otherwise. */
reading: string | null;

/** The toasts waiting, in order: a find's "A story" and its title, an arrival's "A message" and its sender. */
toastQueue: Array<{heading: string; title: string}>;
```

- **Built with the screen.** `onAttach` builds the Phone button after the Menu button and adds it to
  the UI root with the status line, the Menu button and the backdrop. `showPlace` takes it out and
  puts it back with them, after the scene buttons, so Tab reads the place button, Menu, the scene
  buttons and then Phone. `layOut` places it at `right: MARGIN, bottom: MARGIN`.
- **Arrivals.** `actOnNight` receives the messages right after its check that the night is over,
  before anything else it does: a night that is over receives nothing. For each message returned it
  queues a toast with "A message" and the sender, and plays the chime once if any arrived.
  `handleStories` keeps queuing a find's toast with "A story"; `showToast` takes the heading from
  the queue.
- **The count.** `onUpdate` writes the count after the status line, through `setPhoneCount`, only
  when it has changed, as `writeStatus` does. A message read in the window changes it when the
  window's text ends.
- **Reading.** The button's click takes the oldest unread message; with none, or with a story window
  already open, it does nothing. It notes the key in `reading` and calls `openStory` with the
  message's script and the path `phone › key`, so the texts-read record and the log work unchanged.
  In `openStory`'s `onClosing`, before the save, a noted key is moved to the read list and `reading`
  is cleared. `onShow` clears `reading` and writes the count.
- **Resume.** A resumed night's unread list comes from the save, with no toast, as its finds get
  none; `onShow` drops the keys the content lacks first. `actOnNight` runs on the resume as today
  and may receive a message whose condition holds now; that one gets its toast.

The place's picture and the travel window are sized with the whole height, as the bottom row says.

### The sound (`core/assets.ts`, `public/phone.wav`)

Somewhere's `chime.wav` is copied to `public/phone.wav` and listed in the bundle as `phone`. The
night screen plays it as the focus sounds are played,
`audio.play(assets.sound('phone'), {bus: 'ui'})`.

### The content (`content/phone/`)

One file per message, each exporting its `Message`, and `index.ts` exporting `messages` in the order
they are tried. The sender is `'Jakub'` everywhere, in a constant the files share. The texts are
stand-in text with the limits of the places' texts, and the files say so in the comment the places'
files carry. The keys are contracts, as the picks' keys are: `hello`, `hours`, `four`, `five`,
`shop`, `sang`, `broke`, `bet`, `betSettled`, `wrongNumber`, `realOne`, `lastCall`. The picks this
spec adds: `hello`, `hoursHint`, `brokeHelp`, `wrongNumber`.

| Key           | Arrives                                                                                                       | What it says and offers                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hello`       | Always: the first look at the night                                                                           | `start` picks `hello` from `{code: 0.4, guide: 0.4, tram: 0.2}`: the few-lines-of-code line, the briefing (keys, bottle, train), or "can't talk, I'm on the 4". The text adds a sentence when the collection is not empty. Replies: "Hi"; "Who is this?", a node whose text answers by the same pick; "Mute", which ends the window. |
| `hours`       | 17:00 or later, no keys, and `hoursHint` picks `sent` from `{sent: 0.7, silent: 0.3}`                         | He saw the friend; the text names the early visit's start and the late one's through `getFriendEvening` and `formatHourWords`. Replies: "Thanks"; "Which room?", a node naming the back room.                                                                                                                                        |
| `four`        | The level at four or more                                                                                     | "Water. Now." Replies: "Water", `minutes: 10`, a node that approves; "Another", which calls `meet(night, 'ignoredWater')`, a node that shrugs.                                                                                                                                                                                       |
| `five`        | `ignoredWater` met and the level at five or more                                                              | "I'm not carrying you home." Its entry effect finds the story `Not carried home`. Reply: "Noted".                                                                                                                                                                                                                                    |
| `shop`        | 20:30 or later, no bottle, none given                                                                         | Husovice is twenty minutes away, go. Replies: "Going"; "Skipping it", which calls `meet(night, 'skippedBottle')`.                                                                                                                                                                                                                    |
| `sang`        | 01:05 or later, `skippedBottle` met, none given                                                               | "They sang without you." Reply: "I know".                                                                                                                                                                                                                                                                                            |
| `broke`       | 20:00 or later, money under 50, no keys, no ticket                                                            | `start` picks `brokeHelp` from `{pays: 0.8, dry: 0.2}`. Pays: he can get a hundred to you for half an hour of waiting; "Please", `minutes: 30`, adds 100 Kč in its effect, then a node; "I'm fine". Dry: he is skint too; "Figures".                                                                                                 |
| `bet`         | 20:10 or later                                                                                                | Fifty says there's a guitar in Rotor's corner tonight. Replies: "Bet", which calls `meet(night, 'bet')`; "No".                                                                                                                                                                                                                       |
| `betSettled`  | 22:05 or later and `bet` met                                                                                  | `start` reads `getCornerTable`: music, "Pay up", with "Here", `price: 50`, and "Skint", which costs nothing, each to a node; otherwise "Fine, you win", whose entry effect adds 50 Kč and finds the story `The fifty on the guitar`. Reply: "Cheers".                                                                                |
| `wrongNumber` | 18:40 or later and `wrongNumber` picks `sent` from `{sent: 0.1, none: 0.9}`                                   | "Second crate's at the back door, knock twice. Sorry, wrong person." Replies: "Which back door?", a node whose entry effect finds the story `The wrong number`; "Ignore it".                                                                                                                                                         |
| `realOne`     | One of five stories found tonight: twenty crowns, the fight, the guitarist, thrown out at three, the birthday | `start` returns the node of the first of the five in the night's list: for each, what in it really happened, in a sentence or two. Replies: "Really?", a node; "OK".                                                                                                                                                                 |
| `lastCall`    | 07:00 or later, no keys, no ticket, not in the hall or on Nádražní                                            | `start` returns `go` with the ticket's price in hand, the machine is twenty minutes from anywhere, or `stranded` without it, his own stranded Saturday in 2014. Replies on `go`: "Going", "Let it leave"; on `stranded`: "Thanks".                                                                                                   |

The rules every message follows:

- **The pick sits at the top of the function** that uses it, in `start` or in `arrives`, as the
  versions spec says, so the checker runs every name.
- **The condition has no side effects.** The reply's effect marks the night; the condition reads it.
- **Every node with choices offers a way out that costs nothing,** which the checker holds every
  node to.
- **A branch on the money is a `start` that returns a node id.** `lastCall` and `betSettled` follow
  it; `broke` reads the money in its condition only.
- **The five stories' titles are imported,** not retyped: the files that hold them export them.
  `getCornerTable` is exported from Rotor's room for the bet, with the table unchanged.

### The checker (`core/checkContent.ts`)

- **`Content` gains `messages: readonly Message[]`.** Each message's script is checked as a script
  under its key, `phone › hello`, with no home place, as the journeys and the end are: every rule of
  the places' scripts holds.
- **The condition runs on every check night,** through `withRandom`, as a choice's `isVisible` does,
  so a pick in it runs under every name and a throw is reported under `phone › key › arrives`. The
  result is not read: a condition that never holds on a check night is no fault.
- **Keys and senders are held.** Two messages with one key, an empty key, and an empty sender are
  reported. A node whose speaker is not the message's sender is reported under its path: the toast
  names the sender and the window names the speaker, and they must agree.
- **The check nights' phone lists are empty.** No message of this spec reads them.

### The direction document

- The status line says phases 1 to 7 are built and reviewed, and phase 8's first spec is designed.
- The phase 7 review is recorded under the phase 7 paragraph, on 2026-10-28: everything built is
  kept and nothing rewritten; the two loose ends of phase 6 still wait for the author; the list
  after phase 8 stays as it is.
- A Phone row in the decisions: the author writes, the player replies, a message is a scene with a
  condition on the night, it arrives when the night is looked at, a toast and a sound announce it,
  the Phone button in the bottom row counts the unread, and reading costs nothing.
- The phase 8 paragraph: larger than one cycle, cut into two specs, this one linked.

## Error handling

| What goes wrong                                     | In CI                                    | In the running game                                                     |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| A message's condition throws                        | The checker reports it under the key     | `actOnNight` throws inside `onUpdate`'s try: the error screen shows it  |
| Two messages share a key                            | The checker reports it                   | The second never arrives: the key is unread or read already             |
| A node's speaker is not the sender                  | The checker reports it                   | The toast and the window disagree                                       |
| A message's node breaks a script rule               | Every node is checked, so it is reported |                                                                         |
| A saved night holds a key the content dropped       |                                          | The resume drops it from the lists, with a console warning              |
| A saved night from before this spec                 |                                          | The schema refuses it: Continue is absent, as the direction's rule says |
| The phone sound fails to load                       |                                          | The boot fails to the error screen, as for any asset                    |
| A reply's effect moves the player or sets a way out |                                          | `actOnNight` acts on it after the window, as for a scene                |
| A pick in a condition sits in a branch              | The checker reports it                   | The names the branch skips were never checked                           |

## Testing

Unit tests, in `tests/`:

- **`night.test.ts`.** `createNight` starts the phone's lists empty; `restoreNight` gets them from
  the save; the whole-object comparison gains `phone`.
- **`phone.test.ts`.** New. `receiveMessages` moves a message whose condition holds to the unread
  list once, in the list's order, skips one unread or read, and returns what arrived;
  `getUnreadMessage` gives the oldest and undefined with none; `readMessage` moves a key and ignores
  one not unread; `dropUnknownMessages` takes a key the content lacks out of both lists and leaves
  the others.
- **`save.browser.test.ts`.** The schema keeps the lists and refuses a night without them.
- **`getSceneArea.test.ts`.** The area's `bottom` and the height on a wide and on a narrow screen.
- **`checkContent.test.ts`.** A message with a word over 16 characters is reported under
  `phone › key`; two messages with one key; a speaker that is not the sender; a condition that
  throws; a condition that picks runs under every name, counted through a spy.
- **`content.test.ts`.** Each message's condition at nights that hold it and nights that do not: the
  hello always; the hours at 17:00 without the keys with `pick` pinned to `sent`, and never with
  `silent` or the keys; four at the level and five after `ignoredWater`; the shop at 20:30 without
  the bottle and the chain at 01:05 after the skip; broke under 50 Kč, and "Please" adding the
  money; the bet, and the settling by the corner table with `pick` pinned; the wrong number with
  `pick` pinned; the reaction for each of the five stories; the last call on each side of the
  ticket's price and never at the station. The checker passes on the content.

Browser tests, in `tests/`:

- **`phone.browser.test.ts`.** New. A new night: the button is greyed out and reads "Phone"; when
  the description closes, the toast shows "A message" over "Jakub" and the button reads "Phone 1";
  pressing it opens a window titled "Jakub" with the hello and its three replies; "Mute" closes it,
  and the button is greyed out again. A jump-in at 20:30 without the bottle: two messages arrive
  with the first close, "Phone 2", and each press opens the oldest. The log shows the message and
  the reply.
- **`continue.browser.test.ts`.** Quit over an open message's window, then Continue: the message is
  unread; quit after it closed: the count is kept and no toast shows.
- **`storiesToast.browser.test.ts`.** The heading "A story" is kept.
- **`nightScreenNarrow.browser.test.ts`.** The Phone button stands at the bottom right on the narrow
  screen and a scene button at `y: 1` lies above it.

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

- The invitation, where Jakub is tonight, the button that appears and the meetings (spec 2).
- Rereading a message in the phone, a thread with history, or a message the player starts.
- A sender other than the author; a battery; a message after 08:00.
- A jump-in parameter for the phone: the author sets a condition to `() => true` while trying a
  message.
- The real text: every message is a placeholder.
- Changes to Somewhere and to Tellurion.

## Rejected

- **A chat window of its own,** with the thread's history and replies under the last message. Closer
  to a phone, but the story window's typing, choices and costs built a second time.
- **Messages as scenes that open by themselves.** The player never chooses when to read, and the
  phone the notes describe does not exist.
- **The Phone button in the top row.** On the narrowest screen the row holds the place button and
  Menu and nothing more, and the second line holds the status line alone.
- **The Phone button in the menu.** Two presses for the game's one new thing, and nothing on screen
  says a message waits but a toast that passes.
- **The Phone button in the scene's corner.** A scene button placed there lies under it, and a
  checker rule over boxes at every size is more than a row.
- **A bottom row for the night screen only.** One shape of the area for every screen and every
  window is simpler than two.
- **Arrivals checked every frame,** as the finds are. A message would arrive under an open window
  and its count change there; the night is looked at between windows, as everything else is.
- **The window titled by the sender rather than the speaker.** Every node sets its speaker today and
  the checker holds it; a second source of the title is a second thing to keep equal.
- **A field per chain on the night,** as the quest's flags. The events list exists for marks the
  content makes.
- **A `read` flag on each message.** The night, not the content, knows what was read.
- **A sound made by a script.** A copied file costs nothing; the author's own sound comes with his
  songs.
- **A text that branches on the money.** The checker's nights carry one sum; two nodes are both
  checked.
