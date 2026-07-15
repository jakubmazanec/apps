# Audio System Design — Mixer, Bus Graph, Two Consumers, Demo Wiring

Implements T1.2 of [engine-review-2026-07-04.md](../../engine-review-2026-07-04.md): the engine
has zero audio code today — no dependency, no playback, nothing. This design adds an in-house Web
Audio wrapper and wires it to both audio consumers the engine has: the UI/screen layer and the
ECS/gameplay layer.

Scope decisions made during brainstorming:

- **In-house, no dependency.** howler.js is unmaintained, `@pixi/sound` has been dormant since
  2024-07, and the needed surface is small. (Confirming the review's call.)
- **Two consumers, one mixer.** UI/menu audio calls the mixer directly (must work with no world,
  e.g. the main menu); gameplay SFX flow through an ECS event channel. See §1.
- **Four buses**: `master → {music, sfx, ui}`, so UI, music, and SFX route separately. Only
  `master` mute is wired to a control this cycle; independent per-bus level is a ready seam.
- **Minimal engine hook added now**: `UiRoot` emits semantic focus events (`move`/`reject`) so
  focus-navigation and error sounds have somewhere to attach. The engine UI toolkit stays
  audio-agnostic.
- **Persistence deferred**, seam named — the T1.8a validated-storage wrapper does not exist yet;
  mute reads from the in-memory `settings` object this cycle.
- **Demo is the acceptance test** (audio barely unit-tests): SFX on wall-hit, menu/game music,
  and the full UI-sound set.

## Context

`source/` contains no audio code, no dependency, no playback. Two facts shape the design:

1. **The main menu has no ECS world.** `mainMenuScreen` runs widgets and (will) play menu music
   with no `World` in sight. So UI/menu audio cannot route through an ECS system — there is no
   `world.update` to drain it. This forces the two-consumer split below.
2. **The engine just shipped an Input system** (T1.1,
   [2026-07-14-input-system-design.md](2026-07-14-input-system-design.md)) whose structure this
   design mirrors almost file-for-file on the gameplay side: `AudioMixer` ↔ `Input`,
   `AudioComponent` ↔ `InputComponent`, `audioSystem` ↔ `inputSystem`, `playSoundChannel` ↔
   `wallHitChannel`.

## 1. Two consumers, one mixer

Audio has two consumers with different native shapes — exactly the split the input system draws —
but unlike input they share **one output**: a single `AudioContext`, one master volume, one pair of
speakers. The shared resource is the `AudioMixer`; the two consumers reach it through two idioms.

|                    | UI / screen layer                          | Gameplay / ECS layer                        |
| ------------------ | ------------------------------------------ | ------------------------------------------- |
| Consumer           | Widgets, screens, focus system             | ECS systems                                 |
| Trigger shape      | Event handlers → **direct mixer calls**    | Polled per-frame → `PlaySound` events       |
| Works with no world? | **Yes** (the menu has no world)          | No (needs `world.update`)                   |
| On pause           | Still plays (UI stays live while paused)   | Frozen for free (no new SFX)                |
| Reaches the mixer  | Imports the `audio` singleton directly     | `audioSystem` holds the mixer via a component |
| Bus                | `ui` (and `music` for menu/context tracks) | `sfx`                                        |

**Boundary rule.** Sounds triggered by UI interactions (clicks, typing, focus movement, errors)
and context music (menu vs. battle) belong to the UI/screen layer and call the mixer directly.
Sounds triggered by the simulation (a wall hit, a pickup, a hit-spark) belong to the ECS layer and
are emitted as `PlaySound` events. The two never cross: an ECS system never plays a UI click; a
widget never emits a `PlaySound` event.

**Why the split is forced, not stylistic.** SFX must freeze on pause and the menu must make sound
with no world — a single mechanism cannot do both. Routing gameplay SFX through the world buys
"frozen on pause" for free (the review's T1.9 rule: *anything that must freeze with the world runs
through the world*), while the direct UI path is the only thing that works before a world exists.

**The one deliberate asymmetry — music.** Music is neither of the above: it must survive pause and
outlive individual screens (audio lives outside world time). So music is driven by **direct mixer
calls from the screen/game context** (`mainMenuScreen.onShow`, `gameScreen.onShow`), never through
the world and never auto-stopped by pause. Ducking or pausing music on world-pause is a per-game
choice wired in `pauseFlow` later — a named seam, not in the demo.

## 2. Engine surface

### `AudioMixer` (`source/engine/audio/AudioMixer.ts`)

A pure Web Audio wrapper with **no pixi coupling**: it operates on raw `AudioBuffer`s, never on
asset names, so name→buffer resolution stays at the call sites (§4) and the mixer unit-tests against
an injected fake `AudioContext` with no loader in the picture.

**Lazy context, SSR-safe.** The mixer is a module singleton (§5), so it is constructed at
module-evaluation time — but `new AudioContext()` throws in Node and in the jsdom test graph. The
constructor therefore takes a `createContext` factory and defers it: the `AudioContext` and its gain
graph are built on first use (`context`, `play`, `playMusic`, or `unlock`), never at construction.
This keeps module load safe under SSR/tests and lets tests inject a fake context.

Bus graph — four `GainNode`s:

```
sfx  ──┐
ui   ──┼──→ master ──→ context.destination
music ─┘
```

`master` is the root gate (muting it silences everything); `music`/`sfx`/`ui` are independent
routing points a mute can target.

```ts
type AudioBus = 'master' | 'music' | 'sfx' | 'ui';

type AudioMixerOptions = {
  // Factory for the single AudioContext, invoked lazily on first use. Deferring creation keeps
  // module load SSR-safe (no AudioContext in Node) and lets tests inject a fake.
  createContext: () => AudioContext;
};

class AudioMixer {
  constructor(options: AudioMixerOptions);

  get context(): AudioContext; // created on first access; exposed so the loader parser decodes with it (§3)

  /** Fire-and-forget one-shot. New AudioBufferSourceNode → the chosen bus → start(); the node
   *  disconnects itself on `ended`. One node per playback (Web Audio nodes are single-use). */
  play(buffer: AudioBuffer, options: {bus: 'sfx' | 'ui'}): void;

  /** The single music voice on the `music` bus. Replaces any current track (how menu→battle music
   *  swaps). Holds `#musicSource`. */
  playMusic(buffer: AudioBuffer, options?: {loop?: boolean}): void; // loop defaults true
  stopMusic(): void;

  setMuted(bus: AudioBus, muted: boolean): void;

  /** Installs one-shot window pointerdown + keydown listeners; the first gesture calls
   *  context.resume() and removes them. Idempotent; no-op once running. */
  unlock(): void;

  destroy(): void; // stop music, remove listeners, close context
}
```

Semantics:

- **Mute is the only level control this cycle.** A muted bus is gain 0, unmuted is gain 1; the mute
  intent is stored per bus and applied when the gain graph is built (so a `setMuted` before first
  use still takes effect). Only `master` is wired to a control (§5.1); the other buses exist as
  routing points. Per-bus **volume** — a stored 0..1 level plus `setVolume` — arrives with the
  slider UI (§8), not built now since nothing adjusts it.
- **`play` is fire-and-forget.** SFX and UI sounds are short and uncounted; the mixer returns no
  handle (the review: *systems don't hold audio handles*). The source node is created, connected to
  the bus, started, and drops its own connection on `ended` (GC reclaims it). Overlapping plays are
  independent nodes — correct for rapid SFX.
- **Music is a single voice.** `playMusic` stops the current `#musicSource` (if any) before
  starting the new one, so a screen/context switch cleanly swaps tracks. Buffer-sourced looping is
  fine for short loops; a streaming `MediaElementAudioSourceNode` path for long tracks is a named
  seam (§8).
- **Unlock.** The `AudioContext` starts `suspended` under the browser autoplay policy. `unlock()`
  resumes it on the first user gesture anywhere (pointer or key) and then removes its listeners.
  iOS quirks beyond first-gesture unlock (silent switch, low-power mode) are a known limitation
  (§8).
- **House style:** options-object constructor, `#`-private fields, `DisposableStack` for listener
  cleanup, strict lifecycle throws.

### `PlaySound` event (`source/engine/audio/PlaySound.ts`)

`defineEvent<{name: string}>()`. Engine-generic; a gameplay SFX identified by its asset cache key.
No bus field — gameplay SFX are always the `sfx` bus (§1 boundary rule). Per-play pitch/gain
variation is a named future field (§8).

### `AudioComponent` (`source/engine/audio/AudioComponent.ts`)

`defineComponent<{mixer: AudioMixer; channel: EventChannel<PlaySound>}>()`. Purely for
discoverability, mirroring `InputComponent`. It carries the mixer **and** the channel because the
engine `audioSystem` cannot import a game-created channel (engine must not depend on game) — the
component is how the engine system reaches a game-owned channel. Singleton entity + query, per the
T1.1 pattern; not a module singleton, not a world resource (that API arrives with T2.15; the read
migrates then).

### `audioSystem` (`source/engine/audio/audioSystem.ts`)

Module-level `System` in the `timerSystem`/`inputSystem` idiom (`displayName: 'Audio system'`,
`components: [AudioComponent]`). It reads the singleton via `getFirst()` (which throws loudly when
the entity is missing — the `inputSystem`/`cameraSystem` precedent) and, each world update, drains
the `PlaySound` channel: for each event it resolves `Assets.get<AudioBuffer>(name)` and calls
`mixer.play(buffer, {bus: 'sfx'})`. A missing/unloaded buffer is a DEV-throw / prod-warn, then skip
(house style). It is the **only** holder of the mixer on the SFX path — gameplay systems only push
events, never touch audio handles. It holds no module state, so it does not deepen the known
single-world limitation.

**No new event machinery.** `EventChannel` remains the single ECS event mechanism; audio introduces
no new event logic. The `PlaySound` channel is a game module singleton (§5), pushed to by producers
and **registered on the world** so its `swap()` runs. Registration is mandatory for delivery:
`EventChannel.push` already guards the review's unbounded-channel bug directly (an unregistered push
throws in DEV, warns-once-and-drops in prod), so forgetting to register fails loudly instead of
leaking.

## 3. Asset loading — through pixi `Assets`, nothing bespoke

Sounds load through the existing pixi `Assets` pipeline exactly like textures, fonts, and Tiled
maps — same bundles, same loading screen, same per-screen load/unload lifecycle, same `Assets.get`.
Audio adds only a parser and some bundle entries.

### `audioBufferAsset` (`source/pixi-tools/audioBufferAsset.ts`)

A custom `LoaderParser`, a direct mirror of `tiledTilemapAsset.ts`:

- `test` — matches audio extensions (`.ogg`/`.wav`).
- `load` — `fetch(url) → arrayBuffer → context.decodeAudioData() → AudioBuffer`.
- Registered via `extensions.add(...)`, alongside the existing Tiled parsers. The decoded
  `AudioBuffer` lands in the normal `Assets` cache under its asset name.

**The one wrinkle: the decode context.** `decodeAudioData` needs an `AudioContext`. The parser
decodes with the mixer's context, provided once at bootstrap via an explicit
`setAudioDecodeContext(ctx)` before the first audio bundle loads. (Fallback if the parser is ever
wanted fully standalone: `AudioBuffer`s are context-portable per spec, so a dedicated decode context
is possible.)

### Bundle entries (`source/game/game.ts`)

Audio entries sit alongside the current asset entries, in the same bundles that already exist:

```ts
// `default` bundle (present on every screen, including the menu):
{name: 'ui-click',   sources: ['ui-click.ogg']},
{name: 'ui-key',     sources: ['ui-key.ogg']},
{name: 'ui-error',   sources: ['ui-error.ogg']},
{name: 'menu-music', sources: ['menu-music.ogg']},
// `game` bundle (loaded when a run starts, behind the loading screen):
{name: 'bump',       sources: ['bump.ogg']},
{name: 'game-music', sources: ['game-music.ogg']},
```

Retrieval is plain `Assets.get<AudioBuffer>(name)` at the call sites (§2, §4). This is *why* the
mixer takes `AudioBuffer`s, not names: the bundle system owns loading/caching/unloading; the mixer
stays a pure Web Audio primitive.

## 4. New engine hook — `UiRoot` focus events

To give focus-navigation and error sounds somewhere to attach, `UiRoot` gains a semantic focus-event
callback. It stays **audio-agnostic**: it emits the *event* (focus moved / navigation rejected); the
game maps the event to a *sound* (the design principle: primitives own semantics, not presentation).

```ts
type UiFocusEvent = {type: 'move'} | {type: 'reject'};
// UiRootOptions gains:  onFocusEvent?: (event: UiFocusEvent) => void
```

- **`'move'`** fires when `moveFocus` / `focusNext` / `focusPrevious` land focus on a **different**
  component than before (the change is detected against the prior `#focused`). Tap-driven silent
  focus (`#focusFromPointer`) does **not** fire it — a tap already plays a click via the widget, and
  a "focus moved" blip on every tap would double up.
- **`'reject'`** fires when a directional `moveFocus` finds no candidate in the requested direction
  (`#nearestInDirection` returns `null`) — arrow-key navigation hitting a wall. This is the clean,
  detectable "negative feedback" case. Widget-level rejects (activating a disabled control) are a
  named seam (§8) — the focus-nav reject is the one `UiRoot` can detect without new per-widget
  wiring.

**Plumbing** rides the same rails as `focusRing` today:
`GameScreenOptions.onFocusEvent → GameScreen.#onFocusEvent → new UiRoot({onFocusEvent})`
(`GameScreen.ts:107` already forwards `focusRing` this way). The game passes one shared callback to
every screen (§5) that calls `audio.play(clip, {bus: 'ui'})`.

## 5. Game wiring (`source/game/`)

Mirrors the input/camera wiring pattern file-for-file on the ECS side.

- **`game/audio.ts`** — constructs the `AudioMixer` with a `createContext: () => new AudioContext()`
  factory, then applies initial mute from `settings` via `audio.setMuted('master', !soundEnabled)`
  (§5.1); creates `playSoundChannel` (a module singleton — imported directly by SFX producers, like
  `wallHitChannel` today), builds `audioEntity` carrying `{mixer, channel}`, calls `mixer.unlock()`
  (guarded by `typeof window`), and calls `setAudioDecodeContext(mixer.context)` before any bundle
  loads. Exports `audio` (the mixer) for the UI/screen layer to use directly.
- **`game/world.ts`** — register `playSoundChannel` on the world (the unbounded-channel fix); add
  `audioSystem`; add `audioEntity`.
- **UI-sound wiring (game layer, engine widgets untouched):**
  - **Click / toggle** — the `game/widgets.ts` factories (`createButton`, and a `createToggle` if
    the Options toggle is built via a factory) play a `ui-click` clip and chain the caller's
    `onClick` / `onChange`. One central place, so no call site re-types it.
  - **Typing** — `TextInput`'s existing `onChange` (fires per keystroke) plays `ui-key`; `onEnter`
    plays an accept clip (may reuse `ui-click`).
  - **Focus move / error** — the shared `onFocusEvent` callback (§4): `move` reuses `ui-click`
    (no separate blip asset), `reject → ui-error`.
- **Gameplay SFX (ECS):** the existing `wallHitPopupSystem` pushes `PlaySound{name: 'bump'}` onto
  `playSoundChannel` on each wall hit, alongside the popup it already spawns — no separate
  audio-bridge system. `audioSystem` plays it on the `sfx` bus.
- **Music (screen context):** `mainMenuScreen.onShow` → `audio.playMusic(Assets.get('menu-music'))`;
  `gameScreen.onShow` → `audio.playMusic(Assets.get('game-music'))`. Hard-cut swap for v1; a
  gain-ramp crossfade is a named seam (§8). Music is **not** stopped on pause or on `onHide` in the
  demo: every screen sets its own track on show and `playMusic` replaces the current voice, so the
  menu track simply carries through the loading screen until `gameScreen` replaces it (no silent gap,
  no explicit stop). `stopMusic()` stays available for a game that wants deliberate silence.

### 5.1 Settings + persistence seam

`game/settings.ts` today holds `soundEnabled: boolean`, in-memory only. This cycle:

- Initial mute is applied at bootstrap through the same setter the toggle uses: `game/audio.ts`
  calls `audio.setMuted('master', !settings.soundEnabled)` right after constructing the mixer. One
  code path, not a separate constructor option.
- The Options toggle (main menu) continues to write `settings.soundEnabled`; its change handler
  calls `audio.setMuted('master', !soundEnabled)`.

**Deferred to T1.8a (validated storage), seam named.** Nothing persists across reload this cycle.
Because initial state is a plain `setMuted` call, T1.8a later only has to (a) hydrate `settings`
from validated storage on load and (b) write on change — **zero `AudioMixer` changes**. When the T2
slider widget lands, per-bus volume (`setVolume` plus a stored 0..1 level) is added alongside the
same `setMuted` path.

## 6. Assets

Two-ish placeholder categories in `public/`: UI clips (`ui-click`, `ui-key`, `ui-error`), a **bump**
SFX, and two **music** loops (`menu-music`, `game-music`). Sourcing preference: **CC0 /
public-domain first** (e.g. Kenney's audio packs) to avoid attribution burden; a small throwaway
synthesis script is the fallback if a suitable clip isn't found. Format `.ogg` (broad support, small).
Actual sourcing happens at implementation; the design only fixes the filenames, formats, and bundle
placement above.

## 7. Testing

Top-level `tests/`, one file per module, matching the suite.

- **`tests/AudioMixer.test.ts`** — against a hand-written fake `AudioContext` (records
  `createGain`/`createBufferSource`, connections, `start`/`stop`, `gain.value`, `resume`): the
  context is created lazily (not until first use); bus graph wiring (each bus → master →
  destination); `play` creates → connects to the named bus → starts a node; `playMusic` replaces the
  prior source; `stopMusic` stops it; `setMuted` sets the bus gain to 0 and unmute restores it to 1;
  a `setMuted` issued before first use applies once the graph is built; `unlock` resumes once and
  removes its listeners (idempotent).
- **`tests/audioSystem.test.ts`** — one `play` per drained `PlaySound` event, on the `sfx` bus;
  missing buffer → loud throw / skip; loud throw when the singleton entity is missing (mirrors
  `inputSystem`); the channel is drained once per world update.
- **`tests/UiRoot.test.ts`** (extend existing focus tests) — `onFocusEvent` fires `move` only when
  focus lands on a new component; a directional `moveFocus` with no candidate fires `reject`; a tap
  that silently moves focus fires neither.
- **`tests/audioBufferAsset.test.ts`** — the parser `test` matches audio extensions and rejects
  others; `load` decodes via the provided context (mock `decodeAudioData`) and caches under the
  asset name.
- **Manual demo pass (the real acceptance test):** bump on wall-hit (`sfx`); menu music on the main
  menu and a different track in-game (`music`); button clicks, toggle, typing, focus blips, and
  arrow-into-a-wall error all sound (`ui`); music continues through pause; no new gameplay SFX while
  paused; toggling **Sound off** (master mute) silences everything and toggling it on restores
  audio; nothing sounds before the first user gesture, everything after.

## 8. Out of scope (seams named)

- **Volume-slider UI + persistence** — sliders are a T2 widget; persistence is T1.8a. Per-bus
  `setVolume` (and its stored 0..1 level) is added when the slider lands; the bus graph and
  `setMuted` are already in place for it.
- **Music ducking / pause-on-pause** — per-game, wired in `pauseFlow`; music plays through pause by
  default.
- **Streaming music** (`MediaElementAudioSourceNode`) — for long tracks; buffer loops suffice now.
- **Music crossfade** — hard-cut for v1; a gain-ramp crossfade is trivial later given the gain
  nodes.
- **Per-play pitch/gain variation** — a future field on `PlaySound` / an options arg on `play`.
- **Widget-level reject sounds** (activating a disabled control) — the focus-nav reject is the
  detectable one now; a per-widget reject signal is a later `UiRoot`/widget hook.
- **Positional / spatial audio** — not needed for the target genres.
- **iOS quirks beyond first-gesture unlock** (silent switch, low-power mode) — known limitation.
- **World resources (T2.15)** — `AudioComponent` reads migrate to resource reads then.
