# Dialogue System Design: World-Owned Text Boxes, NPCs and Branching Scripts

Implements engine-review proposal 10 (T1.10): typewriter text boxes with portraits, speaker names,
branching choices and a TypeScript authoring format. Dialogue lives in the ECS world, runs on world
time and therefore freezes under the pause menu together with everything else. Also adds the first
NPC, a tappable interact prompt for mobile parity and dialogue flags persisted through the save
blob.

Scope decisions made during brainstorming:

- **All four review features ship in v1** (typewriter reveal, portraits, branching choices,
  authoring format), plus a speaker name label and a per-character blip sound.
- **The engine never pauses anything.** Dialogue is gameplay: `dialogueSystem` runs inside
  `world.update`, so the typewriter advances on world time and the pause menu freezes it. A player
  who walks away mid-conversation pauses the game; on resume the text keeps typing.
- **World-owned rendering.** The box is drawn by a game system into the world view, not mirrored
  into the screen UI layer; there is no bridge traffic. The box itself is composed from the
  existing UI widgets (`Panel`, `Text`, `Button`), which are self-contained pixi compositions with
  no `UiRoot` dependency.
- **Authoring is TypeScript data.** Scripts are typed object literals; node references are
  compile-checked. No JSON schema, no dialogue language dependency (inkjs was considered and
  rejected as overkill; Yarn Spinner JS runtimes are unmaintained). The runner consumes plain typed
  data, so a JSON or ink adapter stays possible later without engine changes.
- **One dialogue at a time, structurally**: a singleton dialogue entity carries
  `DialogueComponent.active: Dialogue | null` (the camera/input/audio pattern).
- **Channel-only commands, one deciding system**: `dialogueSystem` is a game system and the sole
  consumer that acts on the game-owned `DialogueCommand` channel (the `doorSystem`/`zoneSystem`
  consumer pattern). Key edges are translated game-side; pointer taps push the same commands.
  Channel reads are shared snapshots, so exactly one system owns every dialogue state decision:
  that is what makes one command mean exactly one thing. The engine ships the runner, the
  authoring types and the box; it has no channel, no `Input` reference and no action names.
- **Interaction model**: a new `interact` action (`KeyE`) plus proximity zones; a tappable prompt
  bubble above the NPC keeps the demo fully playable on mobile. No `Input` API changes.
- **Movement lock is game policy**: one guard in `playerSystem`, no engine involvement.
- **Text fits every screen by measuring, not authoring discipline**: art-px screen width spans
  roughly 135 (portrait phone) to 500 (desktop), so the box wraps and windows text at runtime;
  authors write prose, never layouts.
- **Demo proof**: one NPC (Mira) exercising every script feature and a sign zone proving the
  auto-start entry point and the portrait-less collapsed layout.

## Context

- `Input.update()` is called by `inputSystem` inside `world.update`, so the action map stops
  stepping while the world is paused; the screen focus layer keeps working (the pause menu relies
  on this). During dialogue the world keeps running, so the action map stays live.
- `System.view` is the shared `World.view`; there are no per-system containers and layering is
  child insertion order. The only direct child today is `map.view`, attached when the map entity
  is added in `world.onStart`, after every `addSystem` has run, so a container attached in a
  system's `onAdd` would land underneath the map. The camera is applied per sprite
  (`graphicsSystem` subtracts `cameraPosition` and the `map.view` offset because its sprites are
  parented into the map's layers; `mapSystem` offsets `map.view` itself); nothing translates
  `World.view`, so a child attached above `map.view` and drawn in plain coordinates is
  screen-fixed for free. When T1.4 moves the camera onto a container translation, the dialogue
  layer becomes a camera-exempt sibling; nothing else changes.
- `@pixi/layout` (registered globally in `Game.ts`) walks the whole stage each prerender and
  treats any layout container whose parent has no layout as an independent root, so a
  `LayoutContainer` subtree under the world view computes fine provided the root's width and
  height are numbers (verified against @pixi/layout 3.2.0; the `Modal.resize` precedent). Pin
  `transformOrigin: 0` anywhere a layout-managed container is scaled.
- `Panel` and `Button` reference no `UiRoot`: layout comes from `@pixi/layout`'s
  `LayoutContainer`, pointer handling is plain pixi events and `Focusable` is an interface they
  offer, not a dependency. `Button`'s tap handler already calls `stopPropagation()`, so taps on
  box widgets cannot reach the view-level `move-to` listener. A bare `Panel` has no `eventMode`
  and no hit area; a tappable panel must set both itself.
- The game's `focusKeys` claim `Enter` and `Space` for `activate`; `interact` binds `KeyE` only,
  following the input spec's arbitration precedent (WASD-only movement for the same reason).
- `TriggerComponent` volumes with edge-triggered enter/exit events exist (`triggerSystem`,
  `isPlayerInside` seeding on first test); `objectFactories` dispatches Tiled objects by `type`
  with `failUnsupported` on unknown types; `doorSystem` shows the pattern for clearing
  `motion.target` and velocity.
- `EventChannel` reads are shared snapshots: `events` returns the current buffer to every reader,
  nothing is consumed and `swap()` runs once at the end of `world.update`. Multiple systems
  reading one channel per frame is established (`wallHitChannel` feeds `wallHitPopupSystem` and
  `uiBridge`), which also means two systems acting on the same command double-fire it unless
  exactly one owns the decision. Pushes made outside `world.update` (pointer handlers) land in
  the write buffer and become readable on the next update, the same latency as `Input`'s tap
  latch.
- The `Text` widget has no word wrap and its `fill` is construction-only; `setText` is the only
  mutator. `BitmapFontManager.measureText` is the pixi measurement API for wrapping. `monogram`
  is fully monospaced (every glyph advances 6 art px at native 12) and both bitmap fonts contain
  the `▶` glyph, so a selection prefix cannot jitter. `@pixi/layout` merges style objects on
  assignment instead of replacing them.
- `GraphicsComponent` requires the eight directional clip names, enforced by the `Sprite`
  constructor (`spark.json` duplicates one frame under all eight; the TODO in
  `wallHitPopupSystem` documents the workaround until T1.3). A zero-velocity entity shows
  `standing-right`.
- `save.ts` is a bespoke extraction-and-apply blob designed for new fields ("flags, inventory,
  current map"); an old save failing the extended schema resets to defaults by documented policy.
- `GameAssets.texture` throws on a missing name in dev and prod alike; a prod fallback needs an
  existence probe before the lookup.
- `PlaySound` carries only `{name}`; the `sfx` bus is implicit in `audioSystem`.
- Bitmap fonts `monogram` and `monogram-outline` load in the `default` bundle at native size 12;
  sub-native sizes are forbidden (they render ragged at odd pixel scales).
- World coordinates are art px; the `pixelScale` transform lives on the root container. Screen
  size in art px is `game.app.screen.width / game.pixelScale` (the modal resize path). Because
  `pixelScale` tracks device height, art-px screen height is stable (~240-350) on every device;
  art-px width varies ~4x and is the layout constraint.

## 1. Authoring format (`engine/dialogue/DialogueScript.ts`)

```ts
export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string; // name label; omitted = no label (signs, narration)
  portrait?: string; // game-resolved texture name; omitted = collapsed portrait panel
  // One page or several; a function is evaluated once on node entry, after onEnter.
  text: string | string[] | ((context: TContext) => string | string[]);
  choices?: DialogueChoice<TContext, TNodeId>[]; // a node with both choices and next DEV-throws
  next?: TNodeId | DialogueNode<TContext, TNodeId>; // absent + no choices = dialogue ends
  onEnter?: (context: TContext) => void; // effects: set flags, give items
};

export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: TNodeId | DialogueNode<TContext, TNodeId>; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
};

export type DialogueScript<TContext, TNodeId extends string> = {
  start:
    | TNodeId
    | DialogueNode<TContext, TNodeId>
    | ((context: TContext) => TNodeId | DialogueNode<TContext, TNodeId>);
  nodes?: Record<TNodeId, DialogueNode<TContext, TNodeId>>; // optional: inline-only scripts skip it
};
```

`defineDialogueScript` is curried so the node record infers while the context type stays explicit
(the context type is the game's own named type, e.g. `Flags`; the explicit type argument matches
the `defineComponent`/`defineEvent` precedent, where no value exists to infer from). `TNodeId`'s
only inference site is the `nodes` keys; every reference position is wrapped in `NoInfer` so it is
checked against the keys instead of widening them:

```ts
export function defineDialogueScript<TContext>() {
  return function <TNodeId extends string>(script: {
    start:
      | NoInfer<TNodeId>
      | DialogueNode<TContext, NoInfer<TNodeId>>
      | ((context: TContext) => NoInfer<TNodeId> | DialogueNode<TContext, NoInfer<TNodeId>>);
    nodes?: Record<TNodeId, DialogueNode<TContext, NoInfer<TNodeId>>>;
  }): DialogueScript<TContext, TNodeId> {
    return script;
  };
}
```

Without `NoInfer`, TypeScript infers `TNodeId` from the reference positions too: a dangling id is
absorbed into the union and the error surfaces on the valid nodes instead (verified against the
project's TypeScript 5.9.2 under its own flags). With it, a dangling `next` or `start` errors at
the offending literal; inline-only scripts leave `TNodeId` at its `string` constraint and
typecheck fine. There is no runtime graph validator; a committed type-test fixture holds the
guarantee (section 9).

```ts
export const miraScript = defineDialogueScript<Flags>()({
  start: (flags) => (flags.metMira ? 'again' : 'greeting'),
  nodes: {
    greeting: {
      speaker: 'Mira',
      portrait: 'mira',
      text: 'Welcome to Somewhere.',
      choices: [
        {text: 'Sure, show me around.', next: 'tour'},
        {text: 'Maybe later.', next: {speaker: 'Mira', portrait: 'mira', text: 'Suit yourself.'}},
      ],
    },
    tour: {
      speaker: 'Mira',
      portrait: 'mira',
      text: ['This way.', 'Mind the well.'],
      next: 'goodbye',
    },
    again: {speaker: 'Mira', portrait: 'mira', text: 'Back already?', next: 'goodbye'},
    goodbye: {speaker: 'Mira', portrait: 'mira', text: 'Bye.', onEnter: (flags) => (flags.metMira = true)},
  },
});
```

Inline nodes recurse with the same `TNodeId`, so string references inside them are checked too.

Naming guideline (stated here, enforced by review): ids for any node referenced more than once,
looped to or asserted on in tests; inline nodes for dead-end tails and one-off responses. Cycles
cannot be written inline (an object literal cannot reference itself), so hubs and loops naturally
use ids.

## 2. The runner (`engine/dialogue/Dialogue.ts`)

A plain class, no pixi and no world dependency. `TContext` infers from the injected value:

```ts
let dialogue = new Dialogue({script, context: flags, revealSpeed: 40}); // chars/s, optional, > 0 (DEV-throw)
```

Read-only state: `phase` (`'revealing' | 'idle' | 'choosing' | 'ended'`), `node`, `pageIndex`,
`pageText`, `revealedCount`, `visibleChoices`, `selectedIndex`.

- On node entry (including the start node at construction), in this order: `onEnter` fires once,
  then a `text` function is evaluated once, then `isVisible` filters choices once, so `onEnter`
  effects are visible to both. `phase` becomes `revealing` with `revealedCount = 0`. A node
  entering with an empty page list DEV-throws on every entry, not only at construction; a node
  carrying both `choices` and `next` DEV-throws (its `next` could never be followed). A node
  whose choices all filter invisible is treated as choice-less (it follows `next` or ends), with
  a DEV warning since it usually signals an authoring hole.
- `tick(deltaMS)` accumulates `revealSpeed` characters per second; the reveal pauses (`idle`) at
  the next break or the end of the page. The fully revealed last page of a node with visible
  choices becomes `choosing` instead.
- `setBreaks(offsets)`: the owner supplies ascending character offsets where the reveal pauses
  inside the current page (the box derives them from its line budget, section 4). Offsets at or
  before `revealedCount` are ignored; node and page changes clear them. The runner stays
  layout-blind: it never measures, it only honors offsets.
- `advance()`: while `revealing`, completes the current stretch instantly (to the next break or
  the page end, entering the same `idle`/`choosing` the tick path would); while `idle` at a
  break, resumes revealing; while `idle` at page end, shows the next page, else follows `next`
  (id lookup or inline node), else ends; while `choosing`, confirms `selectedIndex`.
- `moveSelection(delta)`: moves `selectedIndex` through `visibleChoices`, wrapping.
- `select(index)`: sets `selectedIndex` directly (pointer hover); ignored unless `choosing` and
  the index is valid.
- `choose(index)`: confirms choice `index` directly (pointer path); ignored unless `choosing` and
  the index is valid. Indices always address `visibleChoices` (the rendered rows), never the raw
  `choices` array.
- `ended` is inert: every method is a no-op.

## 3. ECS integration (`game/`)

Dialogue ECS state and policy are game code: the engine cannot import a game-created channel (the
layering `AudioComponent` documents), and the command vocabulary is game input policy anyway. The
engine ships the runner, the authoring types and the box (`engine/dialogue/`); it knows nothing
about channels, actions or triggers.

- **`DialogueComponent`** (`game/DialogueComponent.ts`):
  `defineComponent<{active: Dialogue | null}>()`, constructed
  `new DialogueComponent({active: null})` on a game-created singleton entity. Component sets stay
  fixed at construction; starting a dialogue assigns `active`, ending clears it.
- **`DialogueCommand`** (`game/DialogueCommand.ts`):
  `{type: 'interact' | 'advance' | 'select' | 'up' | 'down' | 'choose', index?}`; `index` rides
  only `select` and `choose`, and producers omit it otherwise (`exactOptionalPropertyTypes`
  rejects `index: undefined`). One game-owned channel, multiple consumers.
- **`dialogueSystem`** (`game/dialogueSystem.ts`; module singleton, `components:
  [TriggerComponent]`, reaching the singleton through `dialogueQuery` and the player through
  `playersQuery`): every dialogue state decision lives in this one system, which is what makes
  one command mean exactly one thing (a second deciding system reading the same snapshot would
  start a dialogue and instantly skip its first page). Each update it:
  - Handles each command once. `interact` with a dialogue active calls `advance()`; `interact`
    with none active starts the script of the `npc` trigger the player stands in (if any) and
    moves on to the next command, so the starting press can never also advance. `advance` (the
    tap command) calls `advance()` only while `revealing` or `idle` and is dropped while
    `choosing`, so a stray tap on the text panel can never confirm a choice. `up`/`down` call
    `moveSelection`, `select` calls `select(index)` (pointer hover), `choose` calls
    `choose(index)`. While none is active, dialogue-scoped commands are dropped.
  - Drains `triggerEnterChannel`: a `zone` trigger with a `dialogue` property auto-starts its
    script on enter when none is active (signs; re-entering re-shows, which is correct for a
    sign; an enter arriving while a dialogue is active is dropped for good, edge-triggered, and
    only exit-and-re-enter brings it back). Zone `sound` and `dialogue` properties compose;
    `zoneSystem` is untouched.
  - Clears the player's `motion.target` AND `motion.velocity` on every start, both paths (the
    `doorSystem` pattern). The sign path needs it most: its enter edge fires precisely because
    the player was walking, and the `playerSystem` lock stops input handling, not already-set
    velocity; without the clear, `motionSystem` slides the locked player through the whole
    conversation.
  - Ticks `active` with the world delta after command handling, so a dialogue started this frame
    starts revealing this frame; when the runner reaches `ended`, it clears `active`.
  - Drops commands that no longer match the current phase silently: with one-frame channel
    latency that is buffered-input reality, not an error.

Pause needs no code: a paused world does not run `dialogueSystem`, so the reveal, the marker blink
and command draining all freeze together.

## 4. The box (`engine/dialogue/DialogueBox.ts`, `engine/dialogue/wrapText.ts`)

`DialogueBox` is an engine display class in the `Modal` idiom: a flat class owning a `view`,
composed from existing widgets, no inheritance, no ECS and no channels. Layout C: a flex row of
two `Panel`s; the portrait panel (nine-slice background, portrait sprite, name `Text` underneath)
and the text panel (content `Text`, a column of choice `Button`s, the advance marker sprite).
Nodes without `portrait` collapse to the text panel alone, where the speaker name (when present)
renders as a header row; nodes without `speaker` show no name. Below `metrics.collapseWidth` the
box always uses the collapsed layout: on a ~140 art-px portrait phone the 32 px portrait would
eat a quarter of a row that is already down to ~14 monospaced characters per line.

Construction injects everything (theme as data, fresh instances per box because widgets own and
destroy their backgrounds):

```ts
new DialogueBox({
  panelBackground: () => pixi.Container, // nine-slice thunk, called per panel
  choiceBackgrounds: () => ButtonOptions['backgrounds'], // thunk, called per choice
  font: {fontFamily: string, fontSize: number, fill: pixi.ColorSource},
  metrics: {margin, padding, gap, portraitSize, choiceGap, choiceMinHeight, height, collapseWidth}, // art px
  markerTexture: pixi.Texture,
  onAdvanceTap: () => void,
  onChooseTap: (index: number) => void,
  onChoiceHover: (index: number) => void,
});
```

- **Sync API**, called by the game system: `showNode({speaker?, portraitTexture?, pages})`,
  `setRevealed(count)`, `setChoices(texts, selectedIndex)`, `setSelected(index)`,
  `setAdvanceMarker(visible)`, `resize(width, height)`, `destroy()`; plus read-only `breaks`, the
  pause offsets computed for the current page (section 2).
- **Change detection is part of the contract**: `showNode` and `setChoices` do the expensive work
  (wrap text, rebuild the `Button` column) and are called only on node or page change;
  `setSelected` touches only the prefix labels; `setRevealed` and `setAdvanceMarker` are the
  per-frame calls and mutate only on an actual change. Buttons are never rebuilt within a node,
  so their hover and press state survives the per-frame sync.
- **Typewriter without reflow, on any screen**: `showNode` wraps each page into explicit lines
  with `wrapText(text, width, measure)`, a pure, length-preserving function over bitmap-font
  measurement (it replaces a space with a newline, never inserts or deletes, so runner character
  counts and box substrings always align; a single word wider than the panel DEV-throws).
  `setRevealed(count)` sets a substring of the pre-wrapped text, so a partially revealed word can
  never jump lines. Lines beyond the panel's line budget become `breaks`: the reveal pauses
  there and an advance continues with the next window, so any text fits any screen and nothing
  is ever clipped.
- **Choices are `Button`s** wired to `onChooseTap(i)`, with `onChoiceHover(i)` on pointer-over so
  the hover highlight and the selection can never point at different rows. The selected choice
  (world truth, driven by `up`/`down`/hover) renders as a `'▶ '` label prefix on the selected
  row and two-space padding on the rest; `monogram` is monospaced, so the swap cannot jitter.
  `Text` fill is construction-only, so v1 uses the prefix alone. `choiceMinHeight` and a
  generous `choiceGap` keep adjacent choices tappable on a phone.
- **Tap surfaces**: the text panel sets `eventMode: 'static'` with a panel-sized hit area (a
  bare `Panel` has neither), fires `onAdvanceTap` and stops propagation; choice buttons stop
  propagation on their own. Nothing dialogue-related reaches the view-level `move-to` listener.
- The root positions itself in screen art px: a bottom bar of fixed `metrics.height`, inset by
  `metrics.margin`, width from `resize`. `resize` re-wraps the current page, recomputes the
  remaining `breaks` and re-applies the revealed substring, so rotation or a window resize
  mid-reveal cannot strand stale wrapping. The box appears and disappears instantly in v1; an
  entrance animation would be a world-time tween later, never a screen-scheduler fade.

## 5. Input

- **Action map**: add `interact: {keys: ['KeyE']}` to `game/input.ts`. `Space` and `Enter` stay
  with the focus layer. No `pointerTap` on the binding: all pointer input reaches dialogue through
  pixi objects.
- **`dialogueInputSystem`** (game): translates action edges into commands; `interact` pressed
  pushes `interact` always (cheap, rare); `move-up`/`move-down` pressed push `up`/`down` only
  while a dialogue is active (no channel churn from walking).
- **Pointer**: prompt tap pushes `interact`; text panel tap pushes `advance`; choice hover pushes
  `select(i)`; choice tap pushes `choose(i)`.
- **One physical button**: E starts, skips, advances and confirms; `W`/`S` move the selection and
  hovering a choice moves it too, so mouse users always confirm the row that looks chosen. On
  touch, taps start (prompt), skip and advance (text panel) and confirm (a choice directly); a
  text-panel tap never confirms a choice (section 3). No cancel input in v1: conversations exit
  through their graph.

## 6. Game wiring

- **`game/flags.ts`**: the typed mutable flags object, `{metMira: boolean}` for the demo. It is
  the dialogue context and a save-blob field. Module state outlives the world: `world.onStart`
  resets it to defaults before `applyStagedSave` runs, so New Game after a finished playthrough
  starts clean and Continue still restores the saved values.
- **`game/dialogueRegistry.ts`**: a typed record mapping registry names to scripts
  (`{mira: miraScript, sign: signScript}`); Tiled `dialogue` properties resolve against
  `keyof typeof dialogueRegistry` at spawn.
- **`game/dialogue.ts`**: the singleton entity
  (`new Entity({components: [new DialogueComponent({active: null})]})`), plus `dialogueQuery` and
  `dialogueCommandChannel` files (the established query-per-singleton boilerplate; T2.15 world
  resources kills it later). `world.onStart` also clears `active`: a mid-dialogue Quit leaves it
  set, and the singleton outlives the run.
- **`npc` object factory** (`objectFactories`): the Tiled rect is the interaction zone
  (`TriggerComponent`, type `npc`); the entity also carries `MotionComponent` (zero velocity,
  positioned at the rect center via `getPositionForBoundingBoxCenter`) and `GraphicsComponent`
  with the `npc` spritesheet, riding the documented duplicated-clip-names workaround until T1.3
  (the sheet lists the down-facing art under all eight clip names because the `Sprite`
  constructor demands all eight; the zero-velocity path shows `standing-right`). The factory
  validates the `dialogue` property at spawn against the registry (its keys are static, so there
  is no forward-reference problem): missing or unregistered fails loud (`failUnsupported`
  precedent) and the NPC spawns inert (sprite yes, prompt never); `dialogueSystem` re-checks at
  start and no-ops, so an inert NPC can never start a script.
- **`playerSystem` lock**: one early return while `dialogueQuery`'s `active` is non-null, staying
  the first statement of the update so the lock covers the whole body. This also neutralizes
  view-level `move-to` taps during dialogue.
- **`dialogueBoxSystem`** (game, `components: [TriggerComponent]`): owns the dialogue render
  layer, a container it attaches to `World.view` lazily on first use (`map.view` is attached at
  world start, after every `addSystem`, so a container attached in `onAdd` would land underneath
  the map). Its `onRemove` destroys the box, the prompt and the layer: `World.view` is reused
  across runs and a mid-dialogue Quit must not orphan them. Each update it
  - creates a `DialogueBox` when `active` flips non-null (wiring tap and hover callbacks to
    channel pushes) and destroys it when `active` clears. The portrait resolves through an
    existence probe with a loud warning and collapsed fallback (`GameAssets.texture` throws in
    dev and prod alike, so the probe comes first);
  - syncs `showNode`/`setChoices` on node or page change, `setSelected` on selection change and
    `setRevealed`/`setAdvanceMarker` per frame (the box's change-detection contract, section 4),
    passing `box.breaks` to `active.setBreaks` after `showNode` and `resize`; blinks the marker
    on accumulated world time (500 ms period, accumulator reset on dialogue start);
  - pushes `new PlaySound({name: 'blip'})` (the `sfx` bus is implicit) for every third newly
    revealed glyph, but only for tick-sized reveals: an advance-skip reveals a whole stretch in
    one frame and plays at most one blip, and spaces and injected newlines never blip;
  - reads screen art-px dimensions each frame and calls `resize` on change (no resize plumbing);
  - draws the interact prompt: one shared bubble sprite in the dialogue layer above the in-range
    NPC's head, positioned from the NPC's `MotionComponent` position and `GraphicsComponent`
    bounding-box height minus `cameraPosition` only (the layer is not inside `map.view`, so
    unlike `graphicsSystem` sprites there is no map offset to subtract). The sprite is
    `eventMode: 'static'` with a hit area and stops propagation; taps on it push `interact`.
    Visible while the player is inside an `npc` trigger and no dialogue is active; several
    overlapping zones: first match wins.
- **`world.ts` ordering** (comments are load-bearing, the existing convention):
  `dialogueInputSystem` right after `inputSystem` (translates the freshly advanced input);
  `dialogueSystem` next, before `playerSystem`: it reads last frame's command snapshot and the
  `isPlayerInside` persisted from last frame's `triggerSystem` run (one frame stale, fine for a
  standing player), starts or advances, ticks, and `playerSystem` then sees `active` and locks
  the same frame; `dialogueBoxSystem` after `graphicsSystem` (renders the just-ticked state).
  Register `dialogueCommandChannel`, add `dialogueQuery` and the dialogue entity.

## 7. Persistence

- The save schema grows `flags: z.object({metMira: z.boolean()})`; `writeSave` captures the flags
  object, `applyStagedSave` restores it. An old save failing the new schema resets (existing
  documented policy; acceptable pre-release). `world.onStart` resets flags to defaults first
  (section 6), so New Game means clean flags, not last run's.
- Mid-dialogue state is never persisted. A save during a conversation (pause menu save, or the
  `visibilitychange` auto-save) stores position and flags as they stand; loading always lands
  outside any dialogue.
- Authoring rule that makes this safe: completion flags go on terminal nodes' `onEnter`. Quitting
  mid-conversation then only loses what was not reached, never records what did not happen.

## 8. Errors and validation

- **Compile time**: dangling `next`/`start` references error at the offending literal via
  `defineDialogueScript`'s `NoInfer` reference positions; malformed nodes are type errors; there
  is no runtime graph validator. A committed type-test fixture holds the guarantee (section 9).
- **Spawn time, loud** (`failUnsupported`, the door-target precedent): `npc` object with a missing
  or unregistered `dialogue` property; the NPC spawns inert.
- **Show time, loud with prod fallback**: a `portrait` name missing from the atlas warns loud and
  the box renders collapsed; the check is an existence probe because `GameAssets.texture` throws
  in dev and prod alike.
- **Runner invariants (DEV-throws)**: a node entering with an empty page list (every entry, not
  only construction); a node carrying both `choices` and `next`; a non-positive `revealSpeed`. A
  node whose choices all filter invisible is treated as choice-less, with a DEV warning.
- **Authoring overflow**: a single word wider than the text panel DEV-throws in `wrapText`;
  everything else fits by windowing (section 4), nothing clips.
- **Stale commands are dropped silently** (section 3): buffered-input reality, the same tolerance
  `triggerSystem` shows for stale state.

## 9. Testing

- **`Dialogue` runner** (pure unit tests, the bulk): phase transitions, tick math,
  advance-as-skip entering the same phase a tick-completed stretch would, `string[]` paging,
  break honoring (reveal pauses at offsets, advance resumes inside the page, stale offsets
  ignored, breaks cleared on page turn), inline `next` traversal, callable `start`, node-entry
  order (`onEnter` then `text` then `isVisible`, each once), selection wrapping, `select`
  bounds, `isVisible` filtering and the all-hidden choice-less fallback, terminal behavior,
  `ended` inertness, `choose` bounds against `visibleChoices`, the DEV-throws (empty pages per
  entry, choices+next, non-positive `revealSpeed`).
- **Type fixtures**: a dangling `next` and a dangling `start` under `// @ts-expect-error`; the
  Mira, inline-only and callable-`start` fixtures compile.
- **`wrapText`**: unit tests with a fake fixed-width measurer: length preservation (a space
  replaced, never inserted), the no-reflow guarantee (wrapping any prefix never breaks earlier
  than the full text), the unbreakable-word DEV-throw, and one mapping test that a runner
  `revealedCount` substring of pre-wrapped text stays aligned with the authored text.
- **`dialogueSystem`** (world-harness tests, the `timerSystem` pattern): one `interact` starts
  without advancing (the start consumes it), `interact` advances while active, both start paths
  clear `motion.target` and velocity, sign auto-start on the enter edge and dropped while a
  dialogue is active, dialogue-scoped commands dropped while inactive, stale-phase commands
  dropped, `active` cleared on `ended`, a started dialogue ticks the same frame, reveal count
  frozen across a paused `update()`.
- **Game systems**: `dialogueInputSystem` gating, the `playerSystem` lock (extending its existing
  suite), the world-start reset (flags to defaults, `active` cleared,
  `dialogueBoxSystem.onRemove` destroys box and prompt).
- **`DialogueBox`**: construction and sync headlessly, with injected thunks and a fake measurer:
  collapsed states (no portrait, name header row, `collapseWidth`), windowing and `breaks`,
  selection prefix via `setSelected` without button rebuilds, marker visibility, `resize`
  re-wrap preserving the revealed count.
- **Manual harness checklist**: typewriter feel and blip cadence (no burst on skip), marker
  blink, pause mid-typewriter then resume, rotate or resize mid-dialogue, save/Continue flag
  round-trip, New Game after a finished run greets fresh, full tap-only flow on a real phone.

## 10. Demo content and acceptance

- **Mira**: `npc` object on the map, `dialogue: 'mira'`. The script (section 1 example) exercises
  portrait, name, multi-page text, choices with an inline dead-end tail, flag-driven `start` and
  a terminal `onEnter` flag write.
- **Sign**: a `zone` object with `dialogue: 'sign'`; `signScript` is an inline-only script
  (`start: {text: 'KEEP OUT.'}`): no speaker, no portrait, proving the collapsed layout and the
  auto-start path. Place the zone flush against the wall it labels, not across a walking path:
  auto-start locks movement, and a zone that can be brushed mid-walk reads as a trap.
- **Map**: place both objects in `assets/map.tmx` and re-export with `export-assets.mjs` (needs
  the Tiled binary via `TILED_PATH`); the export guard does not validate object types or
  properties, so eyeball the exported `map.json`.
- **New assets**: `portraits` (one 32x32 Mira frame) and `npc` spritesheets are hand-authored
  PNG+JSON in the `game` bundle like `character.json` (no character-sheet generator exists; the
  `npc` sheet lists its one frame under all eight clip names); `prompt-bubble` follows the
  `spark` pattern, a generated sheet in the `game` bundle (it is a world sprite; the `ui` sheet
  is menu chrome loaded at startup); `advance-marker` joins `generate-ui-atlas.mjs` (`ui` sheet,
  `default` bundle: it is box chrome); `blip.wav` joins `generate-placeholder-audio.mjs` (its
  `blip()` helper exists; `game` bundle).
- **Acceptance walk**: approach Mira, prompt appears; start with E or a tap and the first line
  types out (the starting press must not skip it); the world stays live while the player is
  locked; text types with blips; advance skips, pages turn; choices navigate with W/S, follow
  mouse hover and confirm with E, or tap directly; the branch tail plays; `metMira` flips;
  talking again greets differently; the sign auto-shows the collapsed box without sliding the
  player, and re-shows on re-entry; pausing mid-typewriter freezes the reveal and resume
  continues it; quit and Continue restores the flag; New Game greets fresh; the whole flow works
  tap-only on a real phone at ~14 characters per line.
