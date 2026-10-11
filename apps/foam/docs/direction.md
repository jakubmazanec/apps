# Foam: direction

Started: 2026-10-03. App: `apps/foam`. Status: the direction is agreed; phases 1 to 5 are built.
This is a living document: it describes the current state and plan, and is kept correct as they
change.

## What Foam is

Foam is a text-first game about one night in Brno. The player arrives in the evening with a quest,
moves between real places, and spends the night as a budget of hours: every action costs time, and
money and the player's state (how drunk they are, for a start) limit what is possible. What the
player takes away is stories. Each night is different, and the stories found are kept.

The author made the game to show people the "real" Brno. The game knows it is a game.

Foam runs on the `tellurion` engine, as Somewhere does.

## Principles

- **The fun is the stories and the uniqueness of each run.** The quest frames the night; it is not
  the main reward.
- **The game knows it is a game.** Meta jokes are used sparingly.
- **The author is the storyteller.** He has the avatar Jakub, speaks to the player through the
  in-game phone, and can sometimes be met in a place as an NPC. The player has their own avatar.
- **Sex and drugs are never romanticised.** They are described realistically, raw where needed, and
  can turn out well or badly.
- **Real places, changed people.** Bars, streets and tram lines keep their real names. Every person
  except the author's avatar gets a different name and altered identifying details. A scene that
  puts a real bar in a bad light may need an invented bar.
- **Foam is a living game.** It has no finished state. It keeps evolving through content updates.

## Decisions

| Topic        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | A free public web game that a stranger can enjoy. What is planned here is a first version (proof of concept, prototype or v0), not the final game.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Run          | One night is one run. Runs feel rogue-like, and some things are saved between runs. The four-seasons structure in the idea notes is not used.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Goal         | Each night has a quest. There is no long arc across nights; it is a shelved question.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Start        | The night starts with the player arriving in Brno by train. The train is the first place. The player gets off at Brno-Židenice or at the main station. Each station is a place, and the player travels on from it as from any other.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Places       | The first locations are The Whisky Shop Brno in Husovice and Rotor Bar in Dvořákova street in the city centre. Around them the first version has the train, the stations Brno-Židenice and Brno hlavní nádraží, and the tram stops Náměstí Republiky, Malinovského náměstí and Hlavní nádraží, which is the main station's forecourt.                                                                                                                                                                                                                                                                                                                                      |
| Locations    | The map shows locations, and a journey goes to a location. A location is a group of places: one for most tram stops; for a bar, the street outside it and one or more rooms; for the main station, its forecourt and its hall. A place is outdoors or indoors. A journey ends at the location's arrival place, which the author names; when a bar is closed it ends on the street outside, where the door does not open. The places of a location are joined by things in their pictures. Opening hours belong to the location. When it closes with the player indoors, its closing script runs and ends with the player outside. Stations, stops and streets never close. |
| Travel       | The player leaves a place through a thing in its picture, picks a way of travelling (on foot, by tram or by taxi) and then a destination on a map of Brno. The button under the map shows the destination with its minutes, its price and, for a location with opening hours, when it closes or opens, read at the minute of arrival, and makes the journey. Walk and taxi are offered only in an outdoor place, and the tram only in a tram stop's place, so a tram ride starts and ends at a stop.                                                                                                                                                                       |
| Hours        | The night runs from 16:00 to 08:00, on a Friday. It ends when the clock reaches 08:00; the action that crosses it finishes first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Costs        | A choice that costs shows its minutes and its price in its label. One the player cannot afford is greyed out and takes no press, and so is a journey in the travel window. The money never goes below zero.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Drunkenness  | A number of drinks that drinks raise and the hours lower, one drink an hour, shown with one decimal in the status line. Content reads it: a choice can require or forbid a level, and a text can branch on it. What being drunk changes is written, not ruled.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Dice         | A choice that rolls shows its odds in its label, as a percentage. The press rolls at once, a function `next` picks the outcome, of which there may be many, and the text tells it. No die is drawn.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Presentation | The illustration of a place fills the screen as the background. It shows the place reduced to a few large shapes that can still be named, such as a lamp, a counter or a door, rather than figurative pixel art with people and detail. It can be animated to set the mood of the place. Buttons placed freely on it stand for what the player can act on; choosing one opens a window where its text is typed out and its options are offered. The same screen shows the time, the money, the level of drunkenness in drinks and a description of the place.                                                                                                              |
| Rendering    | The game is drawn in Tellurion, with its own UI components. The only plain page text is the line shown while the engine starts or when it cannot start.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Art          | No art is AI-generated. A deterministic Node.js script, which an AI may write, draws the UI art, and the game's own code draws the pictures while it runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Look         | One list of colours serves the UI and the pictures: black, a dark indigo in several strengths, white, a rose accent, and a few bright inks for the pictures. Windows and controls are plain: black fills, one-pixel borders, square corners. Pictures are mostly black, with hard-edged shapes in flat tones and a checkerboard of single pixels for shading.                                                                                                                                                                                                                                                                                                              |
| Content      | The game's content (texts, actions, choices) is written in TypeScript, in the form of the engine's dialogue scripts. Foam types its own choice with plain fields for the price, the minutes, the drinks, the odds and the level, which the story window and the checker read. Whether a language made for writing replaces it is decided with the content model.                                                                                                                                                                                                                                                                                                           |
| Travel data  | The places' positions, the minutes and the price of every move, and the opening hours are data in the game's files, and the author corrects them by hand. The opening hours are the spans of the Friday night in which a location is open, in the minutes of the clock; the script converts them from the notation of the public map data. A script fills in the first values from public map data and never changes a value that is there. What the script wrote carries a mark until the author has checked it. The map's streets, railway, rivers, parks and tram lines come from public map data too, through a script that writes them anew; nobody edits them.       |
| Language     | English only for the prototype.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Text         | For the first version the author gives notes, and temporary game text is generated from them. The final text is written by the author by hand. Phase 4 runs on invented stand-in text, marked as such in the content files, and a script lists what is left to write.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Font         | Monogram, the font Somewhere uses. No other font is added. It has a regular and an italic version, each with and without an outline. All four are in `public/`. Phase 3 brings the italic version into use, for single words inside a sentence.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Journal      | A plain log of the night: every text read and every choice taken, with its time. It is shown page by page on a screen of its own when the night ends. Nothing is rewritten into novel prose yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Music        | Static stock synthwave, until the author's own songs exist. Stock tracks need a licence that allows use in a public web game. Until a track is chosen, Somewhere's menu music plays on the menu and keeps playing on the game screen.                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Shelved questions

These are important and deliberately not decided yet. Each is decided inside the phase that first
needs it, or at a phase review.

| Question                                                                  | Reopens                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Content model: how the story is broken into pieces and how the game picks | At the review after phase 6, or earlier if a phase needs it |
| What is saved between runs beyond the story collection                    | Phase 7                                                     |
| A long arc across nights (phone contacts unlocked by flashbacks)          | After phase 8                                               |
| The journal as a novel                                                    | After logs from phase 6 have been read                      |
| Adaptive music built from blocks                                          | When the author's own songs exist                           |
| Languages other than English                                              | Not before the first public version                         |

## How the work is organised

The work is split into phases, done in order.

- **A phase is one design-and-plan cycle** that ends in something that can be run. It is about the
  size of one spec in Somewhere.
- **Size follows difficulty.** Work that Somewhere already shows how to do is bundled into one
  phase. Only work that is new gets a phase of its own.
- **Real things before abstract things.** Each game phase adds a real, playable piece of the game
  with real text, and builds only the rules that piece needs. No system is designed ahead of use.
- **Reuse first.** Start from Tellurion's components and Somewhere's patterns. Tellurion gets an
  addition only when a phase hits a real gap, and that addition is built to the engine's standard,
  with its own spec.
- **Somewhere is only a model.** Its code is read, not changed, and nothing is moved from it into
  Tellurion. What Foam needs from Somewhere's app code, Foam writes itself in `apps/foam`.
- **One branch.** The work is committed to the `somewhere-update` branch. There are no other
  branches and no merges. The pull request already open from that branch does the deployment.
- **Plan as far as can be seen.** Phases are detailed up to the first complete night. After that the
  list stays loose.

Each phase runs the same way, following the flow of the Superpowers plugin:

1. Brainstorm the phase in conversation and write its design spec.
2. Write its implementation plan from the spec.
3. Implement the plan with the subagent workflow.
4. Review it: what was learned, what is kept or rewritten, which shelved question reopens, and
   whether the next phase is still the right one. This document is updated.

Where things are written down:

- Raw ideas stay in Notion (see Sources).
- This document holds the direction.
- Foam's specs and plans go under `apps/foam/docs/superpowers/`, laid out as in Somewhere. A spec
  describes its own phase: its Background says what the phase starts from, and a later phase does
  not rewrite it. The current state of the whole is in this document.
- Specs for Tellurion additions go under the root `docs/superpowers/`, where the Tellurion package
  spec already is.

## Phases

### Basic UI

| #   | Phase       | When it is done                                                                                                                                                                                                                                                                                                      | Leans on                                                                                               |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Menus       | Foam boots on Tellurion to a main menu with options, menu music and UI sounds. New Game is shown but disabled. The music and the sounds are copies of Somewhere's files, and the font is Somewhere's monogram.                                                                                                       | Somewhere's boot route, `core/` modules, main menu and error screen                                    |
| 2   | Game screen | New game opens the screen a night is played on: a full-screen background with freely placed buttons, a window that types out the description of the place and each button's text and options, the status (time, money, drunkenness), and a menu with Resume, Options and Quit to menu. It shows sample content only. | Tellurion's `Dialogue` runner, `Modal`, `Panel`, `Text` and `Button`; Somewhere's pause flow           |
| 3   | UI art      | The menu and the game screen have Foam's own look: colours, windows, buttons and controls, and one moving picture of a place, drawn by code. The font stays monogram, and its italic version comes into use. A phone held upright shows about 32 letters across.                                                     | Tellurion's UI theme, which reads its art from one spriteset; Somewhere's script that draws its UI art |

Phase 1 is built: [spec](superpowers/specs/2026-10-03-menus-design.md),
[plan](superpowers/plans/2026-10-04-menus.md).

Phase 2 is built: [spec](superpowers/specs/2026-10-04-game-screen-design.md),
[plan](superpowers/plans/2026-10-04-game-screen.md).

Phase 3 is larger than one design-and-plan cycle. It is cut into three specs, each with its own
plan, build and review, in this order:

1. Pixel scale, in Tellurion: the helper that picks the scale counts the width of the screen. It is
   built: [spec](../../../docs/superpowers/specs/2026-10-05-pixel-scale-design.md),
   [plan](../../../docs/superpowers/plans/2026-10-05-pixel-scale.md).
2. The look: the colours, the script that draws the UI art, every screen laid out again, and italic
   words. It is built: [spec](superpowers/specs/2026-10-05-look-design.md),
   [plan](superpowers/plans/2026-10-05-look.md).
3. The picture: the bar, drawn and moved by a shader, on the night screen and the main menu. It is
   built: [spec](superpowers/specs/2026-10-05-picture-design.md),
   [plan](superpowers/plans/2026-10-05-picture.md).

Tellurion shows its loading screen only when a screen needs an asset bundle that is not loaded yet.
Foam has one bundle, so the loading screen is added by the first phase that adds a second one.

Text longer than its area is cut into pages that the player turns, so the game screen needs no
scrolling component.

Tellurion picks the pixel scale from the width and the height of the screen: the smaller of what the
two allow, so that about 200 art pixels fit across and about 270 down, kept between 2 and 8. A phone
held upright at 1170 × 2100 device pixels gets scale 6 and shows 195 × 350 art pixels, about 32
letters across.

The scale is picked once, when the page loads. A phone that is turned afterwards keeps the scale of
its first position: loaded upright and then turned sideways, it keeps scale 6 and shows 350 × 195
art pixels, and loaded sideways and then turned upright, it keeps scale 4 and shows 292 × 525. Both
are usable. The scale does not follow a screen that changes, and a reload gives the scale of the new
position.

The story window and the menu work as follows. This is built:
[spec](superpowers/specs/2026-10-04-story-window-controls-design.md).

- The story window has no Continue button. A tap on the text or on the room under it, where the
  choices appear, or Enter or Space, continues the text, and a rose cursor blinks after the last
  letter shown, once the page is complete, to show that a press will continue. The choices are the
  window's only buttons and appear with nothing focused. They fade in over 100 ms and take a tap
  once fully shown, so a second tap of a double tap under the text that lands within the fade does
  not take one; a later second tap takes the choice under it. Somewhere's dialogue box has no
  Continue button either. It keeps a press that was meant to continue the text from taking the first
  choice.
- Every fade of something the player can click or tap lasts at most 100 ms, in and out: a window, a
  panel, its buttons, a list of choices. Only a modal's dimmed backdrop may take up to 300 ms,
  because a click on it is not a primary action. The menu and Options fade the backdrop together
  with the panel as one view, so their backdrop takes 100 ms too. The night's windows (the story
  window and the travel window) share one backdrop, which the night screen fades in with the first
  window and keeps from one window to the next, so the scene never shows undimmed between two
  windows; it fades out in 100 ms after the last window. A change of place goes through black: the
  place being left fades to black with the window that takes the player away, and the next place
  fades in from black with its description, 100 ms each way; a journey's window opens over black. A
  place never appears undimmed: the night's first place appears dimmed at once, under its
  description. A fade's first step is as long as the frame it starts in, so whatever is costly to
  build is built before that frame: the travel window once, when the night screen is attached, kept
  and filled for each journey; the next place while the window that leads there is open. Screen
  changes do not fade.
- Nobody closes a story window before its end, and Escape does not close it. A window ends through
  its text or through a choice, so every node with choices offers a way out that costs nothing.
  Tellurion's `Modal` always closes on the cancel command, so the window is an overlay of its own
  without `close`, as Somewhere's dialogue box is. Escape over a story window opens the menu above
  it, as Somewhere's pause menu opens above its dialogue box.
- A menu's default button shows the focus ring when the menu opens, whatever opened it. After that
  the ring follows the rule it follows everywhere: a pointer press hides it, and a focus key shows
  it again. The menu's Resume button is marked this way. It uses a Tellurion addition:
  [spec](../../../docs/superpowers/specs/2026-10-04-ui-overlay-initial-focus-design.md).

### The game

Each phase adds a real piece of Brno and brings in only the rules that piece needs.

| #   | Phase                  | When it is done                                                                                                                                                                                                                                                                                                                                                    | Rules it brings in                                                                                             |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 4   | Arrival and places     | New game starts with the arrival by train. The player gets to a first bar and can move on to the other on foot, by tram or by taxi, picking the destination on a minimal map. The train, the two stations, The Whisky Shop Brno, Rotor Bar and the tram stops each exist as a place with a few stand-in actions, and the author can write the content of them all. | Places, a map, moves on foot, by tram and by taxi that cost minutes and money                                  |     |
| 5   | The rules of the night | The night has its hours and an end, and places open and close. An action the player cannot afford is shown as such. The player gets drunk, and dice with shown odds decide some actions. Some people are only there at certain hours. The log of the night is shown at the end.                                                                                    | Clock, opening hours, money, drunkenness, actions that depend on time and state, dice with shown odds, the log |
| 6   | Quest                  | The night has a quest with a good and a bad ending. The stories found are listed at the end.                                                                                                                                                                                                                                                                       | Quest, endings, story list                                                                                     |
| 7   | Runs                   | A second night differs from the first, and the story collection is kept.                                                                                                                                                                                                                                                                                           | Seed, saving, Continue                                                                                         |
| 8   | The author             | The phone works, the author writes to the player, and Jakub can be met in a place.                                                                                                                                                                                                                                                                                 | Phone, the meta voice                                                                                          |

One thing waits for a later phase: the acknowledgment of OpenStreetMap, whose data the travel data
and the map come from. Where the game shows it is not decided.

Phase 4 is larger than one design-and-plan cycle. It is cut into three specs, each with its own
plan, build and review, in this order:

1. An effect on a dialogue choice, in Tellurion: a choice can carry an `onChoose` function that the
   runner calls when the choice is taken, before it follows the choice's next node. A way out uses
   it to open the travel window without a node of text in between. It is built:
   [spec](../../../docs/superpowers/specs/2026-10-06-dialogue-choice-effect-design.md),
   [plan](../../../docs/superpowers/plans/2026-10-06-dialogue-choice-effect.md).
2. Places and travel: the seven places with stand-in content and stand-in pictures, each place's
   content in its own file, the travel data with the script that first fills it, and a window where
   the player picks a way of travelling and a destination, with the minutes and the price of the
   destination. It is built: [spec](superpowers/specs/2026-10-06-places-and-travel-design.md),
   [plan](superpowers/plans/2026-10-06-places-and-travel.md).
3. The map: the travel window shows a map of Brno drawn from OpenStreetMap data, with the streets on
   foot and by taxi and the tram lines by tram. Each place is a small button at its real position
   that selects it, and the button under the map makes the journey to the selected place. It is
   built: [spec](superpowers/specs/2026-10-07-map-design.md),
   [plan](superpowers/plans/2026-10-07-map.md).

Phase 4 draws no picture of a real place. Both bars show the picture of the sample bar, and the
other five places show a plain stand-in: black with one lamp. The real pictures of the places are a
spec of their own, drawn one place at a time once the place's actions exist. The phase 4 review put
that spec after phase 6: phases 5 and 6 change what a place's buttons stand for, and a place is
drawn when the author writes its real text.

Phase 5 is built. It is larger than one design-and-plan cycle and is cut into four specs, each with
its own plan, build and review, in this order:

1. A `next` that reads the context, in Tellurion: a choice's `next` and a node's `next` may be a
   function of the context that returns a node or an id, evaluated when it is followed. Effects stay
   in `onChoose` and `onEnter`. Dice and conditions branch through it. The choice effect spec
   rejected a function `next` while it was the proposed way to do effects; this spec reopens it for
   routing only. It is designed:
   [spec](../../../docs/superpowers/specs/2026-10-08-dialogue-next-function-design.md),
   [plan](../../../docs/superpowers/plans/2026-10-08-dialogue-next-function.md).
2. Actions with costs, odds and conditions: Foam's own choice type with plain fields for the price,
   the minutes, the drinks, the odds and the level of drunkenness, turned into the engine's fields
   by Foam's `defineScript`, so the press applies the choice wherever the script runs; the story
   window, which writes the numbers into the label and greys out what the player cannot afford, and
   the travel window, which greys out a journey the player cannot pay; the level of drunkenness, in
   drinks, which drinks raise and the hours lower, shown as a number in the status line; the status
   line kept current while a window is open; and the checker's rules for the fields, for a function
   `next` and for a way out that costs nothing. It is built:
   [spec](superpowers/specs/2026-10-09-actions-with-costs-design.md),
   [plan](superpowers/plans/2026-10-09-actions-with-costs.md).
3. Locations and hours: the location type and its places, the street outside each bar and the main
   station's forecourt, the arrival rule, opening hours read for a Friday from the data and shown on
   the travel window's destination button, the closing script, ways out by the kind of place, tram
   journeys from stop to stop, people only there at certain hours, and the clock's start at 16:00.
   It is built: [spec](superpowers/specs/2026-10-10-locations-and-hours-design.md),
   [plan](superpowers/plans/2026-10-10-locations-and-hours.md).
4. The end of the night and the log: the clock's end at 08:00, after which the window that crossed
   it closes and the night ends; the log of every text read and every choice taken, with its time;
   and a screen of its own that shows the log page by page, with a button to the menu on every page.
   It is built: [spec](superpowers/specs/2026-10-10-end-of-the-night-and-log-design.md),
   [plan](superpowers/plans/2026-10-10-end-of-the-night-and-log.md).

**Phase 6 completes the first prototype: one whole night.** Its review decides what is kept and what
is rewritten, and reopens the content model.

### After phase 8

The list stays loose and is ordered at each review:

- Content updates: new places, quests and stories.
- One feature per phase when its time comes: flashbacks, flashforwards, the author's own music, the
  journal as a novel, real illustrations.

## Sources

- [Game design exploration](https://app.notion.com/p/Game-design-exploration-3018713d285680f9bccbcdc91105f5c8)
  (Notion)
- [Ideas](https://app.notion.com/p/Ideas-2eb8713d28568089979ac320efec9486) (Notion, in Czech)
