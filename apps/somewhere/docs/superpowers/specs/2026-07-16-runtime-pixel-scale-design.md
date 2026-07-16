# Runtime pixel scale (T1.5)

Replaces the baked ×4 asset upscale with a render-time system. Assets are authored at true 1× art-pixel scale and world coordinates become art px, identical on every device: a tile is 16 world units everywhere. The engine applies an integer `pixelScale`, chosen per device at startup, as a single scale transform on the root view. NEAREST scaling at integer `pixelScale` renders pixel-identical chunkiness to the old baked assets and texture memory drops 16×.

Scope: T1.5 alone. Camera (T1.4) and render layers (T1.6) are separate specs; a camera composes naturally as a container transform inside the scaled root.

## 1. `pixelScale` lifecycle

- The chooser is a pure function `({width, height}) => integer` taking the viewport size in device px (`window.innerWidth × devicePixelRatio`, `window.innerHeight × devicePixelRatio`). The canvas has no real size until the DOM ref attaches, long after `init()`; the viewport is available immediately and cannot be 0-sized the way a hidden container can. Engine default policy: `clamp(round(height / 270), 2, 8)`; 270 art px of vertical world reproduces the current ×4 feel on a 1080p DPR-1 screen.
- Overridable via a new optional `GameOptions.choosePixelScale` field with a named `ChoosePixelScale` type, mirroring `focusKeys?: FocusKeys`. A custom chooser's output is validated at startup: an integer ≥ 1, otherwise throw.
- `Game` runs the chooser exactly once, at the top of `init()`. The result is exposed as readonly `game.pixelScale`, a getter over `#pixelScale` that throws while unset, matching the engine's fail-loud accessors (`GameScreen.game`, `System.world`).
- The value is fixed per session. Later resizes and DPR changes do not re-run the chooser; apparent size drifts until reload. Re-choosing would be display-only under this design (the transform never changes world distances), but live re-choosing stays out of scope.
- Game code rarely reads the value: the world is authored in art px and the engine applies the scale. The one game-code consumer is the camera snap (section 3).

## 2. Rendering: the scaled root

- `Game.view` gets `scale.set(pixelScale)` in the same post-`app.init` block that already attaches and configures it. Everything inside the root (screens, world, UI) operates in art px; device px exists only outside it.
- The root's layout style pins `transformOrigin: 0`: `@pixi/layout` composes a layout-managed container's transform about its `transformOrigin` (default `'50%'`), which would shift the whole scaled scene by (1 − `pixelScale`)/2 of the box. Later width/height-only layout assignments merge onto the style and keep it. The trap exists only where scale and layout meet on one container; `game.view` is the only such container.
- `handleResize` keeps its canvas work in device px (CSS style size, `renderer.resize` to CSS×DPR) and converts the two values that live in the view's local space to art px: `view.layout` width/height and the `view.hitArea` rectangle become device size ÷ `pixelScale`. Screens therefore lay out against art-px viewport dimensions.
- The renderer stays at `resolution: 1` with `roundPixels: true`. `roundPixels` snaps rendered positions to whole device px, so an entity at a fractional art position still draws as clean `pixelScale`-sized blocks; movement granularity is 1/`pixelScale` art px = 1 device px, exactly today's.
- Textures load at 1× with no resolution manipulation anywhere. The global `scaleMode: 'nearest'` (set before any load starts) covers bundle art and bitmap-font pages: `.fnt` loading passes empty texture options and inherits the default (verified in the pixi.js 8.16.0 source).
- Nine-slice: per-frame `borders` in the atlas JSON are art px and pass through raw to `texture.defaultBorders` (pixi divides frame rects by resolution, which stays 1, and never touches borders), so `NineSliceGeometry` is correct with no normalization. `defaultAnchor` is a normalized fraction and needs no adjustment.
- Guardrails: sheet sources must keep resolution 1. Atlas filenames never use the `@Nx` suffix and sheet JSONs carry no `meta.scale` other than `"1"`; `Tileset.from`'s internal `meta: {scale: '1'}` resolves to resolution 1 and stays as is.
- Fonts: the `.fnt` files are un-baked to native `size=12` metrics with 1× page PNGs, and all text uses `fontSize` 12 in art px. Under the root transform glyph texels render as `pixelScale`-px blocks, an exact NEAREST upscale at integer scale. Font sizes must be native × 2^k (12, 24, …): a sub-native size puts glyph detail on a fractional art-px grid that renders unevenly at odd `pixelScale` — the un-baked pages have no ×4 block margin left to absorb the half-texel phase.
- Filters and render textures run in screen space at device resolution and are unaffected; anything that must not scale attaches outside `game.view`.

## 3. World quantities and input

- Tiled assets need no scaling at all: the raw 16px JSON values are art px. `Tileset.from`, `Tilemap.from` and `Map` are unchanged in signature and behavior; `Map`, `motionSystem` and `cameraSystem` consume art px.
- Game-code constants become plain art-px literals, no multiplies and no new imports:

| Site | Today (device px) | Becomes (art px) |
|---|---|---|
| `motionSystem` `MAX_SPEED` | 4 | 1 |
| `motionSystem` snap threshold (two occurrences) | 0.1 | 0.025 |
| `playerPool` spawn | 64·9, 64·10 | 16·9, 16·10 |
| `playerPool` boundingBox | (0, 40, 64, 40) | (0, 10, 16, 10) |
| `playerSystem` tap offsets | −32, −60 | −8, −15 |
| `wallHitPopupSystem` spark size / rise | 16 / 24 | 4 / 6 |

- `MAX_DELTA_TIME` is time, not space: untouched.
- Input: `Input` latches `event.getLocalPosition(view)` instead of `event.global`, so `tapPosition` is view-local art px (its doc comment updates). `playerSystem`'s camera-relative tap math keeps its shape.
- `cameraSystem`: viewport dimensions become `game.app.canvas.width / game.pixelScale` (likewise height), and the `Math.floor` snap becomes snap-to-device-px, `Math.floor(value × pixelScale) / pixelScale`; whole-art-px snapping would make scrolling visibly steppier at scale > 1 than today's 1-device-px granularity. This is the one game-code read of `game.pixelScale`.
- The migration includes a grep audit of `game/` and the UI screens for leftover ×4-era magic pixel numbers.

## 4. UI assets as a Spritesheet

- One `ui` atlas (PNG + JSON, authored at 1× art px) replaces the standalone UI PNGs: button ×4, toggle ×6, text-input ×3, focus-ring and banner. Nine-slice geometry lives in the JSON as per-frame `borders` in art px, including the focus-ring frame; they are used directly (section 2). Toggle frames are plain sprites, no borders.
- Deleted from `widgets.ts`: `BUTTON_SLICE`, `BUTTON_ACTIVE_SLICE`, `BANNER_SLICE`, `INPUT_SLICE` and the whole `FOCUS_RING` const; a resolved texture cannot live in a module-level const (import-time race against asset loading), so each screen builds its focus-ring options where used. `NineSliceSprite` construction passes no insets; it reads `texture.defaultBorders`.
- Dropped: the unused `banner-hover`/`banner-active` bundle aliases.
- Behavioral and layout values become plain art-px literals: `pressOffset` 4 → 1, focus-ring `padding` 8 → 2, caret width 1, the `@pixi/layout` spacing (`padding` 32 → 8 and 8 → 2, `gap` 16 → 4 and 12 → 3, `minWidth` 220 → 55) and `fontSize` 48 → 12 and 24 → 6 at every site: `createButton`'s default plus the explicit sites in `gameScreen`, `mainMenuScreen` and `loadingScreen`. All current values are ×4 multiples.
- Consumers: `widgets.ts` `nineSlice()` drops its slice argument and fetches `Assets.get<Spritesheet>('ui').textures[name]`; its call sites update in `mainMenuScreen` (three text-input, two banner) and `gameScreen` (banner), as do `mainMenuScreen` `toggleSprite()` and `gameScreen`'s focus-ring and button usage; `game.ts`'s default bundle collapses the UI PNG entries to one `ui` entry. `UiRoot`'s `FocusRingOptions` takes a resolved `texture` instead of `assetName` and drops its four inset fields; the ring construction reads `texture.defaultBorders`. This removes the one engine↔alias coupling. Engine widget classes (`Button`, `Toggle`, `TextInput`, `Panel`, `Modal`) need no change; they already take pre-built containers.
- Tests: `UiRoot.test.ts`'s focus-ring fixture swaps `assetName` for a `texture`; `Modal.test.ts`'s asset mock likely needs no change; widget unit tests are unaffected. `playerSystem.test.ts` tap-offset expectations recompute for the new constants (the `MAX_SPEED` velocity asserts reference the symbol and track automatically); `motionSystem.test.ts` snap-threshold expectations update; `Input.test.ts` updates for view-local latching. `Tileset.test.ts`, `Tilemap.test.ts` and `Map.test.ts` are untouched: raw values pass through unchanged.

## 5. Asset generation and migration

- Generator: `scripts/generate-ui-atlas.mjs` reuses the archived per-widget render code from `$/scripts-2026-07-02/` at `BLOCK = 1`, blits all rendered variants plus the decoded 1× banner into one sheet and writes `public/ui.png` and `public/ui.json` (frames + borders, no `meta.scale`). Hand-made source art (the three 1× banners, palette reference for the generators) lives in `scripts/assets/`; `public/` contains only shipped assets.
- Dependency: `fast-png` as a devDependency (maintained, image-js org; the archived generators already target it). It provides the PNG decode the migration needs and the encode the generators use.
- Spark: the archived generator writes only a PNG with Node built-ins; it is rewritten on `fast-png` at 4×4 art px (`SIZE = 4`) to emit `spark.png` plus `spark.json`, preserving the on-screen size.
- Fonts: `$/public_1x` already holds a finished 1× un-bake of `monogram` (`size=12` metrics, 256² page); the audit verifies it and the migration reuses it. Whatever it lacks (the outline font) is produced by `$/scripts-2026-07-02/scale-fnt.mjs`, which already handles fractional factors; run at `0.25`. The rest of `$/public_1x` is a stale 4× bake and is ignored.
- One-off migration scripts in `scripts/`, in this order:
  1. Backup first, mandatory: full copy of `public/` to a directory outside the repo; the migration aborts before touching anything if the backup fails. Git already tracks `public/`, so git is the primary rollback; the copy must not land in git or the Docker build context.
  2. Audit: verify every baked PNG is exact uniform 4×4 blocks across all channels, alpha included; abort loudly on any violation.
  3. Downscale ÷4 (nearest, lossless given the audit): `tileset.png`, `banner*.png` (then moved to `scripts/assets/`), font page PNGs, `character` page PNG.
  4. Numeric ÷4 with a divisibility guard that aborts on any non-multiple: `map.json` and `tileset.json` pixel fields and collision rects (`map.json` `width`/`height` are tile counts and stay; layer GID data untouched); `character.json` frame rects; `.fnt` metrics via `scale-fnt.mjs` at `0.25` with the same guard.
  5. Run `generate-ui-atlas.mjs` and the spark generator; delete the replaced standalone UI PNGs from `public/`.
- Deliberate visual changes, all flagged: the caret goes from 2 device px to 1 art px (grid-consistent, slightly thicker at ×4); the spark loses its sub-art-pixel detail and becomes a 4×4-art-px diamond of the same on-screen size; UI layout positions and widget widths quantize to whole art px (yoga rounds in the layout's own units), so centered content with odd parent-minus-child parity sits half an art px from its pre-migration device-px position and content-sized widget edges land within half an art px of theirs. The pre-migration coordinates are generally not representable on the art grid; the offsets are static, per-layout constants with no jitter.

## 6. Testing and acceptance

- Unit: chooser policy (sizes → clamped integers; custom chooser output validated); fail-loud `pixelScale` access before init; `Input` view-local tap latching; `handleResize` art-px `view.layout`/`hitArea` math; the migration guards (block audit, divisibility).
- Spike, pinned early in the plan, proving on screen what code reading cannot: NEAREST blockiness on sheet pages and font pages at scale > 1 (today's 1:1 rendering has never exercised the filter), nine-slice corners rendering at border × scale, and clean `pixelScale`-sized blocks under `roundPixels` for entities at fractional art positions.
- Acceptance, as a manual visual check (the repo has no screenshot-diff infra): at `pixelScale` 4 and DPR 1 the demo renders pixel-identical to pre-migration except the flagged deliberate changes (section 5); a scale sweep via chooser override (2/3/5/8) checks smooth movement, no blur, aligned collision, legible UI and stable UI proportions. Existing suite stays green after the enumerated test updates.

## Non-goals

- Live re-choosing of `pixelScale` on resize or DPR change (display-only under this design, still out of scope for T1.5).
- A separate UI scale knob; world and UI share the one `pixelScale`.
- Scaling post-processing: filters and render textures stay at device resolution.

## Open decisions

None.
