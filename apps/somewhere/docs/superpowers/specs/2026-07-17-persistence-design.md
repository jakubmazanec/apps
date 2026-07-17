# Persistence Design — One Validated localStorage Path for Settings and Saves

Implements engine-review proposal 8: T1.8a (schema-validated localStorage wrapper + persisted
settings; the proposal's version field is dropped — see scope decisions), plus the bespoke-save
start of T1.8b (a hand-written save blob with auto-save, manual save and a Continue button). Generic
world serialization stays out.

Scope decisions made during brainstorming:

- **Per-key stores, not one blob.** Each persisted concern (settings, save) gets its own
  localStorage key, schema and defaults from one generic engine class. Independent lifetimes;
  corruption of the frequently-rewritten save can never take the rarely-written settings down with
  it. The review doc's "one validated path" is one _code_ path (the class), not one key.
- **Saves are extraction-and-apply, not serialization.** Save reads a few values out of the live
  world; restore runs the normal New Game construction path and then applies those values. The world
  is always built by code; the save file only parameterizes it. Generic entity/system
  snapshot/restore is deferred with its blockers recorded (§7).
- **Both auto-save and manual save.** Auto-save on leaving the game screen and on tab-hide; an
  explicit Save button in the pause menu; Continue on the main menu when a save exists.
- **Durability deferred entirely.** No `navigator.storage.persist()`, no save export/import this
  branch; the Safari-ITP 7-day eviction caveat is accepted for now.
- **No versioning.** Payloads are stored raw — no version field, no envelope. The Zod schema is the
  only gate: any validation failure discards the payload and falls back to defaults. A breaking
  format change is just a schema change; old payloads fail validation and reset. No migration
  machinery until a real migration exists.
- **The engine imports zod directly.** Precedent: the `tiled-tools` schemas. The store's schema
  option is a real `z.ZodType`, not a structural stand-in.

## Context

- `game/settings.ts` is a plain mutable object, in-memory only, whose own comment promises this
  exact upgrade ("persist to localStorage: read here at module load, write on change"). Its two
  write sites are the Options modal's name input and sound toggle. Nothing in `source/` touches
  `localStorage` today; zod ^4.1.8 is in the tree.
- `gameScreen.onHide` is the single exit choke point: Quit-to-menu (and any future path away from
  the screen) lands there before `teardownGameScreen` stops the world.
- World coordinates are art pixels (the `pixelScale` transform lives on the root container), so a
  saved position is device-independent across per-device pixel scales.
- `World.addEntity` outside an update applies synchronously, so `playersQuery` is populated the
  moment `world.start()` returns — a restore step directly after it is safe.
- The main menu UI is built once in `onAdd` and persists across shows, so Continue's presence must
  be recomputed per show (quitting a run creates a save while the menu object lives on).
- Tests run under happy-dom, which provides a working `localStorage`.

## 1. Engine surface: `PersistedStore` (`source/engine/storage/PersistedStore.ts`)

```ts
export type PersistedStoreOptions<T> = {
  key: string;
  schema: z.ZodType<T>; // validates the stored value
  defaults: () => T; // factory: every failed load returns a fresh value
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
};

export class PersistedStore<T> {
  constructor(options: PersistedStoreOptions<T>);
  load(): T;
  save(value: T): void;
  clear(): void;
}
```

- `storage` defaults to `globalThis.localStorage`, resolved per call (tests inject an in-memory fake
  — the `AudioMixer` `createContext` injection pattern). In Node the global is undefined, so
  module-scope stores are SSR-safe: `load()` returns defaults, `save()`/`clear()` no-op.
- The on-disk shape is the JSON-serialized value itself — no envelope, no version field.
- **`load()`** is the hardened path from the review doc. In order: storage absent → defaults;
  `getItem` throws or returns `null` → defaults; `JSON.parse` throws → defaults; `schema.parse`
  throws → defaults. Discarding an _existing_ payload logs one `console.warn` naming the key and
  reason (corruption should be debuggable, never fatal); a missing key is a normal first run and
  logs nothing. `load()` never throws and never caches — each call re-reads storage (cheap, and the
  menu re-checks per show).
- **`save(value)`**: `setItem(key, JSON.stringify(value))` in try/catch; quota/private-mode failures
  are swallowed with a warn. Persistence is best-effort.
- **`clear()`**: `removeItem` in try/catch.

## 2. Settings persistence (`game/settings.ts`)

The module keeps its exact public contract — `settings` stays a plain mutable object and no consumer
changes:

```ts
const settingsStore = new PersistedStore({
  key: 'somewhere:settings',
  schema: z.object({playerName: z.string(), soundEnabled: z.boolean()}),
  defaults: () => ({playerName: '', soundEnabled: true}),
});

export const settings = settingsStore.load(); // hydration at module load

export function saveSettings(): void {
  settingsStore.save(settings);
}
```

`saveSettings()` is called at the two Options-modal write sites, right after each mutates
`settings`.

## 3. Save blob (`game/save.ts`)

```ts
const saveSchema = z.object({
  player: z.object({x: z.number(), y: z.number()}), // art px; finite-only under zod 4
});

export type SaveData = z.infer<typeof saveSchema>;

const saveStore = new PersistedStore<SaveData | null>({
  key: 'somewhere:save',
  schema: saveSchema.nullable(),
  defaults: () => null, // null = "no save exists" — drives Continue
});
```

Exports, all built on `playersQuery.getFirst().getComponent(MotionComponent)` (the `cameraSystem`
idiom):

- `loadSave(): SaveData | null` — pass-through to `saveStore.load()`; the menu's Continue check.
- `writeSave(): void` — captures the player's position into a `SaveData` and saves it. Works on a
  paused world (manual save happens under the pause modal).
- `stageContinue(): void` — stages `loadSave()`'s result in a module-level variable. Called by the
  Continue button before the screen swap.
- `clearStagedSave(): void` — drops the staged value. Called by New Game's click handler, which
  closes the edge where a failed Continue transition leaves a stale stage that a later New Game
  would wrongly apply.
- `applyStagedSave(): void` — if a stage is present, sets the player's position from it and clears
  the stage; otherwise a no-op. Called by `gameScreen.onShow` directly after `world.start()` (safe
  per Context). The camera needs nothing: `cameraSystem` re-centers on the player every frame.

A hand-edited save can place the player out of bounds or inside a wall; accepted — the schema
guarantees finite numbers, the camera clamps to the map, and the worst case is walking back out. A
spawn-area clamp can come later if maps gain authority on spawnable positions.

## 4. Save triggers and UI

- **Auto-save on exit** — `gameScreen.onHide` calls `writeSave()` _before_ `teardownGameScreen` (the
  world must still be alive; `world.stop()` resets the pools, which resets the position). This one
  choke point covers Quit-to-menu and any future exit path.
- **Auto-save on tab-hide** — a `document` `visibilitychange` listener, registered in `onShow` and
  removed in `onHide` (a `DisposableStack` in screen state, the `AudioMixer.unlock` pattern): when
  `visibilityState === 'hidden'`, call `writeSave()`. This is the last reliable lifecycle moment on
  mobile and covers tab close, tab switch and app backgrounding; firing while the pause modal is
  open is fine (capture works on a paused world).
- **Manual save** — a Save button in the pause modal between Resume and Quit. Click: `writeSave()`,
  then flip the button's `Text` child to `Saved` as feedback (the reference is kept at construction,
  the `hitCounter` idiom; the modal is rebuilt per open, so it resets naturally).
- **Continue** — a Continue button first in the main-menu panel, above New Game, created in `onAdd`
  and kept in screen state; each `onShow` adds or removes it from the banner panel according to
  `loadSave() !== null` (removal also drops it from the focus order). Click: `stageContinue()`, then
  `game.showScreen(gameScreen)` with the same `.catch` as New Game.
- **New Game** — click handler gains a leading `clearStagedSave()`. With an existing save, New Game
  simply starts fresh and the old save is overwritten by the next auto-save; no confirm dialog this
  branch (noted as a possible future nicety).

## 5. Error handling

One rule: persistence failures never affect gameplay. Load failures degrade to defaults (settings)
or "no save" (Continue hidden); write failures lose persistence silently while the game plays on.
The only observable artifact is a `console.warn`. Nothing in the store, settings or save paths can
throw into the game loop or a screen transition.

## 6. Testing

New `tests/PersistedStore.test.ts` (engine), with an injected Map-backed fake storage:

- Missing key → defaults, no warn. Corrupt JSON, schema-rejected data → defaults, one warn each.
- Valid roundtrip; `defaults` is a factory (two failed loads return distinct objects).
- `setItem` throwing (quota) is swallowed with a warn; `clear()` removes the key.
- No `storage` option and no global (simulated) → `load()` defaults, `save()`/`clear()` no-op.

Game-side tests (against happy-dom's real `localStorage`, seeding/clearing keys per test):

- `game/save.ts`: `writeSave` writes the schema-valid payload from a real `World` carrying a player
  entity (`PlayerComponent` + `MotionComponent` only — the query doesn't require
  `GraphicsComponent`, so no pixi); `stageContinue` → `applyStagedSave` restores the position and
  consumes the stage; `clearStagedSave` prevents a later apply; `applyStagedSave` without a stage is
  a no-op.
- `game/settings.ts`: `saveSettings` writes the current object; a seeded valid payload hydrates
  `settings` at module load (dynamic import after seeding).

Verification: `npm run typecheck`, `npm run lint`, `npm test`.

## 7. Deferred: generic entity/system serialization

Recorded so the next brainstorm starts from the blockers, all structural in today's ECS:

- `Entity` has no id — identity is the object reference; a serializer needs stable ids to encode
  references.
- Components hold live object graphs (`MotionComponent.target`, `WallHit`'s entity refs,
  `contactTile`) — needs an id-based reference encoding and a rehydration order.
- Components hold live pixi objects (`GraphicsComponent` constructs an `AnimatedSprite`) — needs a
  convention separating simulation state from derived render state that is rebuilt, never saved.
- `defineComponent` is `Object.assign` with no schema — nothing machine-readable says which fields
  exist, let alone which persist.

Systems are code, not state; they are never serialized under any design. The trigger that would
justify the redesign: needing to persist dynamically created entities with inter-entity references
(e.g. dropped items pointing at owners). Until then the extraction blob scales: each new fact
(flags, inventory, current map) is a schema field; an old save that fails the new schema simply
resets to defaults.

Also deferred: `navigator.storage.persist()`, save export/import, save slots, migrations, a New Game
overwrite confirmation.

## Open decisions

None.
