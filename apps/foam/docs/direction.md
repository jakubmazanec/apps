# Foam: direction

Started: 2026-10-03. App: `apps/foam`. Status: the direction is agreed; phases 1 and 2 are built.
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

| Topic        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose      | A free public web game that a stranger can enjoy. What is planned here is a first version (proof of concept, prototype or v0), not the final game.                                                                                                                                                                                                                                                                            |
| Run          | One night is one run. Runs feel rogue-like, and some things are saved between runs. The four-seasons structure in the idea notes is not used.                                                                                                                                                                                                                                                                                 |
| Goal         | Each night has a quest. There is no long arc across nights for now.                                                                                                                                                                                                                                                                                                                                                           |
| Presentation | The illustration of a place fills the screen as the background. It is abstract art rather than figurative pixel art, and it can be animated to set the mood of the place. Buttons placed freely on it stand for what the player can act on; choosing one opens a window where its text is typed out and its options are offered. The same screen shows the time, the money, the state of mind and a description of the place. |
| Rendering    | The game is drawn in Tellurion, with its own UI components. The only plain page text is the line shown while the engine starts or when it cannot start.                                                                                                                                                                                                                                                                       |
| Language     | English only for the prototype.                                                                                                                                                                                                                                                                                                                                                                                               |
| Text         | For the first version the author gives notes, and temporary game text is generated from them. The final text is written by the author by hand.                                                                                                                                                                                                                                                                                |
| Font         | Monogram, the font Somewhere uses. No other font is added. It has a regular and an italic version, each with and without an outline. The regular version is in `public/`; the italic version is added by the phase that first uses it.                                                                                                                                                                                        |
| Journal      | A plain log of the night. Nothing is rewritten into novel prose yet.                                                                                                                                                                                                                                                                                                                                                          |
| Music        | Static stock synthwave for now; the author's own songs come later. Stock tracks need a licence that allows use in a public web game. Until a track is chosen, the menu plays Somewhere's menu music.                                                                                                                                                                                                                          |

## Shelved questions

These are important and deliberately not decided yet. Each is decided inside the phase that first
needs it, or at a phase review.

| Question                                                                  | Reopens                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Content model: how the story is broken into pieces and how the game picks | At the review after phase 6, or earlier if a phase needs it |
| The exact hours of the night (17:00, or 16:00 to 8:00)                    | Phases 4 and 5                                              |
| What is saved between runs beyond the story collection                    | Phase 7                                                     |
| A long arc across nights (phone contacts unlocked by flashbacks)          | After phase 8                                               |
| The style of the real background art, beyond it being abstract            | When the first real background is needed                    |
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
- Foam's specs and plans go under `apps/foam/docs/superpowers/`, laid out as in Somewhere.
- Specs for Tellurion additions go under the root `docs/superpowers/`, where the Tellurion package
  spec already is.

## Phases

### Basic UI

| #   | Phase       | When it is done                                                                                                                                                                                                                                                                               | Leans on                                                                                     |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Menus       | Foam boots on Tellurion to a main menu with options, menu music and UI sounds. New Game is shown but disabled. UI art, music and sounds are copies of Somewhere's files for now; the font is Somewhere's monogram.                                                                            | Somewhere's boot route, `core/` modules, main menu and error screen                          |
| 2   | Game screen | New game opens the screen a night is played on: a full-screen background with freely placed buttons, a window that types out the description of the place and each button's text and options, and the status (time, money, state of mind), with pause and quit. It shows sample content only. | Tellurion's `Dialogue` runner, `Modal`, `Panel`, `Text` and `Button`; Somewhere's pause flow |
| 3   | UI art      | The menu and the game screen have Foam's own look: palette, panels and buttons, and one abstract animated background. The font stays monogram.                                                                                                                                                | Tellurion's UI theme, which reads its art from one spriteset                                 |

Phase 1 is built: [spec](superpowers/specs/2026-10-03-menus-design.md),
[plan](superpowers/plans/2026-10-04-menus.md).

Phase 2 is built: [spec](superpowers/specs/2026-10-04-game-screen-design.md),
[plan](superpowers/plans/2026-10-04-game-screen.md).

Tellurion shows its loading screen only when a screen needs an asset bundle that is not loaded yet.
Foam has one bundle, so the loading screen is added by the first phase that adds a second one.

Text longer than its area is cut into pages that the player turns, so the game screen needs no
scrolling component.

Tellurion picks the pixel scale from the height of the screen. On a phone held upright that leaves
about 24 characters per line, so the game screen works there but is cramped. The scale for such
screens is settled in phase 3.

### The game

Each phase adds a real piece of Brno and brings in only the rules that piece needs.

| #   | Phase       | When it is done                                                                                                              | Rules it brings in                                                                     |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 4   | First place | The player can spend an evening in one real bar: order, talk, listen in, leave. The log of the evening is shown at the end.  | Clock, money, drunkenness, actions that depend on time and state, dice with shown odds |
| 5   | The city    | The player can move between a few real places on foot or by tram until morning. Some people are only there at certain hours. | Places, travel, the full night                                                         |
| 6   | Quest       | The night has a quest with a good and a bad ending. The stories found are listed at the end.                                 | Quest, endings, story list                                                             |
| 7   | Runs        | A second night differs from the first, and the story collection is kept.                                                     | Seed, saving, Continue                                                                 |
| 8   | The author  | The phone works, the author writes to the player, and Jakub can be met in a place.                                           | Phone, the meta voice                                                                  |

**Phase 6 completes the first prototype: one whole night.** Its review decides what is kept and what
is rewritten, and reopens the content model.

### After phase 8

The list stays loose and is ordered at each review:

- Content updates: new places, quests and stories.
- One feature per phase when its time comes: flashbacks, flashforwards, taxi, the author's own
  music, the journal as a novel, real illustrations.

## Sources

- [Game design exploration](https://app.notion.com/p/Game-design-exploration-3018713d285680f9bccbcdc91105f5c8)
  (Notion)
- [Ideas](https://app.notion.com/p/Ideas-2eb8713d28568089979ac320efec9486) (Notion, in Czech)
