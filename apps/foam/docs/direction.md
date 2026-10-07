# Foam: direction

Started: 2026-10-03. App: `apps/foam`. Status: the direction is agreed; phases 1 to 3 are built; of
phase 4 the dialogue choice effect and places and travel are built. This is a living document: it
describes the current state and plan, and is kept correct as they change.

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

| Topic        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | A free public web game that a stranger can enjoy. What is planned here is a first version (proof of concept, prototype or v0), not the final game.                                                                                                                                                                                                                                                                                                                                                                                           |
| Run          | One night is one run. Runs feel rogue-like, and some things are saved between runs. The four-seasons structure in the idea notes is not used.                                                                                                                                                                                                                                                                                                                                                                                                |
| Goal         | Each night has a quest. There is no long arc across nights; it is a shelved question.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Start        | The night starts with the player arriving in Brno by train. The train is the first place. The player gets off at Brno-Židenice or at the main station. Each station is a place, and the player travels on from it as from any other.                                                                                                                                                                                                                                                                                                         |
| Places       | The first real places are The Whisky Shop Brno in Husovice and Rotor Bar in Dvořákova street in the city centre. Around them the first version has the train, the stations Brno-Židenice and Brno hlavní nádraží, and the tram stops Náměstí Republiky and Malinovského náměstí.                                                                                                                                                                                                                                                             |
| Travel       | The player leaves a place through a thing in its picture, picks a way of travelling (on foot, by tram or by taxi) and then a destination with its minutes and its price. A tram stop is a place of its own.                                                                                                                                                                                                                                                                                                                                  |
| Presentation | The illustration of a place fills the screen as the background. It shows the place reduced to a few large shapes that can still be named, such as a lamp, a counter or a door, rather than figurative pixel art with people and detail. It can be animated to set the mood of the place. Buttons placed freely on it stand for what the player can act on; choosing one opens a window where its text is typed out and its options are offered. The same screen shows the time, the money, the state of mind and a description of the place. |
| Rendering    | The game is drawn in Tellurion, with its own UI components. The only plain page text is the line shown while the engine starts or when it cannot start.                                                                                                                                                                                                                                                                                                                                                                                      |
| Art          | No art is AI-generated. A deterministic Node.js script, which an AI may write, draws the UI art, and the game's own code draws the pictures while it runs.                                                                                                                                                                                                                                                                                                                                                                                   |
| Look         | One list of colours serves the UI and the pictures: black, a dark indigo in several strengths, white, a rose accent, and a few bright inks for the pictures. Windows and controls are plain: black fills, one-pixel borders, square corners. Pictures are mostly black, with hard-edged shapes in flat tones and a checkerboard of single pixels for shading.                                                                                                                                                                                |
| Content      | The game's content (texts, actions, choices) is written in TypeScript, in the form of the engine's dialogue scripts. Whether a language made for writing replaces it is decided with the content model.                                                                                                                                                                                                                                                                                                                                      |
| Travel data  | The places' positions, the minutes and the price of every move, and the opening hours are data in the game's files, and the author corrects them by hand. A script fills in the first values from public map data and never changes a value that is there. What the script wrote carries a mark until the author has checked it.                                                                                                                                                                                                             |
| Language     | English only for the prototype.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Text         | For the first version the author gives notes, and temporary game text is generated from them. The final text is written by the author by hand. Phase 4 runs on invented stand-in text, marked as such in the content files, and a script lists what is left to write.                                                                                                                                                                                                                                                                        |
| Font         | Monogram, the font Somewhere uses. No other font is added. It has a regular and an italic version, each with and without an outline. All four are in `public/`. Phase 3 brings the italic version into use, for single words inside a sentence.                                                                                                                                                                                                                                                                                              |
| Journal      | A plain log of the night. Nothing is rewritten into novel prose yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Music        | Static stock synthwave, until the author's own songs exist. Stock tracks need a licence that allows use in a public web game. Until a track is chosen, Somewhere's menu music plays on the menu and keeps playing on the game screen.                                                                                                                                                                                                                                                                                                        |

## Shelved questions

These are important and deliberately not decided yet. Each is decided inside the phase that first
needs it, or at a phase review.

| Question                                                                  | Reopens                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Content model: how the story is broken into pieces and how the game picks | At the review after phase 6, or earlier if a phase needs it |
| The exact hours of the night (17:00, or 16:00 to 8:00)                    | Phase 5                                                     |
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

| #   | Phase       | When it is done                                                                                                                                                                                                                                                                                                        | Leans on                                                                                               |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Menus       | Foam boots on Tellurion to a main menu with options, menu music and UI sounds. New Game is shown but disabled. The music and the sounds are copies of Somewhere's files, and the font is Somewhere's monogram.                                                                                                         | Somewhere's boot route, `core/` modules, main menu and error screen                                    |
| 2   | Game screen | New game opens the screen a night is played on: a full-screen background with freely placed buttons, a window that types out the description of the place and each button's text and options, the status (time, money, state of mind), and a menu with Resume, Options and Quit to menu. It shows sample content only. | Tellurion's `Dialogue` runner, `Modal`, `Panel`, `Text` and `Button`; Somewhere's pause flow           |
| 3   | UI art      | The menu and the game screen have Foam's own look: colours, windows, buttons and controls, and one moving picture of a place, drawn by code. The font stays monogram, and its italic version comes into use. A phone held upright shows about 32 letters across.                                                       | Tellurion's UI theme, which reads its art from one spriteset; Somewhere's script that draws its UI art |

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
  window's only buttons and appear with nothing focused. They fade in over 300 ms and take a tap
  once fully shown, so the second tap of a double tap under the text cannot take one. Somewhere's
  dialogue box has no Continue button either. It keeps a press that was meant to continue the text
  from taking the first choice.
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

One thing from the game screen waits for these phases:

- What the player sees of an action they cannot afford, for phase 5. The game lets the money go
  below zero. Tellurion's dialogue script can hide a choice (`isVisible`); it cannot show one as
  unavailable, and a choice's label is a fixed string.

Phase 4 is larger than one design-and-plan cycle. It is cut into three specs, each with its own
plan, build and review, in this order:

1. An effect on a dialogue choice, in Tellurion: a choice can carry an `onChoose` function that the
   runner calls when the choice is taken, before it follows the choice's next node. A way out uses
   it to open the travel window without a node of text in between. It is built:
   [spec](../../../docs/superpowers/specs/2026-10-06-dialogue-choice-effect-design.md),
   [plan](../../../docs/superpowers/plans/2026-10-06-dialogue-choice-effect.md).
2. Places and travel: the seven places with stand-in content and stand-in pictures, each place's
   content in its own file, the travel data with the script that first fills it, and a window that
   lists where each way of travelling leads, with the minutes and the price of each destination. It
   is built: [spec](superpowers/specs/2026-10-06-places-and-travel-design.md),
   [plan](superpowers/plans/2026-10-06-places-and-travel.md).
3. The map: that window shows the drawn map of Brno with the places at their real positions, and
   keeps the list.

Phase 4 draws no picture of a real place. Both bars show the picture of the sample bar, and the
other five places show a plain stand-in: black with one lamp. The real pictures of the places are a
spec of their own, drawn one place at a time once the place's actions exist. The phase 4 review
decides where that spec goes in the order.

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
