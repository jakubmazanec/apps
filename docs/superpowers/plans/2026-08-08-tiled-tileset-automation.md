# Tiled Tileset Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `assets/tileset.tsx` the source of truth for tilesets, generate `public/tileset.json` and `public/tileset.png` from it with automatic collision boxes and animations that coexist with hand editing in Tiled, and teach the engine to honor per-frame animation durations.

**Architecture:** A pure-Node TypeScript pipeline in `apps/somewhere/tools/` parses the Tiled `.tsx` into a lossless XML tree, decides per tile what automation applies (a precedence chain over tile properties, existing objects, config id-ranges, tile classes and a default), reconciles auto-owned data into the tree in place, and serializes the tree back to `.tsx` and to Tiled-shaped JSON. A separate `analyze` phase may read maps and the image to *propose* durable config, but the build phase reads only the tileset, its image and the config.

**Tech Stack:** TypeScript (Node 24, ESM, `moduleResolution: node16`), Zod 4 (shape gate only), `fast-xml-parser` 5 (reading XML), `fast-png` 8 (decoding the atlas), `node:util` `parseArgs` (CLI), `tsx` (runner), Vitest 4 (tests), Pixi 8 (engine).

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied from the spec or verified against the working tree on 2026-08-08.

- **App root is `apps/somewhere/`.** Every path in `tilesets.config.json` is relative to it and must resolve inside it. Absolute paths and `..` segments are rejected by the schema, and the resolved path is asserted to stay under the app root.
- **Tooling lives in `apps/somewhere/tools/`**, TypeScript, covered by typecheck and lint.
- **`erasableSyntaxOnly: true`** — no enums, no parameter properties, no namespaces. Use string-union types.
- **Dependency direction is one-way.** `tools/` may import `source/tiled-tools/`; nothing in `source/` may import `tools/`. `tools/` must **never** import from `source/engine/` — it uses `import.meta.env.DEV` and throws outside a bundler.
- **Zod is a shape gate only.** It cannot express cross-field invariants: out-of-range tile ids, negative box dimensions and `columns`/`tilecount` mismatches all parse as valid. Those are explicit checks in `reconcile.ts`. Parsing also injects defaults and drops unknown keys, which is why the reconciler mutates the raw parsed tree and never round-trips through Zod.
- **Never hand-edit Carson-generated files.** These carry a `DO NOT EDIT` header and `strategy: overwrite`; the root `prepare` script runs `carson update workspace` on every install, and both PR workflows fail on a dirty tree straight after `npm ci`:
  `tsconfig.json`, `tsconfig.typecheck.json`, `eslint.config.js`, `vite.config.ts`, `.prettierignore`, `prettier.config.cjs`, `tests/tsconfig.json`, `.github/workflows/*`.
  Change them only through `.carson/project.json` `overrides` (available hooks, verified in the template: `eslintConfig`, `packageJson`, `reactRouterConfig`, `tsconfig`, `viteConfig`) followed by `npx carson update workspace`.
- **`package.json` is `strategy: merge`**, so a *new* script key added by hand survives regeneration (this is how `export-assets` survives). Modifying a script the template *owns* (`typecheck`, `test`, `lint`, `build`, `format`, …) must go through `overrides.packageJson.scripts` instead.
- **`lodash.merge` merges arrays by index**, so an `overrides.tsconfig.include` array replaces entries rather than appending. Do not try to add `tools/**` to an existing include array that way.
- **Exactly one new dependency:** `fast-xml-parser` (latest is `5.10.1`) as a devDependency of `apps/somewhere`. This is the only approved `package-lock.json` change (approved 2026-08-08). `fast-png@8` is already an app devDependency; `prettier@3` is already an app devDependency; `tsx` is a root devDependency resolved by workspace hoisting. `npm ls tsx` reports `tsx@4.20.5 invalid: "^4.23.1"` — pre-existing drift, do not "fix" it.
- **Tests live flat in `apps/somewhere/tests/`.** The vitest node project is named `unit`, include glob `tests/**/*.test.?(c|m)[jt]s?(x)`, exclude `tests/**/*.browser.test.*`. A test colocated under `tools/` would silently not run. Coverage is scoped to `source/**`, so `tools/` reports none.
- **CI's only gate is `npm test`** (turbo `test` depends on `typecheck` and `lint`). The `--check` gate runs as a vitest test, never as a workflow step, and must stay write-free.
- **Line endings.** `assets/tileset.tsx` is CRLF on disk **and in the committed blob** (`core.autocrlf=false`, no `.gitattributes`), so a fresh Linux clone gets CRLF too. `public/tileset.json` is LF. Both writers must preserve their file's own newline.
- **Exit codes:** `0` clean, `1` drift (`--check` only), `2` hard error, with `2` winning when both occur.
- **Code style** (enforced by `@jakubmazanec/eslint-config` + prettier): `let` not `const`, single quotes, semicolons, trailing commas, `bracketSpacing: false` (`{a, b}`), `printWidth: 100`, blank line after the import block, before `return`, and around `const`/`let` and `if` statements.
- **The core invariant** (state it as a post-condition on the tile, not a rule about what gets emitted):
  > After reconciliation, a tile carries exactly the auto-owned data the resolved rules say it should. Every auto-owned object or animation not in that set is deleted. Non-auto data is untouched.

---

## Verified facts and corrections to the spec

These were measured against the working tree while writing this plan. Where they contradict the spec, **this plan is the one that was measured**.

1. **The collision ground-truth table in the spec is exactly right.** Re-measured all eight authored tiles with `solidAlphaThreshold: 255` and the `#ff00cc` colour key: 64, 66, 128, 129, 130, 192, 194 reproduce identically; 193 comes out `h:7` where the author wrote `h:8`. At threshold 1, tiles 130 and 194 come out `w:16` instead of `w:14` — the shadow column on the right edge, confirming the shadow exclusion independently.
2. **Alpha profile:** the atlas has **four** alpha levels, not two — `0` (890 349 px), `76` (209 px), `102` (1 686 px), `255` (156 332 px). The spec says "one non-opaque level, `rgba(0, 0, 0, 102)`". There are two non-opaque non-zero levels. The decision (`solidAlphaThreshold: 255`) is unaffected; the `analyze` image profile must report all four.
3. **Tile inventory:** 3 094 empty, 187 fully solid, **815** partial (the spec says 805).
4. **Band-restricted footprint span:** at `footprintMaxHeight: 8`, **51** tiles differ from the whole-tile-span variant (the spec says 47). Tile 1281 verified: band-restricted `{x:0, y:8, w:5, h:8}` versus whole-tile-span `{x:0, y:8, w:16, h:8}` — 11 px of phantom collision exactly where the player walks.
5. **`transparentcolor` matches zero pixels** in the real atlas (confirmed: 0 pixels are `#ff00cc`), so its handling needs a synthetic fixture and cannot ride on the integration test.
6. **`assets/tileset.png` and `public/tileset.png` are byte-identical** (sha256 prefix `764efe8bf895bed6`).
7. **`vite.config.ts` DOES have an override hook** (`overrides.viteConfig`, merged with `lodash.merge` at `vite.config.ts.ejs:77`). The spec says it does not. The decision is unchanged — `tilesets.config.json` still belongs at the app root, because `public/` is copied verbatim into the build and served — but do not repeat the false claim.
8. **`JSON.stringify(value, null, 2)` is not prettier-stable for `tilesets.config.json`.** Verified: prettier collapses `"range": [\n 128,\n 194\n ]` to `"range": [128, 194]`. Since the config sits at the app root and is not prettier-ignored, `analyze` must format it through prettier before writing (see Deviations).
9. **`npm run format` in `apps/somewhere` already fails** on `assets/tileset.tsx`: prettier picks the TypeScript-JSX parser for `.tsx` and errors with `SyntaxError: Expression expected. (1:1)`. This is pre-existing (the file has been on disk all along; prettier never read `.gitignore`) and out of scope. **Do not "fix" it by reformatting the asset** — and note that it also means prettier can never corrupt the byte-identical round-trip.
10. **Pixi's duration path is confirmed** (`node_modules/pixi.js/lib/scene/sprite-animated/AnimatedSprite.mjs`): `elapsed = animationSpeed * deltaTime; lag += elapsed / 60 * 1e3`. With the default `animationSpeed` of 1, `deltaTime: 6` is exactly 100 ms. `set textures` switches to the duration path when `value[0]` is not a `Texture`, reading `{texture, time}`.
11. **Known gap the invariant does not close.** The spec lists "a tileset dropped from the config" among the cases the core invariant handles. It does not: if a tileset entry is deleted, nothing runs on that `.tsx` and its auto-owned data survives forever, and its artifacts are orphaned in `public/`. Removing a tileset therefore means "resolve every rule to `none`, run `sync-tilesets`, *then* delete the entry". Documented in Task 13's `--report` help text; no code handles it.

## Deviations from the spec

Flagged so they can be vetoed before implementation starts.

1. **No `tools/tiled-pipeline/serialize.ts`.** `formatTsx` lives in `tsx.ts` next to `parseTsx`; `formatJson` lives in `json.ts`. A module that re-exports two one-line functions is exactly the indirection YAGNI/DRY forbids. The spec's stated reason for the module — "kept out of the CLI so idempotence is testable at a byte seam" — is satisfied either way, and the idempotence test in Task 12 imports both directly.
2. **Two modules the spec's code layout omits but its behaviour requires:** `tiled-pipeline/compute.ts` (the compute/write split and drift detection, imported by both the CLI and the CI gate test) and `tiled-pipeline/analyze.ts` (the report and proposals, so the CLI stays thin enough to be worth not testing).
3. **`analyze` imports `prettier`** (already an app devDependency) to write `tilesets.config.json`. See correction 8. Nothing on the build path imports prettier.
4. **`tsx.ts` exports a generic `parseXmlDocument`** reused by `evidence/map.ts` for `.tmx`, rather than a second XML reader.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `apps/somewhere/tools/tsconfig.json` | TS project for `tools/`; `moduleResolution: node16` |
| `apps/somewhere/tools/sync-tilesets.ts` | CLI entry: `parseArgs`, file I/O, atomic writes, exit codes, interactive prompts |
| `apps/somewhere/tools/tiled-pipeline/tsx.ts` | Lossless XML document model; `parseXmlDocument`, `parseTsx`, `formatTsx`, attribute/child helpers |
| `apps/somewhere/tools/tiled-pipeline/json.ts` | `.tsx` tree → Tiled JSON value; `formatJson` (sorted keys, `\n`) |
| `apps/somewhere/tools/tiled-pipeline/config.ts` | Zod schema for `tilesets.config.json`; path-containment check; loader |
| `apps/somewhere/tools/tiled-pipeline/pixels.ts` | PNG IHDR bound, decode, grid recompute, tile slicing, solid classification, alpha profile |
| `apps/somewhere/tools/tiled-pipeline/collision.ts` | Solid mask → one box, per shape mode |
| `apps/somewhere/tools/tiled-pipeline/animation.ts` | Region specs → `animation` frames; region validation |
| `apps/somewhere/tools/tiled-pipeline/resolve.ts` | The per-tile precedence chain |
| `apps/somewhere/tools/tiled-pipeline/reconcile.ts` | The merge: the core invariant, stable object ids, pruning, cross-field hard errors |
| `apps/somewhere/tools/tiled-pipeline/compute.ts` | Per-tileset compute, all-or-nothing batching, drift detection |
| `apps/somewhere/tools/tiled-pipeline/analyze.ts` | Image profile, inventory, candidates, proposals, report formatting, config fragments |
| `apps/somewhere/tools/tiled-pipeline/propose.ts` | The animation detector (similarity + recolour rejection) |
| `apps/somewhere/tools/tiled-pipeline/evidence/map.ts` | Analysis-only: scan configured `.tmx` maps for tile usage by layer class |
| `apps/somewhere/tilesets.config.json` | The one config for all tilesets |
| `apps/somewhere/tests/tiledTsx.test.ts` … | One test file per module (named in each task) |

**Modified:** `apps/somewhere/source/engine/tiled/Tileset.ts`, `apps/somewhere/source/engine/tiled/Map.ts`, `apps/somewhere/tests/Map.test.ts`, `apps/somewhere/tests/Tileset.test.ts`, `apps/somewhere/assets/tileset.tsx`, `apps/somewhere/scripts/export-assets.mjs`, `apps/somewhere/package.json`, `apps/somewhere/.carson/project.json`.

---

## Task 1: Engine — honor per-frame animation durations

Independently shippable; it cannot regress anything today, because no tile carries an animation and the map's `animations` layer is empty, so the existing tests are necessarily synthetic.

**Files:**
- Modify: `apps/somewhere/source/engine/tiled/Tileset.ts:7-11` (the `TilesetTile` type), `:48-70` (the animation collection loop), `:94-104` (tile construction)
- Modify: `apps/somewhere/source/engine/tiled/Map.ts:88-102`
- Test: `apps/somewhere/tests/Tileset.test.ts`, `apps/somewhere/tests/Map.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TilesetTile` gains `frameDurations?: number[]` — a **sibling** of `textures`, not a change to its type. `TilesetTile.textures: Texture[]` is constructed literally at nine sites across `tests/Map.test.ts`, `tests/Tileset.test.ts` and `tests/mapSign.browser.test.ts:135-139`; a sibling field breaks none of them, a type change breaks all of them. `Spritesheet`'s `animations` is `Dict<string[]>` and cannot carry durations, so they travel alongside and are zipped in at the `AnimatedSprite` construction site.

- [ ] **Step 1: Write the failing test**

Add to `apps/somewhere/tests/Tileset.test.ts`, inside the existing `describe('Tileset.from', …)` block, after the `'an animated tile gets one texture per animation frame'` test:

```ts
  test('an animated tile keeps its per-frame durations; a static tile has none', async () => {
    stubImage();

    let tileset = await Tileset.from(createTiledTileset());

    expect(tileset.getTile(1).frameDurations).toStrictEqual([100, 100]);
    expect(tileset.getTile(0).frameDurations).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npx vitest run --project unit tests/Tileset.test.ts
```

Expected: FAIL — `Property 'frameDurations' does not exist on type 'TilesetTile'`.

- [ ] **Step 3: Add `frameDurations` to `TilesetTile` and populate it**

In `source/engine/tiled/Tileset.ts`, extend the type:

```ts
export type TilesetTile = {
  id: TileId;
  textures: Texture[];
  frameDurations?: number[]; // parallel to textures; absent on static tiles
  collisionBoxes: Rectangle[]; // empty = no collision
};
```

Collect the durations in the same loop that builds `animations` (replacing lines 66-70):

```ts
    let frameDurations: Record<number, number[]> = {};

    for (let tiledTile of tiledTileset.tiles ?? []) {
      if (tiledTile.animation) {
        animations[tiledTile.id] = tiledTile.animation.map((animation) => `${animation.tileid}`);
        frameDurations[tiledTile.id] = tiledTile.animation.map((animation) => animation.duration);
      }
    }
```

And attach them where the animated textures are attached (replacing lines 99-104):

```ts
      let textures = spritesheet.animations[i];
      let durations = frameDurations[i];

      if (textures) {
        tile.textures = textures;
      }

      if (durations) {
        tile.frameDurations = durations;
      }

      tiles.push(tile);
```

The two `if`s stay separate rather than nesting: `exactOptionalPropertyTypes: true` forbids assigning a possibly-`undefined` value to an optional property, so the guard is what narrows it.

- [ ] **Step 4: Run the test to verify it passes**

```powershell
npx vitest run --project unit tests/Tileset.test.ts
```

Expected: PASS, all five tests.

- [ ] **Step 5: Write the failing Map test**

`tests/Map.test.ts` currently encodes the 0.15 arithmetic in a comment at `:26-27` and in the assertions at `:127-144`. With `animationSpeed` gone and durations absent, the default speed of 1 makes `tick(7)` advance 7 frames of a 3-frame loop — which lands on the same frame indices, so the old assertions would pass for the wrong reason. Replace them with a test that actually exercises the duration path.

Replace lines 26-28 of `tests/Map.test.ts`:

```ts
// Three-frame animation at 100 ms per frame. Pixi converts a ticker delta to
// milliseconds as `animationSpeed * deltaTime / 60 * 1000`, so at the default
// animationSpeed of 1 a deltaTime of 6 is exactly one frame.
const FRAMES = [pixi.Texture.WHITE, pixi.Texture.WHITE, pixi.Texture.WHITE];
const FRAME_DURATIONS = [100, 100, 100];
```

In `stubAssets()`, give the animated tile its durations (replacing line 45):

```ts
      {id: toTileId(1), textures: FRAMES, frameDurations: FRAME_DURATIONS, collisionBoxes: []},
```

Replace the body of the `'update() advances animated tiles; without it they hold, then resume'` test (lines 127-144) with:

```ts
  test('update() advances animated tiles on their authored durations', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});
    let animated = map.layers[0]!.tiles[0]![1]!.view.children[0] as pixi.AnimatedSprite;

    expect(animated.currentFrame).toBe(0);

    // 6 deltaTime = 100 ms = exactly one authored frame.
    map.update(tick(6));

    expect(animated.currentFrame).toBe(1);

    // Holds between driven updates; the next driven update resumes from the
    // held frame.
    map.update(tick(6));

    expect(animated.currentFrame).toBe(2);
  });

  test('the engine does not scale authored durations by an animationSpeed', () => {
    stubAssets();

    let map = new Map({assetName: 'map'});
    let animated = map.layers[0]!.tiles[0]![1]!.view.children[0] as pixi.AnimatedSprite;

    expect(animated.animationSpeed).toBe(1);
  });
```

- [ ] **Step 6: Run the test to verify it fails**

```powershell
npx vitest run --project unit tests/Map.test.ts
```

Expected: FAIL — `expected 0.15 to be 1` on the second new test (and the first still passing for the wrong reason, which is exactly why the second exists).

- [ ] **Step 7: Build `FrameObject`s in Map and delete `animationSpeed`**

In `source/engine/tiled/Map.ts`, replace lines 90-101 (the `else` branch):

```ts
          } else {
            // Off Pixi's shared clock: mapSystem drives these via map.update()
            // on the world's update path, so a paused world freezes them by
            // construction (game UI design §3). animationSpeed is deliberately
            // left at 1: Pixi scales the duration path by it
            // (`lag += animationSpeed * deltaTime / 60 * 1e3`), so any other
            // value would play every authored duration at the wrong rate.
            let frames =
              tilesetTile.frameDurations ?
                tilesetTile.textures.map((texture, frameIndex) => ({
                  texture,
                  time: tilesetTile.frameDurations![frameIndex]!,
                }))
              : tilesetTile.textures;
            let animatedSprite = new pixi.AnimatedSprite(frames, false);

            animatedSprite.play();

            this.#animatedSprites.push(animatedSprite);
            sprite = animatedSprite;
          }
```

The `!` on `frameDurations` inside the callback is needed because TypeScript does not narrow a property access across a closure boundary. The ternary indentation is prettier's `experimentalTernaries` style; run `npx prettier --write source/engine/tiled/Map.ts` if it disagrees.

- [ ] **Step 8: Run the tests to verify they pass**

```powershell
npx vitest run --project unit tests/Map.test.ts tests/Tileset.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run the full unit suite, typecheck and lint**

```powershell
npx vitest run --project unit
npm run typecheck
npm run lint
```

Expected: all pass. `tests/mapSign.browser.test.ts` builds `TilesetTile`s without `frameDurations`; that still compiles because the field is optional.

- [ ] **Step 10: Commit**

```bash
git add apps/somewhere/source/engine/tiled/Tileset.ts apps/somewhere/source/engine/tiled/Map.ts apps/somewhere/tests/Tileset.test.ts apps/somewhere/tests/Map.test.ts
git commit -m "Honor per-frame Tiled animation durations in the engine"
```

---

## Task 2: Clean the existing `.tsx` drift

`assets/tileset.tsx` gives tile 192 two identical collision objects where `public/tileset.json` has one. Nothing detected this. Removing the duplicate makes the two sides agree and unlocks Task 5's acceptance criterion, which is byte-identity against the *committed* `public/tileset.json`.

**Files:**
- Modify: `apps/somewhere/assets/tileset.tsx:29-34`

**Interfaces:**
- Consumes: nothing.
- Produces: an `assets/tileset.tsx` whose JSON projection equals the committed `public/tileset.json` exactly. Tasks 5 and 12 depend on this.

- [ ] **Step 1: Delete the duplicate object**

In `assets/tileset.tsx`, the tile 192 block reads:

```xml
 <tile id="192">
  <objectgroup draworder="index" id="2">
   <object id="1" x="2" y="0" width="14" height="11"/>
   <object id="2" x="2" y="0" width="14" height="11"/>
  </objectgroup>
 </tile>
```

Delete the `id="2"` line only. The lowest id survives, which is the rule Task 11 implements for the same situation. **Keep the CRLF line endings** — edit the single line, do not rewrite the file.

- [ ] **Step 2: Verify nothing else changed**

```bash
git diff --stat apps/somewhere/assets/tileset.tsx
```

Expected: `1 file changed, 1 deletion(-)`. If it reports more, the editor rewrote the line endings; revert and retry.

- [ ] **Step 3: Verify the runtime artifact is unaffected**

```powershell
npx vitest run --project unit tests/exportedAssets.test.ts
```

Expected: PASS. `public/tileset.json` already carried one object for tile 192, so nothing regenerates and nothing changes.

- [ ] **Step 4: Commit**

```bash
git add apps/somewhere/assets/tileset.tsx
git commit -m "Drop the duplicate collision object on tileset tile 192"
```

---

## Task 3: Wiring — a `tools/` TypeScript project that typechecks and lints

Nothing in `tools/` can be typechecked or linted until this exists, and a `tools/*.ts` outside `tsconfig.typecheck.json` is a lint **parse error**, not a warning — `@jakubmazanec/eslint-config` points `parserOptions.project` at that file (`build/configs/main.js:151`, `build/configs/nodejs.js:31`), and `turbo.json` makes `test` depend on `lint`.

**Files:**
- Create: `apps/somewhere/tools/tsconfig.json`, `apps/somewhere/tools/tiled-pipeline/version.ts`
- Modify: `apps/somewhere/.carson/project.json`, `apps/somewhere/package.json`
- Modify (regenerated, never by hand): `apps/somewhere/eslint.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run typecheck` covers `tools/**`; `npm run lint` parses `tools/**`; `npm run sync-tilesets` exists; `fast-xml-parser` is installed. Every later task depends on all four.

- [ ] **Step 1: Get approval for the one lockfile change**

This is the single approved `package-lock.json` change in the whole plan (spec, "Wiring", approved 2026-08-08). Confirm with Jakub before running it, then:

```powershell
npm install --save-dev --workspace=somewhere fast-xml-parser@^5.10.1
```

Expected: `apps/somewhere/package.json` gains `"fast-xml-parser": "^5.10.1"` in `devDependencies`, and `package-lock.json` changes. Nothing else in the lockfile should move; check with `git diff --stat package-lock.json`.

- [ ] **Step 2: Create `tools/tsconfig.json`**

No Carson template writes this path, so it is a normal hand-maintained file. It mirrors `tests/tsconfig.json` minus the React bits, with the `node16` resolution the spec calls for (verified working against `zod`, `fast-png`, `node:util` and `../source/tiled-tools/*.js`):

```json
{
  "compilerOptions": {
    "composite": false,
    "erasableSyntaxOnly": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "lib": ["es2025"],
    "module": "node16",
    "moduleResolution": "node16",
    "noEmit": true,
    "noEmitOnError": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "target": "es2025",
    "types": ["node"]
  },
  "include": ["./**/*"]
}
```

- [ ] **Step 3: Create a placeholder module so the project is non-empty**

`apps/somewhere/tools/tiled-pipeline/version.ts`:

```ts
// The Tiled format version this pipeline writes. Tiled itself stamps both
// attributes on every save; the writers reproduce them so a pipeline-written
// file and a Tiled-written one are indistinguishable.
export const TILED_VERSION = '1.10.2';
export const TILED_FORMAT_VERSION = '1.10';
```

- [ ] **Step 4: Register the eslint parser override and the typecheck extension**

Edit `apps/somewhere/.carson/project.json`. Append one entry to the existing `overrides.eslintConfig` array (it is rendered as JSON into `eslint.config.js` *after* the spread configs, so it wins), and add an `overrides.packageJson` block:

```json
      {
        "files": ["tools/**/*.ts"],
        "languageOptions": {"parserOptions": {"project": "tools/tsconfig.json"}}
      }
```

```json
    "packageJson": {
      "scripts": {
        "typecheck": "tsc --project tsconfig.typecheck.json && tsc --project tools/tsconfig.json"
      }
    },
```

`overrides.packageJson` is the second argument to `lodash.merge` in the template (`package.json.ejs:75`), so it wins over the template's `typecheck`. It must be a sibling of `eslintConfig` and `tsconfig` under `overrides`.

- [ ] **Step 5: Add the CLI script by hand**

In `apps/somewhere/package.json`, add to `scripts` (alphabetical, after `start`):

```json
    "sync-tilesets": "tsx tools/sync-tilesets.ts",
```

A *new* script key survives regeneration because the template's strategy is `merge` — this is exactly how `export-assets` survives. Do not put it in `overrides.packageJson`.

- [ ] **Step 6: Regenerate and confirm the tree is only what you intended**

```powershell
npx carson update workspace
git status --porcelain
```

Expected changed files: `apps/somewhere/.carson/project.json`, `apps/somewhere/.carson/project.snapshot`, `apps/somewhere/eslint.config.js`, `apps/somewhere/package.json`, `package-lock.json`, plus the two new `tools/` files. **If any other Carson-generated file moved, stop** — something else drifted and it needs its own commit.

Confirm the generated `eslint.config.js` ends with the `tools/**/*.ts` entry, and that `package.json`'s `typecheck` now has both `tsc` invocations.

- [ ] **Step 7: Verify typecheck and lint**

```powershell
npm run typecheck
npm run lint
```

Expected: both pass. If lint reports `Parsing error: ... was not found by the project service`, the override entry landed in the wrong place — it must be the **last** element of the exported array.

Note: type-aware lint over this app takes minutes. Budget for it; do not assume a hang is a failure.

- [ ] **Step 8: Commit**

```bash
git add apps/somewhere/.carson apps/somewhere/eslint.config.js apps/somewhere/package.json apps/somewhere/tools package-lock.json
git commit -m "Add a typechecked, linted tools/ project for the Tiled pipeline"
```

---

## Task 4: `tsx.ts` — a lossless XML document model

Reading uses `fast-xml-parser`; writing is bespoke, because no generic serializer reproduces Tiled's exact output (1-space indent per level, fixed attribute order, self-closing empty elements, CRLF). The acceptance criterion is a byte-identical round-trip of the real file.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/tsx.ts`
- Test: `apps/somewhere/tests/tiledTsx.test.ts`

**Interfaces:**
- Consumes: `fast-xml-parser` (Task 3).
- Produces:
  ```ts
  export type XmlElement = {
    name: string;
    attributes: Record<string, string>; // insertion-ordered; JS preserves it for non-numeric keys
    children: XmlElement[];
    text?: string; // set only on text-only elements
  };
  export type XmlDocument = {declaration: string; newline: string; root: XmlElement};

  export function parseXmlDocument(text: string): XmlDocument;
  export function parseTsx(text: string): XmlDocument; // asserts root.name === 'tileset'
  export function formatTsx(document: XmlDocument): string;
  export function getAttribute(element: XmlElement, name: string): string | undefined;
  export function getNumericAttribute(element: XmlElement, name: string): number | undefined;
  export function setAttribute(element: XmlElement, name: string, value: string): void;
  export function removeAttribute(element: XmlElement, name: string): void;
  export function findChild(element: XmlElement, name: string): XmlElement | undefined;
  export function findChildren(element: XmlElement, name: string): XmlElement[];
  export function createElement(name: string, attributes: Record<string, string>): XmlElement;
  ```
  Every later task manipulates the tree through these helpers. `setAttribute` inserts a *new* key at Tiled's canonical position for that element; an *existing* key is assigned in place so parsed order is never disturbed. That combination is what makes both byte-identity and convergence-after-a-Tiled-save hold.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledTsx.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {
  createElement,
  findChild,
  findChildren,
  formatTsx,
  getAttribute,
  parseTsx,
  setAttribute,
} from '../tools/tiled-pipeline/tsx.js';

function readTsx(): string {
  return readFileSync(new URL('../assets/tileset.tsx', import.meta.url), 'utf8');
}

describe('parseTsx / formatTsx', () => {
  test('round-trips assets/tileset.tsx byte-identically', () => {
    let text = readTsx();

    expect(formatTsx(parseTsx(text))).toBe(text);
  });

  test('keeps the source newline, CRLF or LF', () => {
    let crlf = readTsx();
    let lf = crlf.replaceAll('\r\n', '\n');

    expect(parseTsx(crlf).newline).toBe('\r\n');
    expect(parseTsx(lf).newline).toBe('\n');
    expect(formatTsx(parseTsx(lf))).toBe(lf);
  });

  test('exposes the tree the pipeline mutates', () => {
    let document = parseTsx(readTsx());
    let tiles = findChildren(document.root, 'tile');
    let tile192 = tiles.find((tile) => getAttribute(tile, 'id') === '192')!;

    expect(getAttribute(document.root, 'tilecount')).toBe('4096');
    expect(tiles).toHaveLength(8);
    expect(findChildren(findChild(tile192, 'objectgroup')!, 'object')).toHaveLength(1);
  });

  test('writes an empty element self-closing and indents one space per level', () => {
    let document = parseTsx(readTsx());
    let tile = findChildren(document.root, 'tile')[0]!;
    let animation = createElement('animation', {});

    animation.children.push(createElement('frame', {tileid: '64', duration: '150'}));
    tile.children.push(animation);

    expect(formatTsx(document)).toContain(
      '  <animation>\r\n   <frame tileid="64" duration="150"/>\r\n  </animation>\r\n',
    );
  });

  test('inserts a new attribute at its canonical position, not at the end', () => {
    let object = createElement('object', {id: '1', x: '2', y: '8', width: '12', height: '8'});

    setAttribute(object, 'type', 'auto');

    expect(Object.keys(object.attributes)).toStrictEqual([
      'id',
      'type',
      'x',
      'y',
      'width',
      'height',
    ]);
  });

  test('assigning an existing attribute leaves the parsed order alone', () => {
    let document = parseTsx(readTsx());
    let objectGroup = findChild(findChildren(document.root, 'tile')[0]!, 'objectgroup')!;

    setAttribute(objectGroup, 'id', '7');

    expect(Object.keys(objectGroup.attributes)).toStrictEqual(['draworder', 'id']);
  });

  test('escapes the XML-significant characters in attribute values', () => {
    let document = parseTsx(readTsx());

    setAttribute(document.root, 'name', 'a&b<c>d"e');

    expect(formatTsx(document)).toContain('name="a&amp;b&lt;c&gt;d&quot;e"');
    expect(parseTsx(formatTsx(document)).root.attributes['name']).toBe('a&b<c>d"e');
  });

  test('rejects a document whose root is not a tileset', () => {
    expect(() => parseTsx('<?xml version="1.0"?>\n<map version="1.10"/>\n')).toThrow(/tileset/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledTsx.test.ts`
Expected: FAIL with `Failed to resolve import "../tools/tiled-pipeline/tsx.js"`.

- [ ] **Step 3: Implement `tools/tiled-pipeline/tsx.ts`**

```ts
import {XMLParser} from 'fast-xml-parser';

export type XmlElement = {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text?: string;
};

export type XmlDocument = {
  declaration: string;
  newline: string;
  root: XmlElement;
};

// Tiled writes each element's attributes in a fixed, non-alphabetical order.
// Existing attributes keep whatever order the source had; a NEW one is spliced
// in here, so a pipeline-written file and a Tiled-written one converge instead
// of ping-ponging on every save.
const ATTRIBUTE_ORDER: Record<string, string[]> = {
  frame: ['tileid', 'duration'],
  image: ['format', 'source', 'trans', 'width', 'height'],
  object: ['id', 'name', 'type', 'x', 'y', 'width', 'height', 'rotation', 'gid', 'visible'],
  objectgroup: ['draworder', 'id', 'name', 'color', 'opacity', 'visible', 'offsetx', 'offsety'],
  property: ['name', 'type', 'propertytype', 'value'],
  tile: ['id', 'type', 'probability'],
  tileset: [
    'version',
    'tiledversion',
    'name',
    'class',
    'tilewidth',
    'tileheight',
    'spacing',
    'margin',
    'tilecount',
    'columns',
    'objectalignment',
    'tilerendersize',
    'fillmode',
    'backgroundcolor',
  ],
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\n': '&#10;',
};

let parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: true,
  processEntities: true,
  trimValues: true,
});

// fast-xml-parser's preserveOrder shape is an array of single-key objects, with
// attributes under ':@' and text under '#text'. Converting it once into a plain
// tree keeps every other module free of that shape.
function toElement(node: Record<string, unknown>): XmlElement | undefined {
  let name = Object.keys(node).find((key) => key !== ':@');

  if (name === undefined || name === '#text' || name.startsWith('?')) {
    return undefined;
  }

  let attributes: Record<string, string> = {};
  let rawAttributes = (node[':@'] ?? {}) as Record<string, string>;

  for (let [key, value] of Object.entries(rawAttributes)) {
    attributes[key.replace('@_', '')] = String(value);
  }

  let element: XmlElement = {name, attributes, children: []};
  let rawChildren = (node[name] ?? []) as Array<Record<string, unknown>>;

  for (let rawChild of rawChildren) {
    if ('#text' in rawChild) {
      element.text = String(rawChild['#text']);

      continue;
    }

    let child = toElement(rawChild);

    if (child) {
      element.children.push(child);
    }
  }

  return element;
}

export function parseXmlDocument(text: string): XmlDocument {
  let newline = text.includes('\r\n') ? '\r\n' : '\n';
  let declarationMatch = /^<\?xml[^?]*\?>/u.exec(text);
  let nodes = parser.parse(text) as Array<Record<string, unknown>>;
  let root: XmlElement | undefined;

  for (let node of nodes) {
    root ??= toElement(node);
  }

  if (!root) {
    throw new Error('The XML document has no root element!');
  }

  return {
    declaration: declarationMatch?.[0] ?? '<?xml version="1.0" encoding="UTF-8"?>',
    newline,
    root,
  };
}

export function parseTsx(text: string): XmlDocument {
  let document = parseXmlDocument(text);

  if (document.root.name !== 'tileset') {
    throw new Error(`Expected a <tileset> root element, found <${document.root.name}>!`);
  }

  return document;
}

function escapeAttribute(value: string): string {
  return value.replaceAll(/[&<>"\n]/gu, (character) => ESCAPES[character] as string);
}

function formatElement(element: XmlElement, depth: number, newline: string): string {
  let indent = ' '.repeat(depth);
  let attributes = Object.entries(element.attributes)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');

  if (element.children.length === 0 && element.text === undefined) {
    return `${indent}<${element.name}${attributes}/>${newline}`;
  }

  if (element.children.length === 0) {
    let text = escapeAttribute(element.text as string);

    return `${indent}<${element.name}${attributes}>${text}</${element.name}>${newline}`;
  }

  let children = element.children.map((child) => formatElement(child, depth + 1, newline)).join('');

  return `${indent}<${element.name}${attributes}>${newline}${children}${indent}</${element.name}>${newline}`;
}

export function formatTsx(document: XmlDocument): string {
  return document.declaration + document.newline + formatElement(document.root, 0, document.newline);
}

export function getAttribute(element: XmlElement, name: string): string | undefined {
  return element.attributes[name];
}

export function getNumericAttribute(element: XmlElement, name: string): number | undefined {
  let value = element.attributes[name];

  return value === undefined ? undefined : Number(value);
}

export function setAttribute(element: XmlElement, name: string, value: string): void {
  if (name in element.attributes) {
    element.attributes[name] = value;

    return;
  }

  let order = ATTRIBUTE_ORDER[element.name] ?? [];
  let position = order.indexOf(name);
  let reordered: Record<string, string> = {};
  let inserted = false;

  for (let [existingName, existingValue] of Object.entries(element.attributes)) {
    let existingPosition = order.indexOf(existingName);

    if (!inserted && position >= 0 && (existingPosition < 0 || existingPosition > position)) {
      reordered[name] = value;
      inserted = true;
    }

    reordered[existingName] = existingValue;
  }

  if (!inserted) {
    reordered[name] = value;
  }

  element.attributes = reordered;
}

export function removeAttribute(element: XmlElement, name: string): void {
  delete element.attributes[name];
}

export function findChild(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((child) => child.name === name);
}

export function findChildren(element: XmlElement, name: string): XmlElement[] {
  return element.children.filter((child) => child.name === name);
}

export function createElement(name: string, attributes: Record<string, string>): XmlElement {
  return {name, attributes, children: []};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledTsx.test.ts`
Expected: PASS, eight tests.

If the round-trip fails, diff line-wise with `expect(actual.split('\r\n')).toStrictEqual(expected.split('\r\n'))`. The usual causes are a lost `?>` declaration, an attribute value that got numeric-coerced (`parseAttributeValue` must be `false`), or an indent computed from the wrong depth.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/tsx.ts apps/somewhere/tests/tiledTsx.test.ts
git commit -m "Add a lossless Tiled .tsx reader and writer"
```

---

## Task 5: `json.ts` — the Tiled JSON projection

`public/tileset.json` is not Tiled's own byte-for-byte output (`scripts/export-assets.mjs:74` reformats every export), so only *semantic* equivalence with Tiled's export matters — but the committed file is the exact shape this repo ships, which makes it a far better acceptance criterion than a hand-written expectation. This test only passes once Task 2 has removed tile 192's duplicate object.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/json.ts`
- Test: `apps/somewhere/tests/tiledJson.test.ts`

**Interfaces:**
- Consumes: `XmlDocument`, `XmlElement`, `findChild`, `findChildren`, `getAttribute`, `getNumericAttribute` (Task 4); `tiledUnsourcedTilesetSchema` from `../source/tiled-tools/TiledTileset.js` (test only).
- Produces:
  ```ts
  export type JsonValue = boolean | number | string | JsonValue[] | {[key: string]: JsonValue};
  export function toTilesetJson(document: XmlDocument): Record<string, JsonValue>;
  export function formatJson(document: XmlDocument): string; // sorted keys, 2-space, trailing '\n'
  ```

Key ordering rules, all load-bearing: sort object keys lexicographically at every level (this is what Tiled's own JSON export produces, because it serializes sorted `QVariantMap`s); sort the `properties` array by property name, as Tiled does; **do not** sort `objects` (order is semantic under `draworder: "index"`) or `animation` (it is a frame sequence). **Never** use a `JSON.stringify` replacer array to impose key order — it silently drops unlisted keys.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledJson.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {tiledUnsourcedTilesetSchema} from '../source/tiled-tools/TiledTileset.js';
import {formatJson, type JsonValue, toTilesetJson} from '../tools/tiled-pipeline/json.js';
import {parseTsx} from '../tools/tiled-pipeline/tsx.js';

function readTsx(): string {
  return readFileSync(new URL('../assets/tileset.tsx', import.meta.url), 'utf8');
}

describe('formatJson', () => {
  test('reproduces the committed public/tileset.json byte-for-byte', () => {
    let expected = readFileSync(new URL('../public/tileset.json', import.meta.url), 'utf8');

    expect(formatJson(parseTsx(readTsx()))).toBe(expected);
  });

  test('the output satisfies the runtime schema', () => {
    expect(() =>
      tiledUnsourcedTilesetSchema.parse(JSON.parse(formatJson(parseTsx(readTsx())))),
    ).not.toThrow();
  });

  test('maps the image element onto the flat JSON fields', () => {
    let json = toTilesetJson(parseTsx(readTsx()));

    expect(json['image']).toBe('tileset.png');
    expect(json['imagewidth']).toBe(1024);
    expect(json['imageheight']).toBe(1024);
    expect(json['transparentcolor']).toBe('#ff00cc');
    expect(json['margin']).toBe(0);
    expect(json['spacing']).toBe(0);
  });

  test('keeps animation frames in sequence and sorts properties by name', () => {
    let document = parseTsx(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
        ' <image source="t.png" width="32" height="32"/>',
        ' <tile id="0">',
        '  <properties>',
        '   <property name="zebra" type="bool" value="true"/>',
        '   <property name="alpha" value="text"/>',
        '  </properties>',
        '  <animation>',
        '   <frame tileid="2" duration="150"/>',
        '   <frame tileid="1" duration="90"/>',
        '  </animation>',
        ' </tile>',
        '</tileset>',
        '',
      ].join('\n'),
    );
    let tiles = toTilesetJson(document)['tiles'] as Array<Record<string, JsonValue>>;

    expect(tiles[0]!['animation']).toStrictEqual([
      {duration: 150, tileid: 2},
      {duration: 90, tileid: 1},
    ]);
    expect(tiles[0]!['properties']).toStrictEqual([
      {name: 'alpha', type: 'string', value: 'text'},
      {name: 'zebra', type: 'bool', value: true},
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledJson.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/json.ts`**

```ts
import {
  findChild,
  findChildren,
  getAttribute,
  getNumericAttribute,
  type XmlDocument,
  type XmlElement,
} from './tsx.js';

export type JsonValue = boolean | number | string | JsonValue[] | {[key: string]: JsonValue};

// Tiled omits type="string" in XML but always writes it in JSON.
function toProperty(element: XmlElement): Record<string, JsonValue> {
  let type = getAttribute(element, 'type') ?? 'string';
  let raw = getAttribute(element, 'value') ?? element.text ?? '';
  let value: JsonValue;

  switch (type) {
    case 'bool': {
      value = raw === 'true';

      break;
    }

    case 'float':
    case 'int': {
      value = Number(raw);

      break;
    }

    default: {
      value = raw;
    }
  }

  return {name: getAttribute(element, 'name') ?? '', type, value};
}

function toObject(element: XmlElement): Record<string, JsonValue> {
  return {
    height: getNumericAttribute(element, 'height') ?? 0,
    id: getNumericAttribute(element, 'id') ?? 0,
    name: getAttribute(element, 'name') ?? '',
    rotation: getNumericAttribute(element, 'rotation') ?? 0,
    type: getAttribute(element, 'class') ?? getAttribute(element, 'type') ?? '',
    visible: getAttribute(element, 'visible') !== '0',
    width: getNumericAttribute(element, 'width') ?? 0,
    x: getNumericAttribute(element, 'x') ?? 0,
    y: getNumericAttribute(element, 'y') ?? 0,
  };
}

function toObjectGroup(element: XmlElement): Record<string, JsonValue> {
  return {
    draworder: getAttribute(element, 'draworder') ?? 'topdown',
    id: getNumericAttribute(element, 'id') ?? 0,
    name: getAttribute(element, 'name') ?? '',
    objects: findChildren(element, 'object').map((object) => toObject(object)),
    opacity: getNumericAttribute(element, 'opacity') ?? 1,
    type: 'objectgroup',
    visible: getAttribute(element, 'visible') !== '0',
    x: 0,
    y: 0,
  };
}

function toTile(element: XmlElement): Record<string, JsonValue> {
  let tile: Record<string, JsonValue> = {id: getNumericAttribute(element, 'id') ?? 0};
  let type = getAttribute(element, 'class') ?? getAttribute(element, 'type');
  let objectGroup = findChild(element, 'objectgroup');
  let animation = findChild(element, 'animation');
  let properties = findChild(element, 'properties');

  if (type !== undefined && type !== '') {
    tile['type'] = type;
  }

  if (objectGroup) {
    tile['objectgroup'] = toObjectGroup(objectGroup);
  }

  if (animation) {
    tile['animation'] = findChildren(animation, 'frame').map((frame) => ({
      duration: getNumericAttribute(frame, 'duration') ?? 0,
      tileid: getNumericAttribute(frame, 'tileid') ?? 0,
    }));
  }

  if (properties) {
    tile['properties'] = findChildren(properties, 'property')
      .map((property) => toProperty(property))
      .sort((a, b) => String(a['name']).localeCompare(String(b['name'])));
  }

  return tile;
}

export function toTilesetJson(document: XmlDocument): Record<string, JsonValue> {
  let root = document.root;
  let image = findChild(root, 'image');

  if (!image) {
    throw new Error(
      'The tileset has no <image> element! Collection-of-images tilesets are not supported.',
    );
  }

  let transparent = getAttribute(image, 'trans');
  let tiles = findChildren(root, 'tile').map((tile) => toTile(tile));
  let json: Record<string, JsonValue> = {
    columns: getNumericAttribute(root, 'columns') ?? 0,
    image: getAttribute(image, 'source') ?? '',
    imageheight: getNumericAttribute(image, 'height') ?? 0,
    imagewidth: getNumericAttribute(image, 'width') ?? 0,
    margin: getNumericAttribute(root, 'margin') ?? 0,
    name: getAttribute(root, 'name') ?? '',
    spacing: getNumericAttribute(root, 'spacing') ?? 0,
    tilecount: getNumericAttribute(root, 'tilecount') ?? 0,
    tiledversion: getAttribute(root, 'tiledversion') ?? '',
    tileheight: getNumericAttribute(root, 'tileheight') ?? 0,
    tilewidth: getNumericAttribute(root, 'tilewidth') ?? 0,
    type: 'tileset',
    version: getAttribute(root, 'version') ?? '',
  };

  if (tiles.length > 0) {
    json['tiles'] = tiles;
  }

  if (transparent !== undefined) {
    json['transparentcolor'] = transparent.startsWith('#') ? transparent : `#${transparent}`;
  }

  return json;
}

// Lexicographic keys at every level. Arrays keep their order: `objects` is
// semantic under draworder "index", `animation` is a frame sequence, and
// `properties` was already sorted by name upstream.
function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry));
  }

  if (typeof value !== 'object') {
    return value;
  }

  let sorted: {[key: string]: JsonValue} = {};

  for (let key of Object.keys(value).sort()) {
    sorted[key] = sortKeys(value[key] as JsonValue);
  }

  return sorted;
}

export function formatJson(document: XmlDocument): string {
  return `${JSON.stringify(sortKeys(toTilesetJson(document)), null, 2)}\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledJson.test.ts`
Expected: PASS, four tests.

If byte-identity fails, `JSON.parse` both strings and compare with `toStrictEqual` to find the semantic difference before chasing formatting.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/json.ts apps/somewhere/tests/tiledJson.test.ts
git commit -m "Project the Tiled .tsx tree onto the shipped tileset JSON"
```

---

## Task 6: `config.ts` — the schema, the path guard, and the first config file

The config file created here is deliberately minimal: `collision.default` is `"none"` and there are no regions, classes or animations, so `sync-tilesets --check` is clean the moment Task 12 lands. That is what lets the CI gate in Task 14 be legitimately green before the adoption work in Task 19.

`tileSize` is deliberately absent: Tiled carries `tilewidth`/`tileheight` in the `.tsx` and those are authoritative; a config that disagreed would be a second source of truth.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/config.ts`, `apps/somewhere/tilesets.config.json`
- Test: `apps/somewhere/tests/tilesetsConfig.test.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces:
  ```ts
  export const DEFAULT_CONFIG_FILE_NAME = 'tilesets.config.json';
  export const collisionModeSchema: z.ZodEnum<{...}>;
  export const tilesetConfigSchema: z.ZodObject<...>;
  export const tilesetsConfigSchema: z.ZodObject<...>;
  export type CollisionMode = 'none' | 'bbox' | 'footprint' | 'full';
  export type CollisionRegion = {range: [number, number]; mode: CollisionMode};
  export type AnimationRegion = {start: number; frames: number; duration: number};
  export type TilesetConfig = z.infer<typeof tilesetConfigSchema>;
  export type TilesetsConfig = z.infer<typeof tilesetsConfigSchema>;
  export function resolveInsideAppRoot(appRoot: string, relativePath: string): string;
  export function loadConfig(appRoot: string): TilesetsConfig;
  ```

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tilesetsConfig.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

import {
  loadConfig,
  resolveInsideAppRoot,
  tilesetsConfigSchema,
} from '../tools/tiled-pipeline/config.js';

let appRoot = fileURLToPath(new URL('../', import.meta.url));

function minimalConfig(): {tilesets: Array<Record<string, unknown>>} {
  return {
    tilesets: [
      {
        name: 'tileset',
        source: 'assets/tileset.tsx',
        image: 'assets/tileset.png',
        output: 'public/tileset.json',
        outputImage: 'public/tileset.png',
      },
    ],
  };
}

describe('tilesetsConfigSchema', () => {
  test('fills in every optional block so a minimal config is complete', () => {
    let config = tilesetsConfigSchema.parse(minimalConfig());
    let tileset = config.tilesets[0]!;

    expect(tileset.solidAlphaThreshold).toBe(255);
    expect(tileset.collision.default).toBe('none');
    expect(tileset.collision.regions).toStrictEqual([]);
    expect(tileset.collision.tileClasses).toStrictEqual({});
    expect(tileset.collision.footprintMaxHeight).toBe(8);
    expect(tileset.animations.regions).toStrictEqual([]);
    expect(tileset.animations.similarityThreshold).toBe(0.1);
    expect(config.analysis).toBeUndefined();
  });

  test.each([
    ['a Windows absolute path', 'D:/elsewhere/tileset.tsx'],
    ['a POSIX absolute path', '/etc/passwd'],
    ['a parent-directory escape', '../../secrets.tsx'],
    ['an escape mid-path', 'assets/../../secrets.tsx'],
  ])('rejects %s', (unused, source) => {
    let config = minimalConfig();

    config.tilesets[0]!['source'] = source;

    expect(() => tilesetsConfigSchema.parse(config)).toThrow();
  });

  test('rejects an inverted collision region range', () => {
    let config = minimalConfig();

    config.tilesets[0]!['collision'] = {regions: [{range: [200, 100], mode: 'bbox'}]};

    expect(() => tilesetsConfigSchema.parse(config)).toThrow();
  });

  test('rejects an animation region shorter than two frames', () => {
    let config = minimalConfig();

    config.tilesets[0]!['animations'] = {regions: [{start: 256, frames: 1, duration: 150}]};

    expect(() => tilesetsConfigSchema.parse(config)).toThrow();
  });
});

describe('resolveInsideAppRoot', () => {
  test('resolves a relative path against the app root', () => {
    expect(resolveInsideAppRoot(appRoot, 'assets/tileset.tsx')).toContain('tileset.tsx');
  });

  test('throws when the resolved path escapes the app root', () => {
    expect(() => resolveInsideAppRoot(appRoot, 'assets/../../../etc/passwd')).toThrow(/app root/);
  });
});

describe('the committed tilesets.config.json', () => {
  test('parses and points at the real files', () => {
    let config = loadConfig(appRoot);
    let tileset = config.tilesets[0]!;

    expect(config.tilesets).toHaveLength(1);
    expect(tileset.name).toBe('tileset');
    expect(tileset.source).toBe('assets/tileset.tsx');
    expect(tileset.output).toBe('public/tileset.json');
  });

  test('is prettier-shaped, so `npm run format` never rewrites it', () => {
    let text = readFileSync(new URL('../tilesets.config.json', import.meta.url), 'utf8');

    // JSON.stringify(value, null, 2) is NOT prettier-stable: prettier collapses
    // short arrays. Anything that writes this file must format through prettier.
    expect(text).toContain('"maps": ["assets/map.tmx"]');
    expect(text.endsWith('\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tilesetsConfig.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/config.ts`**

```ts
import {readFileSync} from 'node:fs';
import {isAbsolute, join, relative, resolve} from 'node:path';
import {z} from 'zod';

export const DEFAULT_CONFIG_FILE_NAME = 'tilesets.config.json';

export const collisionModeSchema = z.enum(['none', 'bbox', 'footprint', 'full']);

export type CollisionMode = z.infer<typeof collisionModeSchema>;

// Not a sandbox against hostile input: it exists so that running the tool on a
// branch you have not read cannot overwrite files outside the app.
const relativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !isAbsolute(value) && !/^[a-zA-Z]:/u.test(value),
    'must be relative to the app root',
  )
  .refine((value) => !value.split(/[/\\]/u).includes('..'), 'must not contain ".." segments');

const collisionRegionSchema = z
  .object({
    range: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    mode: collisionModeSchema,
  })
  .refine((region) => region.range[0] <= region.range[1], 'range must be [low, high]');

const animationRegionSchema = z.object({
  start: z.number().int().min(0),
  frames: z.number().int().min(2),
  duration: z.number().int().min(1),
});

export const tilesetConfigSchema = z.object({
  name: z.string().min(1),
  source: relativePathSchema,
  image: relativePathSchema,
  output: relativePathSchema,
  outputImage: relativePathSchema,
  solidAlphaThreshold: z.number().int().min(1).max(255).default(255),
  collision: z
    .object({
      default: collisionModeSchema.default('none'),
      regions: z.array(collisionRegionSchema).default([]),
      tileClasses: z.record(z.string(), collisionModeSchema).default({}),
      footprintMaxHeight: z.number().int().min(1).default(8),
    })
    .default({}),
  animations: z
    .object({
      regions: z.array(animationRegionSchema).default([]),
      similarityThreshold: z.number().min(0).max(1).default(0.1),
    })
    .default({}),
});

export const tilesetsConfigSchema = z.object({
  tilesets: z.array(tilesetConfigSchema).min(1),
  analysis: z
    .object({
      maps: z.array(relativePathSchema).default([]),
      collisionLayerClasses: z.array(z.string()).default([]),
    })
    .optional(),
});

export type CollisionRegion = z.infer<typeof collisionRegionSchema>;
export type AnimationRegion = z.infer<typeof animationRegionSchema>;
export type TilesetConfig = z.infer<typeof tilesetConfigSchema>;
export type TilesetsConfig = z.infer<typeof tilesetsConfigSchema>;

export function resolveInsideAppRoot(appRoot: string, relativePath: string): string {
  let resolved = resolve(appRoot, relativePath);
  let inside = relative(resolve(appRoot), resolved);

  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Path "${relativePath}" resolves outside the app root!`);
  }

  return resolved;
}

export function loadConfig(appRoot: string): TilesetsConfig {
  let config = tilesetsConfigSchema.parse(
    JSON.parse(readFileSync(join(appRoot, DEFAULT_CONFIG_FILE_NAME), 'utf8')),
  );

  for (let tileset of config.tilesets) {
    resolveInsideAppRoot(appRoot, tileset.source);
    resolveInsideAppRoot(appRoot, tileset.image);
    resolveInsideAppRoot(appRoot, tileset.output);
    resolveInsideAppRoot(appRoot, tileset.outputImage);
  }

  for (let map of config.analysis?.maps ?? []) {
    resolveInsideAppRoot(appRoot, map);
  }

  return config;
}
```

The schema check and `resolveInsideAppRoot` are deliberately both present: the schema rejects the shapes, the resolver catches anything that survives casing or symlink tricks.

- [ ] **Step 4: Create `apps/somewhere/tilesets.config.json`**

```json
{
  "tilesets": [
    {
      "name": "tileset",
      "source": "assets/tileset.tsx",
      "image": "assets/tileset.png",
      "output": "public/tileset.json",
      "outputImage": "public/tileset.png",
      "solidAlphaThreshold": 255,
      "collision": {
        "default": "none"
      }
    }
  ],
  "analysis": {
    "maps": ["assets/map.tmx"],
    "collisionLayerClasses": ["entities"]
  }
}
```

- [ ] **Step 5: Verify it is prettier-clean**

Run: `npx prettier --check tilesets.config.json`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tilesetsConfig.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/config.ts apps/somewhere/tilesets.config.json apps/somewhere/tests/tilesetsConfig.test.ts
git commit -m "Add the tileset pipeline config schema and its first config"
```

---

## Task 7: `pixels.ts` — decode the atlas, recompute the grid, classify solid pixels

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/pixels.ts`
- Test: `apps/somewhere/tests/tiledPixels.test.ts`

**Interfaces:**
- Consumes: `fast-png` (`decode`), already an app devDependency.
- Produces:
  ```ts
  export type TileMask = {width: number; height: number; solid: boolean[]}; // row-major, solid[y * width + x]
  export type TilesetImage = {
    alphaLevels: Map<number, number>; // alpha -> pixel count
    columns: number;
    height: number;
    rows: number;
    tileCount: number;
    width: number;
    getTileMask(tileId: number): TileMask;
    getTilePixels(tileId: number): Uint8Array; // RGBA, tileWidth * tileHeight * 4
  };
  export type ReadImageOptions = {
    tileWidth: number;
    tileHeight: number;
    margin: number;
    spacing: number;
    solidAlphaThreshold: number;
    transparentColor?: string; // '#rrggbb'
  };
  export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;
  export function assertPngWithinBounds(bytes: Uint8Array): void;
  export function readTilesetImage(bytes: Uint8Array, options: ReadImageOptions): TilesetImage;
  ```

Rules this module owns:

- A pixel is **solid** iff its alpha is at least `solidAlphaThreshold` **and** it does not match the tileset's `transparentcolor`. The default of 255 excludes drop shadows, which matters because shadows hang below a sprite and the box's bottom edge is also the y-sort key (`Map.ts:171-179`), so counting a shadow as solid silently reorders drawing.
- Grid metadata is recomputed from the image with Tiled's own formula: `columns = (imagewidth - margin + spacing) / (tilewidth + spacing)`, and the same for rows with the height; `tileCount = columns * rows`.
- **Hard errors:** image dimensions not divisible by the tile size (after margin/spacing), nonzero `spacing` or `margin` (both are 0 today, and a nonzero value would be a silently wrong slice), and a PNG whose IHDR-declared dimensions exceed `MAX_IMAGE_PIXELS` — checked from the header *before* decoding, since a decompression bomb would otherwise exhaust memory before any other check runs.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledPixels.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {encode} from 'fast-png';
import {describe, expect, test} from 'vitest';

import {
  assertPngWithinBounds,
  readTilesetImage,
  type ReadImageOptions,
} from '../tools/tiled-pipeline/pixels.js';

const BASE_OPTIONS: ReadImageOptions = {
  tileWidth: 16,
  tileHeight: 16,
  margin: 0,
  spacing: 0,
  solidAlphaThreshold: 255,
};

// A 2x1-tile, 32x16 atlas: tile 0 has one opaque pixel at (1, 2), one
// half-alpha pixel at (3, 4) and one opaque colour-key pixel at (5, 6);
// tile 1 is empty.
function syntheticAtlas(): Uint8Array {
  let data = new Uint8Array(32 * 16 * 4);
  let put = (x: number, y: number, rgba: [number, number, number, number]) => {
    data.set(rgba, (y * 32 + x) * 4);
  };

  put(1, 2, [10, 20, 30, 255]);
  put(3, 4, [10, 20, 30, 128]);
  put(5, 6, [255, 0, 204, 255]);

  return encode({width: 32, height: 16, data, channels: 4, depth: 8});
}

function readReal(): Uint8Array {
  return readFileSync(new URL('../assets/tileset.png', import.meta.url));
}

describe('readTilesetImage', () => {
  test('recomputes the grid from the image with Tiled’s formula', () => {
    let image = readTilesetImage(readReal(), BASE_OPTIONS);

    expect(image.width).toBe(1024);
    expect(image.height).toBe(1024);
    expect(image.columns).toBe(64);
    expect(image.rows).toBe(64);
    expect(image.tileCount).toBe(4096);
  });

  test('reports the alpha profile of the real atlas', () => {
    let image = readTilesetImage(readReal(), BASE_OPTIONS);

    expect([...image.alphaLevels.keys()].sort((a, b) => a - b)).toStrictEqual([0, 76, 102, 255]);
    expect(image.alphaLevels.get(255)).toBe(156_332);
    expect(image.alphaLevels.get(102)).toBe(1686);
  });

  test('classifies only fully opaque, non-colour-key pixels as solid at the default threshold', () => {
    let image = readTilesetImage(syntheticAtlas(), {
      ...BASE_OPTIONS,
      transparentColor: '#ff00cc',
    });
    let mask = image.getTileMask(0);

    expect(mask.solid[2 * 16 + 1]).toBe(true); // opaque
    expect(mask.solid[4 * 16 + 3]).toBe(false); // alpha 128 < 255
    expect(mask.solid[6 * 16 + 5]).toBe(false); // colour key
    expect(image.getTileMask(1).solid.some(Boolean)).toBe(false);
  });

  test('a lower threshold admits the half-alpha pixel but never the colour key', () => {
    let image = readTilesetImage(syntheticAtlas(), {
      ...BASE_OPTIONS,
      solidAlphaThreshold: 1,
      transparentColor: '#ff00cc',
    });
    let mask = image.getTileMask(0);

    expect(mask.solid[4 * 16 + 3]).toBe(true);
    expect(mask.solid[6 * 16 + 5]).toBe(false);
  });

  test('without a transparentcolor the colour-key pixel is ordinary art', () => {
    let mask = readTilesetImage(syntheticAtlas(), BASE_OPTIONS).getTileMask(0);

    expect(mask.solid[6 * 16 + 5]).toBe(true);
  });

  test('getTilePixels returns the tile’s RGBA block', () => {
    let pixels = readTilesetImage(syntheticAtlas(), BASE_OPTIONS).getTilePixels(0);

    expect(pixels).toHaveLength(16 * 16 * 4);
    expect([...pixels.subarray((2 * 16 + 1) * 4, (2 * 16 + 1) * 4 + 4)]).toStrictEqual([
      10, 20, 30, 255,
    ]);
  });

  test.each([
    ['nonzero margin', {margin: 1}, /margin/],
    ['nonzero spacing', {spacing: 1}, /spacing/],
    ['a size the tile grid does not divide', {tileWidth: 5}, /divisible/],
  ])('rejects %s', (unused, overrides, pattern) => {
    expect(() => readTilesetImage(syntheticAtlas(), {...BASE_OPTIONS, ...overrides})).toThrow(
      pattern,
    );
  });
});

describe('assertPngWithinBounds', () => {
  test('accepts the real atlas', () => {
    expect(() => assertPngWithinBounds(readReal())).not.toThrow();
  });

  test('rejects a header claiming an absurd size before any decoding happens', () => {
    let bytes = Uint8Array.from(readReal());
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    view.setUint32(16, 100_000);
    view.setUint32(20, 100_000);

    expect(() => assertPngWithinBounds(bytes)).toThrow(/too large/);
  });

  test('rejects a file that is not a PNG', () => {
    expect(() => assertPngWithinBounds(new Uint8Array(32))).toThrow(/PNG/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledPixels.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/pixels.ts`**

```ts
import {decode} from 'fast-png';

export type TileMask = {
  width: number;
  height: number;
  solid: boolean[];
};

export type TilesetImage = {
  alphaLevels: Map<number, number>;
  columns: number;
  height: number;
  rows: number;
  tileCount: number;
  width: number;
  getTileMask(tileId: number): TileMask;
  getTilePixels(tileId: number): Uint8Array;
};

export type ReadImageOptions = {
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  solidAlphaThreshold: number;
  transparentColor?: string;
};

// 64 megapixels: two orders of magnitude above the 1024x1024 atlas, well under
// what decoding would exhaust.
export const MAX_IMAGE_PIXELS = 64 * 1024 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// The IHDR width and height sit at fixed offsets 16 and 20, right after the
// 8-byte signature and the IHDR length/type. Reading them here means a
// decompression bomb is rejected before fast-png allocates anything.
export function assertPngWithinBounds(bytes: Uint8Array): void {
  if (bytes.length < 24 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('The tileset image is not a PNG file!');
  }

  let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = view.getUint32(16);
  let height = view.getUint32(20);

  if (width * height > MAX_IMAGE_PIXELS) {
    throw new Error(
      `The tileset image declares ${width}x${height} pixels, which is too large (the limit is ${MAX_IMAGE_PIXELS} pixels)!`,
    );
  }
}

function parseColorKey(transparentColor: string | undefined): [number, number, number] | undefined {
  if (transparentColor === undefined) {
    return undefined;
  }

  let value = Number.parseInt(transparentColor.replace('#', ''), 16);

  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function countAxis(size: number, tileSize: number, margin: number, spacing: number): number {
  let usable = size - margin + spacing;

  if (usable % (tileSize + spacing) !== 0) {
    throw new Error(
      `The tileset image size ${size} is not divisible by the tile size ${tileSize} (margin ${margin}, spacing ${spacing})!`,
    );
  }

  return usable / (tileSize + spacing);
}

export function readTilesetImage(bytes: Uint8Array, options: ReadImageOptions): TilesetImage {
  let {tileWidth, tileHeight, margin, spacing, solidAlphaThreshold} = options;

  if (margin !== 0) {
    throw new Error(`A nonzero tileset margin (${margin}) is not supported!`);
  }

  if (spacing !== 0) {
    throw new Error(`A nonzero tileset spacing (${spacing}) is not supported!`);
  }

  assertPngWithinBounds(bytes);

  let png = decode(bytes);
  let width = png.width;
  let height = png.height;
  let channels = png.channels;
  let data = Uint8Array.from(png.data as ArrayLike<number>);
  let columns = countAxis(width, tileWidth, margin, spacing);
  let rows = countAxis(height, tileHeight, margin, spacing);
  let colorKey = parseColorKey(options.transparentColor);
  let alphaLevels = new Map<number, number>();

  for (let index = 0; index < width * height; index++) {
    let alpha = channels === 4 ? (data[index * channels + 3] as number) : 255;

    alphaLevels.set(alpha, (alphaLevels.get(alpha) ?? 0) + 1);
  }

  let getTilePixels = (tileId: number): Uint8Array => {
    let originX = margin + (tileId % columns) * (tileWidth + spacing);
    let originY = margin + Math.floor(tileId / columns) * (tileHeight + spacing);
    let pixels = new Uint8Array(tileWidth * tileHeight * 4);

    for (let y = 0; y < tileHeight; y++) {
      for (let x = 0; x < tileWidth; x++) {
        let source = ((originY + y) * width + originX + x) * channels;
        let target = (y * tileWidth + x) * 4;

        pixels[target] = data[source] as number;
        pixels[target + 1] = data[source + (channels > 2 ? 1 : 0)] as number;
        pixels[target + 2] = data[source + (channels > 2 ? 2 : 0)] as number;
        pixels[target + 3] = channels === 4 ? (data[source + 3] as number) : 255;
      }
    }

    return pixels;
  };

  return {
    alphaLevels,
    columns,
    height,
    rows,
    tileCount: columns * rows,
    width,
    getTilePixels,
    getTileMask(tileId: number): TileMask {
      let pixels = getTilePixels(tileId);
      let solid: boolean[] = [];

      for (let index = 0; index < tileWidth * tileHeight; index++) {
        let red = pixels[index * 4] as number;
        let green = pixels[index * 4 + 1] as number;
        let blue = pixels[index * 4 + 2] as number;
        let alpha = pixels[index * 4 + 3] as number;
        let isColorKey =
          colorKey !== undefined &&
          red === colorKey[0] &&
          green === colorKey[1] &&
          blue === colorKey[2];

        solid.push(alpha >= solidAlphaThreshold && !isColorKey);
      }

      return {width: tileWidth, height: tileHeight, solid};
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledPixels.test.ts`
Expected: PASS, all cases. The alpha-profile counts (`255 -> 156332`, `102 -> 1686`) were measured against the committed atlas; if they differ, the atlas changed and the numbers, not the code, need updating.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/pixels.ts apps/somewhere/tests/tiledPixels.test.ts
git commit -m "Decode the tileset atlas and classify solid pixels"
```

---

## Task 8: `collision.ts` — solid masks to boxes

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/collision.ts`
- Test: `apps/somewhere/tests/tiledCollision.test.ts`

**Interfaces:**
- Consumes: `TileMask` (Task 7), `CollisionMode` (Task 6).
- Produces:
  ```ts
  export type CollisionBox = {x: number; y: number; width: number; height: number};
  export function computeCollisionBox(
    mask: TileMask,
    mode: CollisionMode,
    footprintMaxHeight: number,
  ): CollisionBox | undefined; // undefined = emit nothing
  ```

The rules, verbatim from the spec:

- `bbox` — bounding box of the tile's solid pixels.
- `footprint` — as `bbox`, then clamped to the bottom `footprintMaxHeight` rows: `top = max(firstSolidRow, bottom - footprintMaxHeight + 1)`, with the horizontal span computed **within rows `top..bottom`**, not over the whole tile.
- `full` — the whole tile, regardless of content.
- `none` — no box.
- All arithmetic is inclusive: `width = maxX - minX + 1`, `height = bottom - top + 1`.
- A tile with no solid pixels yields `undefined` in every mode except `full`.

The band-restricted span is a correctness fix, not a preference. Computing the span over the whole tile while clamping the rows gives anything wider at the top than at the base a box with the top's width at the base's height: tile 1281 (a wall cap over a 5 px post) comes out `w:16` instead of `w:5` — 11 px of phantom collision exactly where the player walks. 51 of the atlas's 815 partial tiles are affected, and the band-restricted result is identical everywhere the two agree.

Known limits, handled by override rather than cleverness: a tile with two separated solid regions (a table, a bridge) gets one box spanning the gap, since single-rectangle output is an engine constraint; a floating sprite gets a box whose bottom is mid-air, which then becomes its sort key.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledCollision.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {computeCollisionBox} from '../tools/tiled-pipeline/collision.js';
import {readTilesetImage, type TileMask} from '../tools/tiled-pipeline/pixels.js';

// Each row string is one row of the tile; '#' is solid, '.' is not.
function maskFrom(rows: string[]): TileMask {
  return {
    width: rows[0]!.length,
    height: rows.length,
    solid: rows.flatMap((row) => [...row].map((character) => character === '#')),
  };
}

function realImage() {
  return readTilesetImage(readFileSync(new URL('../assets/tileset.png', import.meta.url)), {
    tileWidth: 16,
    tileHeight: 16,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: 255,
    transparentColor: '#ff00cc',
  });
}

describe('computeCollisionBox', () => {
  test('bbox uses inclusive arithmetic', () => {
    let mask = maskFrom(['....', '.##.', '.##.', '....']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toStrictEqual({x: 1, y: 1, width: 2, height: 2});
  });

  test('a single solid pixel is a 1x1 box', () => {
    let mask = maskFrom(['....', '..#.', '....', '....']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toStrictEqual({x: 2, y: 1, width: 1, height: 1});
  });

  test('a full-width prop keeps the full width', () => {
    let mask = maskFrom(['####', '####', '####', '####']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toStrictEqual({x: 0, y: 0, width: 4, height: 4});
  });

  test('an empty mask yields nothing', () => {
    let mask = maskFrom(['....', '....']);

    expect(computeCollisionBox(mask, 'bbox', 8)).toBeUndefined();
    expect(computeCollisionBox(mask, 'footprint', 8)).toBeUndefined();
    expect(computeCollisionBox(mask, 'none', 8)).toBeUndefined();
  });

  test('full covers the whole tile even when the art does not', () => {
    let mask = maskFrom(['....', '..#.', '....', '....']);

    expect(computeCollisionBox(mask, 'full', 8)).toStrictEqual({x: 0, y: 0, width: 4, height: 4});
  });

  test('full covers the whole tile of an empty mask too', () => {
    let mask = maskFrom(['....', '....']);

    expect(computeCollisionBox(mask, 'full', 8)).toStrictEqual({x: 0, y: 0, width: 4, height: 2});
  });

  test('none never emits', () => {
    let mask = maskFrom(['####', '####']);

    expect(computeCollisionBox(mask, 'none', 8)).toBeUndefined();
  });

  test('footprint computes its span within the band, not over the whole tile', () => {
    // A signpost: a wide board over a narrow post. The whole-tile span would
    // give width 6 at the post's height; the band-restricted span gives 2.
    let mask = maskFrom([
      '######',
      '######',
      '..##..',
      '..##..',
      '..##..',
      '..##..',
    ]);

    expect(computeCollisionBox(mask, 'footprint', 4)).toStrictEqual({
      x: 2,
      y: 2,
      width: 2,
      height: 4,
    });
  });

  test('footprint does not clamp above the first solid row', () => {
    let mask = maskFrom(['....', '....', '.##.', '.##.']);

    expect(computeCollisionBox(mask, 'footprint', 8)).toStrictEqual({
      x: 1,
      y: 2,
      width: 2,
      height: 2,
    });
  });

  test('footprint and bbox agree when nothing overhangs', () => {
    let mask = maskFrom(['....', '.##.', '.##.', '....']);

    expect(computeCollisionBox(mask, 'footprint', 8)).toStrictEqual(
      computeCollisionBox(mask, 'bbox', 8),
    );
  });

  // The only ground truth available: a rule that contradicts it is wrong until
  // argued otherwise. 7 of 8 reproduce exactly; tile 193's author rounded up
  // over a shadow row.
  test.each([
    [64, {x: 2, y: 8, width: 12, height: 8}],
    [66, {x: 2, y: 8, width: 12, height: 8}],
    [128, {x: 2, y: 0, width: 14, height: 16}],
    [129, {x: 0, y: 12, width: 16, height: 4}],
    [130, {x: 0, y: 0, width: 14, height: 16}],
    [192, {x: 2, y: 0, width: 14, height: 11}],
    [193, {x: 0, y: 0, width: 16, height: 7}],
    [194, {x: 0, y: 0, width: 14, height: 11}],
  ])('bbox reproduces the hand-authored box on tile %i', (tileId, expected) => {
    expect(computeCollisionBox(realImage().getTileMask(tileId), 'bbox', 8)).toStrictEqual(expected);
  });

  test('the band-restricted span saves tile 1281 from 11px of phantom collision', () => {
    expect(computeCollisionBox(realImage().getTileMask(1281), 'footprint', 8)).toStrictEqual({
      x: 0,
      y: 8,
      width: 5,
      height: 8,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledCollision.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/collision.ts`**

```ts
import {type CollisionMode} from './config.js';
import {type TileMask} from './pixels.js';

export type CollisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function spanWithinRows(mask: TileMask, top: number, bottom: number): [number, number] | undefined {
  let minX = mask.width;
  let maxX = -1;

  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.solid[y * mask.width + x]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }

  return maxX < 0 ? undefined : [minX, maxX];
}

export function computeCollisionBox(
  mask: TileMask,
  mode: CollisionMode,
  footprintMaxHeight: number,
): CollisionBox | undefined {
  if (mode === 'none') {
    return undefined;
  }

  if (mode === 'full') {
    return {x: 0, y: 0, width: mask.width, height: mask.height};
  }

  let minY = mask.height;
  let maxY = -1;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.solid[y * mask.width + x]) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxY < 0) {
    return undefined;
  }

  // Clamping the rows first and measuring the span inside them is the whole
  // point: measuring over the whole tile gives anything wider at the top than
  // at the base a box with the top's width at the base's height.
  let top = mode === 'footprint' ? Math.max(minY, maxY - footprintMaxHeight + 1) : minY;
  let span = spanWithinRows(mask, top, maxY) as [number, number];

  return {x: span[0], y: top, width: span[1] - span[0] + 1, height: maxY - top + 1};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledCollision.test.ts`
Expected: PASS, including all eight ground-truth rows.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/collision.ts apps/somewhere/tests/tiledCollision.test.ts
git commit -m "Derive collision boxes from solid-pixel masks"
```

---

## Task 9: `resolve.ts` — the precedence chain

For each tile, `resolve.ts` produces one decision: which collision mode applies. Highest precedence wins.

| # | Source | Where it lives | Set by |
|---|---|---|---|
| 1 | tile property `autoCollision` (`true`/`false`) | `.tsx` | Tiled, or `analyze` |
| 2 | a non-auto object already on the tile | `.tsx` | Tiled |
| 3 | `collision.regions` entry matching the tile id | config | `analyze`, or by hand |
| 4 | `collision.tileClasses` mapping for the tile's class | config + `.tsx` | Tiled, or `analyze` |
| 5 | `collision.default` | config | by hand |

`collision.default` defaults to `"none"`. Nothing is generated for a tile that nothing has spoken for — that inversion is what makes the first run reviewable: 17 tiles touched rather than 805.

`autoCollision: true` means "apply automation here"; since the property carries no mode, it resolves to the mode rules 3-5 would have given, and `bbox` when they would have given `none`. `bbox` is the default for a tile that opts in, because the evidence says the author draws bounding boxes.

Layer classes from maps appear nowhere in this table. They are evidence for a proposal, not an input to a decision.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/resolve.ts`
- Test: `apps/somewhere/tests/tiledResolve.test.ts`

**Interfaces:**
- Consumes: `XmlElement`, `findChild`, `findChildren`, `getAttribute` (Task 4); `CollisionMode`, `TilesetConfig` (Task 6).
- Produces:
  ```ts
  export const AUTO_OBJECT_CLASS = 'auto';
  export function getObjectClass(object: XmlElement): string; // class ?? type ?? ''
  export function isAutoObject(object: XmlElement): boolean;
  export function getTileClass(tile: XmlElement | undefined): string | undefined;
  export function getBooleanProperty(tile: XmlElement | undefined, name: string): boolean | undefined;
  export function resolveCollisionMode(options: {
    tileId: number;
    tile: XmlElement | undefined;
    collision: TilesetConfig['collision'];
  }): CollisionMode;
  ```

`getBooleanProperty` **throws** when the property exists with a non-`bool` type: the property schema is a discriminated union, so a string `"true"` would otherwise be ignored silently.

Auto collision objects carry object class `auto`. The key written is `type`, not `class`: `TiledObject.ts:20` models only `type`, and Zod would silently strip a `class` key, so the post-mutation validation gate would not catch the mistake. Read `class ?? type` (Tiled's own reader prefers `class`, and its 1.9 compatibility mode writes it) and always write `type`.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledResolve.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {tilesetsConfigSchema} from '../tools/tiled-pipeline/config.js';
import {
  getBooleanProperty,
  getObjectClass,
  getTileClass,
  isAutoObject,
  resolveCollisionMode,
} from '../tools/tiled-pipeline/resolve.js';
import {findChildren, parseTsx, type XmlElement} from '../tools/tiled-pipeline/tsx.js';

function tilesetWith(tiles: string[]): XmlElement[] {
  let document = parseTsx(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
      ' <image source="t.png" width="32" height="32"/>',
      ...tiles,
      '</tileset>',
      '',
    ].join('\n'),
  );

  return findChildren(document.root, 'tile');
}

function collisionConfig(overrides: Record<string, unknown> = {}) {
  return tilesetsConfigSchema.parse({
    tilesets: [
      {
        name: 't',
        source: 'assets/t.tsx',
        image: 'assets/t.png',
        output: 'public/t.json',
        outputImage: 'public/t.png',
        collision: overrides,
      },
    ],
  }).tilesets[0]!.collision;
}

describe('object ownership', () => {
  test('reads class in preference to type, and treats "auto" as owned', () => {
    let [withType, withClass, manual] = tilesetWith([
      ' <tile id="0"><objectgroup id="2"><object id="1" type="auto" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
      ' <tile id="1"><objectgroup id="2"><object id="1" class="auto" type="stale" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
      ' <tile id="2"><objectgroup id="2"><object id="1" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]).map((tile) => findChildren(tile.children[0]!, 'object')[0]!);

    expect(getObjectClass(withClass!)).toBe('auto');
    expect(isAutoObject(withType!)).toBe(true);
    expect(isAutoObject(withClass!)).toBe(true);
    expect(isAutoObject(manual!)).toBe(false);
  });
});

describe('tile properties', () => {
  test('reads a bool property and reports an absent one as undefined', () => {
    let [flagged, bare] = tilesetWith([
      ' <tile id="0"><properties><property name="autoCollision" type="bool" value="false"/></properties></tile>',
      ' <tile id="1"/>',
    ]);

    expect(getBooleanProperty(flagged, 'autoCollision')).toBe(false);
    expect(getBooleanProperty(bare, 'autoCollision')).toBeUndefined();
    expect(getBooleanProperty(undefined, 'autoCollision')).toBeUndefined();
  });

  test('throws when the flag carries a non-boolean type', () => {
    let [tile] = tilesetWith([
      ' <tile id="0"><properties><property name="autoCollision" value="true"/></properties></tile>',
    ]);

    expect(() => getBooleanProperty(tile, 'autoCollision')).toThrow(/bool/);
  });

  test('reads the tile class from class or type', () => {
    let [withType, withClass, bare] = tilesetWith([
      ' <tile id="0" type="wall"/>',
      ' <tile id="1" class="prop"/>',
      ' <tile id="2"/>',
    ]);

    expect(getTileClass(withType)).toBe('wall');
    expect(getTileClass(withClass)).toBe('prop');
    expect(getTileClass(bare)).toBeUndefined();
  });
});

describe('resolveCollisionMode', () => {
  test('falls through to the default when nothing speaks for the tile', () => {
    expect(resolveCollisionMode({tileId: 0, tile: undefined, collision: collisionConfig()})).toBe(
      'none',
    );
    expect(
      resolveCollisionMode({
        tileId: 0,
        tile: undefined,
        collision: collisionConfig({default: 'bbox'}),
      }),
    ).toBe('bbox');
  });

  test('a tile class beats the default', () => {
    let [tile] = tilesetWith([' <tile id="0" type="wall"/>']);

    expect(
      resolveCollisionMode({
        tileId: 0,
        tile,
        collision: collisionConfig({default: 'none', tileClasses: {wall: 'bbox'}}),
      }),
    ).toBe('bbox');
  });

  test('a region beats a tile class', () => {
    let [tile] = tilesetWith([' <tile id="5" type="wall"/>']);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({
          tileClasses: {wall: 'bbox'},
          regions: [{range: [4, 6], mode: 'footprint'}],
        }),
      }),
    ).toBe('footprint');
  });

  test('the last matching region wins, so a later entry can narrow an earlier one', () => {
    expect(
      resolveCollisionMode({
        tileId: 5,
        tile: undefined,
        collision: collisionConfig({
          regions: [
            {range: [0, 9], mode: 'bbox'},
            {range: [5, 5], mode: 'full'},
          ],
        }),
      }),
    ).toBe('full');
  });

  test('a non-auto object on the tile beats a region', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><objectgroup id="2"><object id="1" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'bbox'}]}),
      }),
    ).toBe('none');
  });

  test('an auto object on the tile does not suppress anything', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><objectgroup id="2"><object id="1" type="auto" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'bbox'}]}),
      }),
    ).toBe('bbox');
  });

  test('autoCollision false beats everything below it', () => {
    let [tile] = tilesetWith([
      ' <tile id="5" type="wall"><properties><property name="autoCollision" type="bool" value="false"/></properties></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({
          tileClasses: {wall: 'bbox'},
          regions: [{range: [4, 6], mode: 'full'}],
        }),
      }),
    ).toBe('none');
  });

  test('autoCollision true opts in at bbox when nothing below chose a mode', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><properties><property name="autoCollision" type="bool" value="true"/></properties></tile>',
    ]);

    expect(resolveCollisionMode({tileId: 5, tile, collision: collisionConfig()})).toBe('bbox');
  });

  test('autoCollision true keeps the mode a lower rule already chose', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><properties><property name="autoCollision" type="bool" value="true"/></properties></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'footprint'}]}),
      }),
    ).toBe('footprint');
  });

  test('autoCollision true overrides a manual object, which suppression alone would not', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><properties><property name="autoCollision" type="bool" value="true"/></properties><objectgroup id="2"><object id="1" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'bbox'}]}),
      }),
    ).toBe('bbox');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledResolve.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/resolve.ts`**

```ts
import {type CollisionMode, type TilesetConfig} from './config.js';
import {findChild, findChildren, getAttribute, type XmlElement} from './tsx.js';

export const AUTO_OBJECT_CLASS = 'auto';

// Tiled's own reader prefers `class` (its 1.9 compatibility mode writes it),
// but this pipeline always writes `type`: TiledObject.ts models only `type`,
// and Zod would silently strip a `class` key, so the post-mutation validation
// gate would not catch the mistake.
export function getObjectClass(object: XmlElement): string {
  return getAttribute(object, 'class') ?? getAttribute(object, 'type') ?? '';
}

export function isAutoObject(object: XmlElement): boolean {
  return getObjectClass(object) === AUTO_OBJECT_CLASS;
}

export function getTileClass(tile: XmlElement | undefined): string | undefined {
  if (!tile) {
    return undefined;
  }

  let value = getAttribute(tile, 'class') ?? getAttribute(tile, 'type');

  return value === '' ? undefined : value;
}

export function getBooleanProperty(
  tile: XmlElement | undefined,
  name: string,
): boolean | undefined {
  if (!tile) {
    return undefined;
  }

  let properties = findChild(tile, 'properties');
  let property = properties
    ? findChildren(properties, 'property').find((entry) => getAttribute(entry, 'name') === name)
    : undefined;

  if (!property) {
    return undefined;
  }

  // The property schema is a discriminated union on `type`, so a string "true"
  // would be ignored silently rather than misread. Fail loudly instead.
  if (getAttribute(property, 'type') !== 'bool') {
    throw new Error(
      `Tile property "${name}" on tile ${getAttribute(tile, 'id')} must have type "bool", found "${getAttribute(property, 'type') ?? 'string'}"!`,
    );
  }

  return getAttribute(property, 'value') === 'true';
}

function hasManualObject(tile: XmlElement | undefined): boolean {
  if (!tile) {
    return false;
  }

  let objectGroup = findChild(tile, 'objectgroup');

  return objectGroup
    ? findChildren(objectGroup, 'object').some((object) => !isAutoObject(object))
    : false;
}

export function resolveCollisionMode({
  tileId,
  tile,
  collision,
}: {
  tileId: number;
  tile: XmlElement | undefined;
  collision: TilesetConfig['collision'];
}): CollisionMode {
  let flag = getBooleanProperty(tile, 'autoCollision');

  if (flag === false) {
    return 'none';
  }

  // Rules 3-5, lowest first; the last matching region wins so a later entry can
  // narrow an earlier one.
  let mode = collision.default;
  let tileClass = getTileClass(tile);

  if (tileClass !== undefined && collision.tileClasses[tileClass] !== undefined) {
    mode = collision.tileClasses[tileClass];
  }

  for (let region of collision.regions) {
    if (tileId >= region.range[0] && tileId <= region.range[1]) {
      mode = region.mode;
    }
  }

  if (flag === true) {
    // The property carries no mode: it means "automate this tile", and bbox is
    // what the hand-authored evidence says the author draws.
    return mode === 'none' ? 'bbox' : mode;
  }

  return hasManualObject(tile) ? 'none' : mode;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledResolve.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/resolve.ts apps/somewhere/tests/tiledResolve.test.ts
git commit -m "Resolve one collision decision per tile from the precedence chain"
```

---

## Task 10: `animation.ts` — regions to frames

For each configured region `{start, frames, duration}`: tiles `start … start + frames - 1` are the frames in atlas order, and the **first tile of the region carries the `animation` array**. Only the tile carrying the array animates in this engine (`Tileset.ts:66-70`), so a map cell placing a later frame renders static. Tiled does not itself require the animated tile to be its own first frame; this is a convention this pipeline imposes.

Regions carry one duration for the whole run. A hand-tuned per-frame array is a manual claim and is preserved, not flattened (Task 11).

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/animation.ts`
- Test: `apps/somewhere/tests/tiledAnimation.test.ts`

**Interfaces:**
- Consumes: `AnimationRegion` (Task 6).
- Produces:
  ```ts
  export type AnimationFrame = {tileid: number; duration: number};
  export function buildAnimationFrames(region: AnimationRegion): AnimationFrame[];
  export function animatedTileIds(regions: AnimationRegion[]): Set<number>; // the carriers only
  export function validateAnimationRegions(regions: AnimationRegion[], tileCount: number): string[];
  ```
  `validateAnimationRegions` returns messages rather than throwing, so the caller can accumulate every problem in one compute pass (Task 12's all-or-nothing rule).

Validation: `frames >= 2` (the schema already enforces it; re-check so a hand-built region object cannot skip it), every frame id inside `0 … tileCount - 1`, regions non-overlapping, `duration` a positive integer (Tiled truncates floats).

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledAnimation.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {
  animatedTileIds,
  buildAnimationFrames,
  validateAnimationRegions,
} from '../tools/tiled-pipeline/animation.js';

describe('buildAnimationFrames', () => {
  test('lays the frames out in atlas order at the region duration', () => {
    expect(buildAnimationFrames({start: 256, frames: 4, duration: 150})).toStrictEqual([
      {tileid: 256, duration: 150},
      {tileid: 257, duration: 150},
      {tileid: 258, duration: 150},
      {tileid: 259, duration: 150},
    ]);
  });
});

describe('animatedTileIds', () => {
  test('is the set of carrier tiles, not of every frame', () => {
    expect(
      animatedTileIds([
        {start: 256, frames: 4, duration: 150},
        {start: 300, frames: 2, duration: 90},
      ]),
    ).toStrictEqual(new Set([256, 300]));
  });
});

describe('validateAnimationRegions', () => {
  test('accepts adjacent, in-range regions', () => {
    expect(
      validateAnimationRegions(
        [
          {start: 0, frames: 4, duration: 150},
          {start: 4, frames: 2, duration: 150},
        ],
        16,
      ),
    ).toStrictEqual([]);
  });

  test('rejects a run that leaves the atlas', () => {
    expect(validateAnimationRegions([{start: 14, frames: 4, duration: 150}], 16)).toHaveLength(1);
    expect(validateAnimationRegions([{start: 14, frames: 4, duration: 150}], 16)[0]).toMatch(
      /out of range/,
    );
  });

  test('rejects overlapping regions', () => {
    expect(
      validateAnimationRegions(
        [
          {start: 0, frames: 4, duration: 150},
          {start: 3, frames: 2, duration: 150},
        ],
        16,
      )[0],
    ).toMatch(/overlap/);
  });

  test('rejects a single-frame run and a non-integer duration', () => {
    expect(validateAnimationRegions([{start: 0, frames: 1, duration: 150}], 16)[0]).toMatch(
      /at least 2/,
    );
    expect(validateAnimationRegions([{start: 0, frames: 2, duration: 1.5}], 16)[0]).toMatch(
      /positive integer/,
    );
  });

  test('reports every problem in one pass', () => {
    expect(
      validateAnimationRegions(
        [
          {start: 0, frames: 1, duration: 0},
          {start: 100, frames: 2, duration: 150},
        ],
        16,
      ).length,
    ).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledAnimation.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/animation.ts`**

```ts
import {type AnimationRegion} from './config.js';

export type AnimationFrame = {
  tileid: number;
  duration: number;
};

export function buildAnimationFrames(region: AnimationRegion): AnimationFrame[] {
  return Array.from({length: region.frames}, (unused, index) => ({
    tileid: region.start + index,
    duration: region.duration,
  }));
}

// Only the carrier animates in this engine, so a map cell placing a later frame
// renders static.
export function animatedTileIds(regions: AnimationRegion[]): Set<number> {
  return new Set(regions.map((region) => region.start));
}

export function validateAnimationRegions(
  regions: AnimationRegion[],
  tileCount: number,
): string[] {
  let messages: string[] = [];
  let claimed = new Map<number, number>();

  for (let region of regions) {
    let last = region.start + region.frames - 1;

    if (region.frames < 2) {
      messages.push(`Animation region at tile ${region.start} needs at least 2 frames!`);
    }

    if (!Number.isInteger(region.duration) || region.duration < 1) {
      messages.push(
        `Animation region at tile ${region.start} needs a positive integer duration, found ${region.duration}!`,
      );
    }

    if (region.start < 0 || last >= tileCount) {
      messages.push(
        `Animation region ${region.start}..${last} is out of range for a tileset of ${tileCount} tiles!`,
      );

      continue;
    }

    for (let tileId = region.start; tileId <= last; tileId++) {
      let owner = claimed.get(tileId);

      if (owner !== undefined) {
        messages.push(
          `Animation regions at tiles ${owner} and ${region.start} overlap on tile ${tileId}!`,
        );
      } else {
        claimed.set(tileId, region.start);
      }
    }
  }

  return messages;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledAnimation.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/animation.ts apps/somewhere/tests/tiledAnimation.test.ts
git commit -m "Turn animation region specs into Tiled frame arrays"
```

---

## Task 11: `reconcile.ts` — the merge and the core invariant

This is the task the whole design turns on. Merge semantics are table-driven, one case per cell of the state space, rather than a single snapshot: a snapshot pins current behavior including bugs and reports *that* something changed rather than *which rule*.

> **The core invariant.** After reconciliation, a tile carries exactly the auto-owned data the resolved rules say it should. Every auto-owned object or animation not in that set is deleted. Non-auto data is untouched.

The draft granted permission to delete auto objects but never obliged it, and separately defined suppression as "emits nothing". Under that reading, setting `autoCollision: false` to fix a false positive did not remove the false positive, and a tile edited to fully transparent kept its stale box forever.

Cases stated explicitly:

- `autoCollision: false` and an absent property **differ** — the former also deletes.
- A flag property with a non-boolean type is a hard error (Task 9 throws).
- A flag that can never apply is a warning.
- An objectgroup left empty is removed, as is a tile entry left with no payload, matching what Tiled itself prunes.
- **A tileset dropped from the config is not covered** (see correction 11): nothing runs on it. Removing a tileset means "resolve every rule to `none`, run `sync-tilesets`, then delete the entry".

Stable identity, stable diffs:

- The heuristic emits exactly one box per tile. Refreshing rewrites `x`, `y`, `width` and `height` only, preserving `name`, `visible`, `rotation` and any properties, so a user annotation on an auto box survives.
- If several auto objects exist and one is wanted, the **lowest id survives** and the rest are deleted.
- A new object takes `max(ids in the group) + 1`, or 1 for a new group. **Delete-then-insert is forbidden**: it reallocates ids every run and the file never converges.
- Ids are unique per objectgroup, not per tileset (every object in the current file is `id: 1`, and Tiled will not renumber them); duplicates within a group are a hard error rather than a silent renumber.
- New objectgroups are written as `{draworder: "index", id: 2}` in XML, which projects to `{id: 2, draworder: "index", name: "", opacity: 1, visible: true, x: 0, y: 0}` in JSON — matching what Tiled wrote for all eight existing tiles. `draworder` matters: the schema defaults it to `topdown`, so omitting it validates cleanly and then ping-pongs against Tiled on every save.
- **Pipeline order is fixed:** mutate, prune, sort tiles by id, normalize key order, serialize.

Never touched: wangsets, custom properties beyond the pipeline's own flags, `transparentcolor`, terrain data and any unknown field — guaranteed by mutating the parsed tree in place rather than round-tripping it. The asymmetry worth knowing: the pipeline preserves unknown fields, but a Tiled save does not, because Tiled's reader discards what it does not recognize.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/reconcile.ts`
- Test: `apps/somewhere/tests/tiledReconcile.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 4, 6, 7, 8, 9, 10.
- Produces:
  ```ts
  export const AUTO_ANIMATION_PROPERTY = 'autoAnimation';
  export const AUTO_COLLISION_PROPERTY = 'autoCollision';
  export type ReconcileOptions = {tileset: TilesetConfig; image: TilesetImage};
  export type ReconcileResult = {warnings: string[]};
  export function reconcile(document: XmlDocument, options: ReconcileOptions): ReconcileResult;
  ```
  `reconcile` **mutates** `document` in place and returns only warnings; hard errors throw.

- [ ] **Step 1: Write the failing tests — collision cells**

`apps/somewhere/tests/tiledReconcile.test.ts`:

```ts
import {encode} from 'fast-png';
import {describe, expect, test} from 'vitest';

import {tilesetsConfigSchema} from '../tools/tiled-pipeline/config.js';
import {readTilesetImage, type TilesetImage} from '../tools/tiled-pipeline/pixels.js';
import {reconcile} from '../tools/tiled-pipeline/reconcile.js';
import {formatTsx, parseTsx, type XmlDocument} from '../tools/tiled-pipeline/tsx.js';

// A 2x2-tile, 32x32 atlas. Tile 0 is a 2x2 solid block at (1, 1); tiles 1-3
// are empty unless `solidTiles` says otherwise.
function atlas(solidTiles: number[] = [0]): Uint8Array {
  let data = new Uint8Array(32 * 32 * 4);

  for (let tileId of solidTiles) {
    let originX = (tileId % 2) * 16;
    let originY = Math.floor(tileId / 2) * 16;

    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 3; x++) {
        data.set([10, 20, 30, 255], ((originY + y) * 32 + originX + x) * 4);
      }
    }
  }

  return encode({width: 32, height: 32, data, channels: 4, depth: 8});
}

function imageFor(solidTiles: number[] = [0]): TilesetImage {
  return readTilesetImage(atlas(solidTiles), {
    tileWidth: 16,
    tileHeight: 16,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: 255,
  });
}

function documentWith(tiles: string[]): XmlDocument {
  return parseTsx(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
      ' <image source="t.png" width="32" height="32"/>',
      ...tiles,
      '</tileset>',
      '',
    ].join('\n'),
  );
}

function configFor(overrides: Record<string, unknown> = {}) {
  return tilesetsConfigSchema.parse({
    tilesets: [
      {
        name: 't',
        source: 'assets/t.tsx',
        image: 'assets/t.png',
        output: 'public/t.json',
        outputImage: 'public/t.png',
        ...overrides,
      },
    ],
  }).tilesets[0]!;
}

function run(
  document: XmlDocument,
  overrides: Record<string, unknown> = {},
  solidTiles: number[] = [0],
) {
  return reconcile(document, {tileset: configFor(overrides), image: imageFor(solidTiles)});
}

const AUTO_ON_TILE_0 = {collision: {regions: [{range: [0, 0], mode: 'bbox'}]}};

describe('reconcile: collision', () => {
  test('no rule and no data leaves the file untouched', () => {
    let document = documentWith([]);
    let before = formatTsx(document);

    run(document);

    expect(formatTsx(document)).toBe(before);
  });

  test('a rule with no data creates the tile, group and auto object', () => {
    let document = documentWith([]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain(
      ' <tile id="0">\n  <objectgroup draworder="index" id="2">\n   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>\n  </objectgroup>\n </tile>\n',
    );
  });

  test('refreshing an auto object rewrites only its geometry', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="4" name="knee height" type="auto" x="9" y="9" width="9" height="9" rotation="0" visible="1"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain(
      '<object id="4" name="knee height" type="auto" x="1" y="1" width="2" height="2" rotation="0" visible="1"/>',
    );
  });

  test('a manual object is untouched and suppresses the auto box', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);
    let before = formatTsx(document);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toBe(before);
  });

  test('claiming an auto box by clearing its class makes it manual', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('<object id="1" x="9" y="9" width="9" height="9"/>');
    expect(formatTsx(document)).not.toContain('type="auto"');
  });

  test('the rule going away deletes the auto object, the group and the tile entry', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document);

    expect(formatTsx(document)).not.toContain('<tile');
    expect(formatTsx(document)).not.toContain('objectgroup');
  });

  test('autoCollision false deletes an existing auto object and keeps the property', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoCollision" type="bool" value="false"/>',
      '  </properties>',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('name="autoCollision"');
    expect(formatTsx(document)).not.toContain('<objectgroup');
  });

  test('an absent property and autoCollision false are not the same thing', () => {
    let withoutFlag = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(withoutFlag, AUTO_ON_TILE_0);

    expect(formatTsx(withoutFlag)).toContain('x="1" y="1" width="2" height="2"');
  });

  test('art that disappeared deletes the stale box', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0, []);

    expect(formatTsx(document)).not.toContain('<tile');
  });

  test('several auto objects collapse to the lowest id', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="3" type="auto" x="9" y="9" width="9" height="9"/>',
      '   <object id="1" type="auto" x="8" y="8" width="8" height="8"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('<object id="1" type="auto" x="1" y="1"');
    expect(formatTsx(document)).not.toContain('id="3"');
  });

  test('a new auto object in an existing group takes max(id) + 1', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="7" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, {
      collision: {regions: [{range: [0, 0], mode: 'bbox'}]},
      // The manual object would suppress; the flag overrides it.
    });

    expect(formatTsx(document)).not.toContain('id="8"');

    let withFlag = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoCollision" type="bool" value="true"/>',
      '  </properties>',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="7" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(withFlag, AUTO_ON_TILE_0);

    expect(formatTsx(withFlag)).toContain('<object id="8" type="auto" x="1" y="1"');
  });

  test('reconciling twice reallocates nothing', () => {
    let document = documentWith([]);

    run(document, AUTO_ON_TILE_0);

    let once = formatTsx(document);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toBe(once);
  });

  test('tiles are emitted in id order regardless of source order', () => {
    let document = documentWith([' <tile id="3"/>', ' <tile id="1"/>']);

    run(document, {collision: {regions: [{range: [1, 3], mode: 'full'}]}}, [1, 3]);

    let text = formatTsx(document);

    expect(text.indexOf('id="1"')).toBeLessThan(text.indexOf('id="3"'));
  });
});
```

- [ ] **Step 2: Write the failing tests — animation cells, hard errors and warnings**

Append to the same file:

```ts
const ANIMATION_ON_TILE_0 = {animations: {regions: [{start: 0, frames: 2, duration: 150}]}};

describe('reconcile: animations', () => {
  test('a region writes the frame array and the ownership flag onto the carrier only', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);

    let text = formatTsx(document);

    expect(text).toContain('<property name="autoAnimation" type="bool" value="true"/>');
    expect(text).toContain('<frame tileid="0" duration="150"/>');
    expect(text).toContain('<frame tileid="1" duration="150"/>');
    expect(text).not.toContain('<tile id="1"');
  });

  test('moving a region deletes the orphaned array, flag and tile entry', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);
    run(document, {animations: {regions: [{start: 2, frames: 2, duration: 150}]}}, [0, 2]);

    let text = formatTsx(document);

    expect(text).not.toContain('<tile id="0"');
    expect(text).toContain('<tile id="2"');
  });

  test('deleting every region deletes every auto animation', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);
    run(document);

    expect(formatTsx(document)).not.toContain('<animation>');
  });

  test('a manual animation inside a region is skipped with a warning, not overwritten', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <animation>',
      '   <frame tileid="0" duration="40"/>',
      '   <frame tileid="1" duration="900"/>',
      '  </animation>',
      ' </tile>',
    ]);
    let result = run(document, ANIMATION_ON_TILE_0);

    expect(formatTsx(document)).toContain('duration="900"');
    expect(result.warnings.join(' ')).toMatch(/manual animation/i);
  });

  test('autoAnimation false deletes the array and blocks regeneration', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);

    let suppressed = parseTsx(
      formatTsx(document).replace(
        '<property name="autoAnimation" type="bool" value="true"/>',
        '<property name="autoAnimation" type="bool" value="false"/>',
      ),
    );

    run(suppressed, ANIMATION_ON_TILE_0);

    expect(formatTsx(suppressed)).not.toContain('<animation>');
    expect(formatTsx(suppressed)).toContain('value="false"');
  });
});

describe('reconcile: hard errors and warnings', () => {
  test('throws on duplicate object ids within a group', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="0" y="0" width="1" height="1"/>',
      '   <object id="1" x="2" y="2" width="1" height="1"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    expect(() => run(document)).toThrow(/duplicate object id/i);
  });

  test('throws on tile data left out of range by a shrunken image', () => {
    let document = documentWith([' <tile id="9"/>']);

    expect(() => run(document)).toThrow(/out of range/i);
  });

  test('throws on a negative box left behind by a manual edit', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="0" y="0" width="-4" height="1"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    expect(() => run(document)).toThrow(/negative/i);
  });

  test('throws when the recomputed grid contradicts the tileset attributes', () => {
    let document = documentWith([]);

    document.root.attributes['tilewidth'] = '5';

    expect(() => run(document)).toThrow();
  });

  test('warns about a flag that can never apply', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoAnimation" type="bool" value="true"/>',
      '  </properties>',
      ' </tile>',
    ]);
    let result = run(document);

    expect(result.warnings.join(' ')).toMatch(/autoAnimation/);
  });

  test('recomputes the grid metadata from the image', () => {
    let document = documentWith([]);

    document.root.attributes['tilecount'] = '999';
    document.root.attributes['columns'] = '999';

    run(document);

    expect(document.root.attributes['tilecount']).toBe('4');
    expect(document.root.attributes['columns']).toBe('2');
  });

  test('leaves wangsets and unknown elements alone', () => {
    let document = documentWith([
      ' <wangsets>',
      '  <wangset name="terrain" type="corner" tile="-1">',
      '   <wangcolor name="grass" color="#ff0000" tile="-1" probability="1"/>',
      '  </wangset>',
      ' </wangsets>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('<wangcolor name="grass" color="#ff0000"');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledReconcile.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 4: Implement `tools/tiled-pipeline/reconcile.ts`**

```ts
import {animatedTileIds, buildAnimationFrames, validateAnimationRegions} from './animation.js';
import {computeCollisionBox} from './collision.js';
import {type TilesetConfig} from './config.js';
import {type TilesetImage} from './pixels.js';
import {
  AUTO_OBJECT_CLASS,
  getBooleanProperty,
  isAutoObject,
  resolveCollisionMode,
} from './resolve.js';
import {
  createElement,
  findChild,
  findChildren,
  getAttribute,
  getNumericAttribute,
  setAttribute,
  type XmlDocument,
  type XmlElement,
} from './tsx.js';

export const AUTO_ANIMATION_PROPERTY = 'autoAnimation';
export const AUTO_COLLISION_PROPERTY = 'autoCollision';

export type ReconcileOptions = {
  tileset: TilesetConfig;
  image: TilesetImage;
};

export type ReconcileResult = {
  warnings: string[];
};

function getOrCreateTile(root: XmlElement, tileId: number): XmlElement {
  let existing = findChildren(root, 'tile').find(
    (tile) => getNumericAttribute(tile, 'id') === tileId,
  );

  if (existing) {
    return existing;
  }

  let tile = createElement('tile', {id: String(tileId)});

  root.children.push(tile);

  return tile;
}

function setBooleanProperty(tile: XmlElement, name: string, value: boolean): void {
  let properties = findChild(tile, 'properties');

  if (!properties) {
    properties = createElement('properties', {});
    tile.children.unshift(properties);
  }

  let property = findChildren(properties, 'property').find(
    (entry) => getAttribute(entry, 'name') === name,
  );

  if (!property) {
    property = createElement('property', {name, type: 'bool', value: String(value)});
    properties.children.push(property);
    properties.children.sort((a, b) =>
      (getAttribute(a, 'name') ?? '').localeCompare(getAttribute(b, 'name') ?? ''),
    );

    return;
  }

  setAttribute(property, 'type', 'bool');
  setAttribute(property, 'value', String(value));
}

function removeProperty(tile: XmlElement, name: string): void {
  let properties = findChild(tile, 'properties');

  if (!properties) {
    return;
  }

  properties.children = properties.children.filter(
    (property) => getAttribute(property, 'name') !== name,
  );
}

function assertObjectIdsUnique(tile: XmlElement, group: XmlElement): void {
  let seen = new Set<number>();

  for (let object of findChildren(group, 'object')) {
    let id = getNumericAttribute(object, 'id') ?? 0;

    if (seen.has(id)) {
      throw new Error(
        `Tile ${getAttribute(tile, 'id')} has a duplicate object id ${id} in its objectgroup! Object ids are unique per group; renumber the duplicate in Tiled.`,
      );
    }

    seen.add(id);
  }
}

function assertBoxesValid(tile: XmlElement, group: XmlElement): void {
  for (let object of findChildren(group, 'object')) {
    let width = getNumericAttribute(object, 'width') ?? 0;
    let height = getNumericAttribute(object, 'height') ?? 0;

    if (width < 0 || height < 0) {
      throw new Error(
        `Tile ${getAttribute(tile, 'id')} object ${getAttribute(object, 'id')} has a negative size (${width}x${height})!`,
      );
    }
  }
}

// Auto collision: exactly one box per tile, refreshed in place. Delete-then-
// insert is forbidden — it reallocates ids every run and the file never
// converges.
function reconcileCollision(tile: XmlElement, box: ReturnType<typeof computeCollisionBox>): void {
  let group = findChild(tile, 'objectgroup');
  let autoObjects = group ? findChildren(group, 'object').filter((object) => isAutoObject(object)) : [];

  if (!box) {
    if (group) {
      group.children = group.children.filter((object) => !isAutoObject(object));
    }

    return;
  }

  if (!group) {
    group = createElement('objectgroup', {draworder: 'index', id: '2'});
    tile.children.push(group);
  }

  let survivor = autoObjects.sort(
    (a, b) => (getNumericAttribute(a, 'id') ?? 0) - (getNumericAttribute(b, 'id') ?? 0),
  )[0];

  if (survivor) {
    group.children = group.children.filter(
      (object) => object === survivor || !isAutoObject(object),
    );
  } else {
    let maxId = Math.max(
      0,
      ...findChildren(group, 'object').map((object) => getNumericAttribute(object, 'id') ?? 0),
    );

    survivor = createElement('object', {id: String(maxId + 1), type: AUTO_OBJECT_CLASS});
    group.children.push(survivor);
  }

  setAttribute(survivor, 'type', AUTO_OBJECT_CLASS);
  setAttribute(survivor, 'x', String(box.x));
  setAttribute(survivor, 'y', String(box.y));
  setAttribute(survivor, 'width', String(box.width));
  setAttribute(survivor, 'height', String(box.height));
}

function prune(root: XmlElement): void {
  for (let tile of findChildren(root, 'tile')) {
    let group = findChild(tile, 'objectgroup');
    let properties = findChild(tile, 'properties');
    let animation = findChild(tile, 'animation');

    if (group && group.children.length === 0) {
      tile.children = tile.children.filter((child) => child !== group);
    }

    if (properties && properties.children.length === 0) {
      tile.children = tile.children.filter((child) => child !== properties);
    }

    if (animation && animation.children.length === 0) {
      tile.children = tile.children.filter((child) => child !== animation);
    }
  }

  root.children = root.children.filter(
    (child) => child.name !== 'tile' || child.children.length > 0 || Object.keys(child.attributes).length > 1,
  );
}

export function reconcile(document: XmlDocument, options: ReconcileOptions): ReconcileResult {
  let {tileset, image} = options;
  let root = document.root;
  let warnings: string[] = [];
  let tileWidth = getNumericAttribute(root, 'tilewidth') ?? 0;
  let tileHeight = getNumericAttribute(root, 'tileheight') ?? 0;

  if (tileWidth !== image.width / image.columns || tileHeight !== image.height / image.rows) {
    throw new Error(
      `The tileset declares ${tileWidth}x${tileHeight} tiles, which does not divide the ${image.width}x${image.height} image!`,
    );
  }

  for (let tile of findChildren(root, 'tile')) {
    let tileId = getNumericAttribute(tile, 'id') ?? 0;

    if (tileId < 0 || tileId >= image.tileCount) {
      throw new Error(
        `Tile ${tileId} is out of range for an image holding ${image.tileCount} tiles! The image shrank; remove the stale tile data in Tiled.`,
      );
    }

    let group = findChild(tile, 'objectgroup');

    if (group) {
      assertObjectIdsUnique(tile, group);
      assertBoxesValid(tile, group);
    }
  }

  let animationMessages = validateAnimationRegions(tileset.animations.regions, image.tileCount);

  if (animationMessages.length > 0) {
    throw new Error(animationMessages.join('\n'));
  }

  let carriers = animatedTileIds(tileset.animations.regions);
  let touched = new Set<number>([
    ...carriers,
    ...findChildren(root, 'tile').map((tile) => getNumericAttribute(tile, 'id') ?? 0),
  ]);

  for (let region of tileset.collision.regions) {
    for (let tileId = region.range[0]; tileId <= Math.min(region.range[1], image.tileCount - 1); tileId++) {
      touched.add(tileId);
    }
  }

  if (tileset.collision.default !== 'none' || Object.keys(tileset.collision.tileClasses).length > 0) {
    for (let tileId = 0; tileId < image.tileCount; tileId++) {
      touched.add(tileId);
    }
  }

  for (let tileId of [...touched].sort((a, b) => a - b)) {
    let existing = findChildren(root, 'tile').find(
      (tile) => getNumericAttribute(tile, 'id') === tileId,
    );
    let mode = resolveCollisionMode({tileId, tile: existing, collision: tileset.collision});
    let box = computeCollisionBox(
      image.getTileMask(tileId),
      mode,
      tileset.collision.footprintMaxHeight,
    );
    let animationFlag = getBooleanProperty(existing, AUTO_ANIMATION_PROPERTY);
    let region = tileset.animations.regions.find((entry) => entry.start === tileId);
    let hasManualAnimation =
      existing !== undefined && findChild(existing, 'animation') !== undefined && animationFlag !== true;
    let wantsAnimation = region !== undefined && animationFlag !== false && !hasManualAnimation;

    if (region && hasManualAnimation) {
      warnings.push(
        `Tile ${tileId} carries a manual animation inside a configured region; it is kept and the region is skipped for this tile.`,
      );
    }

    if (!region && animationFlag !== undefined && !carriers.has(tileId)) {
      warnings.push(
        `Tile ${tileId} carries "${AUTO_ANIMATION_PROPERTY}" but no animation region covers it, so the flag can never apply.`,
      );
    }

    if (!existing && !box && !wantsAnimation) {
      continue;
    }

    let tile = existing ?? getOrCreateTile(root, tileId);

    reconcileCollision(tile, box);

    if (wantsAnimation && region) {
      let animation = findChild(tile, 'animation') ?? createElement('animation', {});

      animation.children = buildAnimationFrames(region).map((frame) =>
        createElement('frame', {tileid: String(frame.tileid), duration: String(frame.duration)}),
      );

      if (!findChild(tile, 'animation')) {
        tile.children.push(animation);
      }

      setBooleanProperty(tile, AUTO_ANIMATION_PROPERTY, true);
    } else if (animationFlag === true || (animationFlag === false && !hasManualAnimation)) {
      // The flag marks the array as ours, so a region that moved away deletes
      // it. Without the flag, ownership would be positional and deletion would
      // be inexpressible.
      tile.children = tile.children.filter((child) => child.name !== 'animation');

      if (animationFlag === true) {
        removeProperty(tile, AUTO_ANIMATION_PROPERTY);
      }
    }
  }

  prune(root);

  root.children.sort((a, b) => {
    if (a.name !== 'tile' || b.name !== 'tile') {
      return 0;
    }

    return (getNumericAttribute(a, 'id') ?? 0) - (getNumericAttribute(b, 'id') ?? 0);
  });

  setAttribute(root, 'columns', String(image.columns));
  setAttribute(root, 'tilecount', String(image.tileCount));

  let imageElement = findChild(root, 'image');

  if (imageElement) {
    setAttribute(imageElement, 'width', String(image.width));
    setAttribute(imageElement, 'height', String(image.height));
  }

  return {warnings};
}
```

Note on `root.children.sort`: `Array.prototype.sort` is stable in V8, and the comparator returns 0 for any pair involving a non-`tile`, so `<image>` and `<wangsets>` keep their relative position while tiles order among themselves. If the tests show `<image>` moving, replace the sort with a partition (`non-tiles in order, then tiles sorted`) that reproduces Tiled's layout: `<image>` first, then tiles, then `<wangsets>`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledReconcile.test.ts`
Expected: PASS, every cell.

Expect to iterate here — this is the densest module in the plan. Work one failing cell at a time and do not weaken a test to make it pass; each one is a state-space cell the review found undefined.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/reconcile.ts apps/somewhere/tests/tiledReconcile.test.ts
git commit -m "Reconcile auto-owned tileset data against the resolved rules"
```

---

## Task 12: `compute.ts` — all-or-nothing computation, drift, idempotence

Two phases. **Compute** every tileset, continuing past failures so all errors surface in one run. Enter the **write** phase only if every tileset computed cleanly. Every hard error is a compute-phase error, so this costs nothing and removes the half-updated working tree the draft would have produced.

`--check` is the default path with the write call removed, sharing one compute and serialize implementation, so the two cannot disagree. A configured tileset with no output file yet counts as drift.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/compute.ts`
- Test: `apps/somewhere/tests/tiledCompute.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 6, 7, 11.
- Produces:
  ```ts
  export type ComputedTileset = {
    name: string;
    warnings: string[];
    sourcePath: string;
    sourceText: string;
    outputPath: string;
    outputText: string;
    imagePath: string;
    outputImagePath: string;
    imageBytes: Uint8Array;
    drift: string[]; // human-readable, empty when every artifact is up to date
  };
  export type ComputeAllResult = {computed: ComputedTileset[]; errors: Error[]};
  export function computeTileset(appRoot: string, tileset: TilesetConfig): ComputedTileset;
  export function computeAll(appRoot: string, config: TilesetsConfig): ComputeAllResult;
  ```

The idempotence test is written at the byte seam and re-parses in between: `format(reconcile(parse(once))) === once`. The re-parse matters. The draft's `reconcile(reconcile(x)) === reconcile(x)` is a type error if the function returns void and vacuously true by reference identity if it returns the mutated tree, so it is a test that cannot fail.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledCompute.test.ts`:

```ts
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {computeAll, computeTileset} from '../tools/tiled-pipeline/compute.js';
import {loadConfig, tilesetsConfigSchema} from '../tools/tiled-pipeline/config.js';
import {readTilesetImage} from '../tools/tiled-pipeline/pixels.js';
import {reconcile} from '../tools/tiled-pipeline/reconcile.js';
import {formatTsx, parseTsx} from '../tools/tiled-pipeline/tsx.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';

// A throwaway app root holding only what the pipeline reads and writes, so a
// test can mutate sources without touching the working tree.
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'tiled-pipeline-'));

  mkdirSync(join(appRoot, 'assets'));
  mkdirSync(join(appRoot, 'public'));
  cpSync(join(realAppRoot, 'assets/tileset.tsx'), join(appRoot, 'assets/tileset.tsx'));
  cpSync(join(realAppRoot, 'assets/tileset.png'), join(appRoot, 'assets/tileset.png'));
  cpSync(join(realAppRoot, 'public/tileset.json'), join(appRoot, 'public/tileset.json'));
  cpSync(join(realAppRoot, 'public/tileset.png'), join(appRoot, 'public/tileset.png'));
  cpSync(join(realAppRoot, 'tilesets.config.json'), join(appRoot, 'tilesets.config.json'));
});

afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe('computeTileset', () => {
  test('the committed artifacts are already up to date under the committed config', () => {
    let computed = computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!);

    expect(computed.drift).toStrictEqual([]);
    expect(computed.warnings).toStrictEqual([]);
  });

  test('is idempotent at the byte seam, with a re-parse in between', () => {
    let tileset = loadConfig(appRoot).tilesets[0]!;
    let once = computeTileset(appRoot, tileset).sourceText;

    writeFileSync(join(appRoot, 'assets/tileset.tsx'), once);

    expect(computeTileset(appRoot, tileset).sourceText).toBe(once);
  });

  test('converges across a simulated Tiled save', () => {
    let config = tilesetsConfigSchema.parse({
      tilesets: [
        {
          name: 'tileset',
          source: 'assets/tileset.tsx',
          image: 'assets/tileset.png',
          output: 'public/tileset.json',
          outputImage: 'public/tileset.png',
          collision: {regions: [{range: [64, 66], mode: 'bbox'}]},
        },
      ],
    }).tilesets[0]!;
    let first = computeTileset(appRoot, config).sourceText;

    // A Tiled save round-trips the file through its own reader and writer. The
    // closest faithful stand-in available here is our own parse/format pair,
    // which is byte-exact by Task 4's acceptance test.
    writeFileSync(join(appRoot, 'assets/tileset.tsx'), formatTsx(parseTsx(first)));

    expect(computeTileset(appRoot, config).sourceText).toBe(first);
  });

  test('reports drift when the output JSON is stale', () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    let computed = computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!);

    expect(computed.drift.join(' ')).toMatch(/tileset\.json/);
  });

  test('reports drift when an output does not exist yet', () => {
    rmSync(join(appRoot, 'public/tileset.png'));

    expect(computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!).drift.join(' ')).toMatch(
      /tileset\.png/,
    );
  });

  test('carries the source image through to the output image byte-for-byte', () => {
    let computed = computeTileset(appRoot, loadConfig(appRoot).tilesets[0]!);

    expect(Buffer.from(computed.imageBytes)).toStrictEqual(
      readFileSync(join(appRoot, 'assets/tileset.png')),
    );
  });

  test('does not leak Map or Set iteration order or a timestamp into its output', () => {
    let tileset = loadConfig(appRoot).tilesets[0]!;

    expect(computeTileset(appRoot, tileset).outputText).toBe(
      computeTileset(appRoot, tileset).outputText,
    );
  });
});

describe('computeAll', () => {
  test('continues past a failing tileset so every error surfaces in one run', () => {
    let config = tilesetsConfigSchema.parse({
      tilesets: [
        {
          name: 'missing',
          source: 'assets/nope.tsx',
          image: 'assets/nope.png',
          output: 'public/nope.json',
          outputImage: 'public/nope.png',
        },
        {
          name: 'also-missing',
          source: 'assets/nope2.tsx',
          image: 'assets/nope2.png',
          output: 'public/nope2.json',
          outputImage: 'public/nope2.png',
        },
      ],
    });
    let result = computeAll(appRoot, config);

    expect(result.errors).toHaveLength(2);
    expect(result.computed).toHaveLength(0);
  });

  test('computes every tileset when they all succeed', () => {
    let result = computeAll(appRoot, loadConfig(appRoot));

    expect(result.errors).toHaveLength(0);
    expect(result.computed).toHaveLength(1);
  });
});

describe('the reconcile-serialize seam', () => {
  test('reconcile leaves an already-reconciled document byte-identical', () => {
    let text = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');
    let image = readTilesetImage(readFileSync(join(appRoot, 'assets/tileset.png')), {
      tileWidth: 16,
      tileHeight: 16,
      margin: 0,
      spacing: 0,
      solidAlphaThreshold: 255,
      transparentColor: '#ff00cc',
    });
    let tileset = loadConfig(appRoot).tilesets[0]!;
    let document = parseTsx(text);

    reconcile(document, {tileset, image});

    let once = formatTsx(document);
    let again = parseTsx(once);

    reconcile(again, {tileset, image});

    expect(formatTsx(again)).toBe(once);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledCompute.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/compute.ts`**

```ts
import {existsSync, readFileSync} from 'node:fs';
import {formatJson} from './json.js';
import {readTilesetImage} from './pixels.js';
import {reconcile} from './reconcile.js';
import {
  resolveInsideAppRoot,
  type TilesetConfig,
  type TilesetsConfig,
} from './config.js';
import {formatTsx, getAttribute, getNumericAttribute, parseTsx} from './tsx.js';

export type ComputedTileset = {
  name: string;
  warnings: string[];
  sourcePath: string;
  sourceText: string;
  outputPath: string;
  outputText: string;
  imagePath: string;
  outputImagePath: string;
  imageBytes: Uint8Array;
  drift: string[];
};

export type ComputeAllResult = {
  computed: ComputedTileset[];
  errors: Error[];
};

function readIfPresent(path: string): Buffer | undefined {
  return existsSync(path) ? readFileSync(path) : undefined;
}

export function computeTileset(appRoot: string, tileset: TilesetConfig): ComputedTileset {
  let sourcePath = resolveInsideAppRoot(appRoot, tileset.source);
  let imagePath = resolveInsideAppRoot(appRoot, tileset.image);
  let outputPath = resolveInsideAppRoot(appRoot, tileset.output);
  let outputImagePath = resolveInsideAppRoot(appRoot, tileset.outputImage);
  let document = parseTsx(readFileSync(sourcePath, 'utf8'));
  let imageBytes = readFileSync(imagePath);
  let transparentColor = getAttribute(document.root.children[0] ?? document.root, 'trans');
  let image = readTilesetImage(imageBytes, {
    tileWidth: getNumericAttribute(document.root, 'tilewidth') ?? 0,
    tileHeight: getNumericAttribute(document.root, 'tileheight') ?? 0,
    margin: getNumericAttribute(document.root, 'margin') ?? 0,
    spacing: getNumericAttribute(document.root, 'spacing') ?? 0,
    solidAlphaThreshold: tileset.solidAlphaThreshold,
    ...(transparentColor === undefined ? {} : {transparentColor: `#${transparentColor.replace('#', '')}`}),
  });
  let {warnings} = reconcile(document, {tileset, image});
  let sourceText = formatTsx(document);
  let outputText = formatJson(document);
  let drift: string[] = [];

  if (readFileSync(sourcePath, 'utf8') !== sourceText) {
    drift.push(`${tileset.source} is out of date`);
  }

  if (readIfPresent(outputPath)?.toString('utf8') !== outputText) {
    drift.push(`${tileset.output} is out of date`);
  }

  if (!readIfPresent(outputImagePath)?.equals(imageBytes)) {
    drift.push(`${tileset.outputImage} is out of date`);
  }

  return {
    name: tileset.name,
    warnings,
    sourcePath,
    sourceText,
    outputPath,
    outputText,
    imagePath,
    outputImagePath,
    imageBytes,
    drift,
  };
}

// Compute everything first, collecting failures, so one run reports every
// problem and the write phase is all-or-nothing.
export function computeAll(appRoot: string, config: TilesetsConfig): ComputeAllResult {
  let computed: ComputedTileset[] = [];
  let errors: Error[] = [];

  for (let tileset of config.tilesets) {
    try {
      computed.push(computeTileset(appRoot, tileset));
    } catch (error) {
      errors.push(
        error instanceof Error ?
          new Error(`Tileset "${tileset.name}": ${error.message}`, {cause: error})
        : new Error(`Tileset "${tileset.name}": ${String(error)}`),
      );
    }
  }

  return {computed: errors.length > 0 ? [] : computed, errors};
}
```

The `transparentColor` read uses `document.root.children[0]` on the assumption that `<image>` is the first child, which Tiled guarantees. If a test shows otherwise, swap in `findChild(document.root, 'image')` — it is only spelled inline here because it is used once.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledCompute.test.ts`
Expected: PASS. The `computeAll` "continues past a failing tileset" case relies on returning no computed tilesets when any failed — that is the all-or-nothing rule, expressed at the compute boundary rather than left to the caller.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/compute.ts apps/somewhere/tests/tiledCompute.test.ts
git commit -m "Compute every tileset before writing any of them"
```

---

## Task 13: `sync-tilesets.ts` — the CLI

A pure function of `(tileset .tsx, image, config)`. Default mode reconciles every configured tileset and writes when content changed. It does not open a map, and importing `evidence/` from the build path is a boundary this task does not cross (Task 15 adds the directory; nothing here may import it).

- `--check` computes everything and writes nothing.
- `--report` prints the resolved decision and geometry per tile without writing, for reviewing a rule change before it touches a file.
- `--import <file.tsx>` is deferred; see the spec's "Future work".

Individual writes are atomic (temp file, then rename), so a crash cannot leave truncated output in `public/`.

**Files:**
- Create: `apps/somewhere/tools/sync-tilesets.ts`
- Test: `apps/somewhere/tests/syncTilesets.test.ts`

**Interfaces:**
- Consumes: `computeAll` (Task 12), `loadConfig` (Task 6), `node:util` `parseArgs`.
- Produces:
  ```ts
  export type RunOptions = {appRoot: string; argv: string[]; log: (message: string) => void};
  export function run(options: RunOptions): Promise<number>; // the exit code
  export function writeArtifacts(computed: ComputedTileset[]): string[]; // paths written
  ```
  The module runs `run` and calls `process.exit` only when it is the entry module, so the tests can drive it in-process.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/syncTilesets.test.ts`:

```ts
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {run} from '../tools/sync-tilesets.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';
let output: string[] = [];

function log(message: string): void {
  output.push(message);
}

beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'sync-tilesets-'));
  output = [];

  mkdirSync(join(appRoot, 'assets'));
  mkdirSync(join(appRoot, 'public'));
  cpSync(join(realAppRoot, 'assets/tileset.tsx'), join(appRoot, 'assets/tileset.tsx'));
  cpSync(join(realAppRoot, 'assets/tileset.png'), join(appRoot, 'assets/tileset.png'));
  cpSync(join(realAppRoot, 'public/tileset.json'), join(appRoot, 'public/tileset.json'));
  cpSync(join(realAppRoot, 'public/tileset.png'), join(appRoot, 'public/tileset.png'));
  cpSync(join(realAppRoot, 'tilesets.config.json'), join(appRoot, 'tilesets.config.json'));
});

afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe('sync-tilesets', () => {
  test('exits 0 and writes nothing when everything is already up to date', async () => {
    let before = readFileSync(join(appRoot, 'public/tileset.json'), 'utf8');

    expect(await run({appRoot, argv: [], log})).toBe(0);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe(before);
  });

  test('--check exits 1 on drift and writes nothing', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    expect(await run({appRoot, argv: ['--check'], log})).toBe(1);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe('{}\n');
  });

  test('--check exits 0 when there is no drift', async () => {
    expect(await run({appRoot, argv: ['--check'], log})).toBe(0);
  });

  test('the default mode repairs drift', async () => {
    let expected = readFileSync(join(appRoot, 'public/tileset.json'), 'utf8');

    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    expect(await run({appRoot, argv: [], log})).toBe(0);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe(expected);
  });

  test('the default mode creates a missing output image', async () => {
    rmSync(join(appRoot, 'public/tileset.png'));

    expect(await run({appRoot, argv: [], log})).toBe(0);
    expect(
      readFileSync(join(appRoot, 'public/tileset.png')).equals(
        readFileSync(join(appRoot, 'assets/tileset.png')),
      ),
    ).toBe(true);
  });

  test('--report prints per-tile decisions and writes nothing', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    expect(await run({appRoot, argv: ['--report'], log})).toBe(0);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe('{}\n');
    expect(output.join('\n')).toMatch(/tile 64/);
  });

  test('exits 2 on a hard error, and 2 wins over drift', async () => {
    rmSync(join(appRoot, 'assets/tileset.png'));

    expect(await run({appRoot, argv: ['--check'], log})).toBe(2);
  });

  test('exits 2 when the config escapes the app root', async () => {
    writeFileSync(
      join(appRoot, 'tilesets.config.json'),
      `${JSON.stringify(
        {
          tilesets: [
            {
              name: 't',
              source: '../../escape.tsx',
              image: 'assets/tileset.png',
              output: 'public/t.json',
              outputImage: 'public/t.png',
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    expect(await run({appRoot, argv: [], log})).toBe(2);
  });

  test('writes nothing at all when any tileset fails to compute', async () => {
    let config = JSON.parse(readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8')) as {
      tilesets: unknown[];
    };

    config.tilesets.push({
      name: 'broken',
      source: 'assets/missing.tsx',
      image: 'assets/missing.png',
      output: 'public/missing.json',
      outputImage: 'public/missing.png',
    });
    writeFileSync(join(appRoot, 'tilesets.config.json'), `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    expect(await run({appRoot, argv: [], log})).toBe(2);
    // The healthy tileset was NOT written: the write phase is all-or-nothing.
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe('{}\n');
    expect(existsSync(join(appRoot, 'public/missing.json'))).toBe(false);
  });

  test('leaves no temp files behind', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    await run({appRoot, argv: [], log});

    expect(existsSync(join(appRoot, 'public/tileset.json.tmp'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/syncTilesets.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/sync-tilesets.ts`**

```ts
import {renameSync, writeFileSync} from 'node:fs';
import {argv, exit} from 'node:process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {computeAll, type ComputedTileset} from './tiled-pipeline/compute.js';
import {loadConfig} from './tiled-pipeline/config.js';
import {computeCollisionBox} from './tiled-pipeline/collision.js';
import {readTilesetImage} from './tiled-pipeline/pixels.js';
import {resolveCollisionMode} from './tiled-pipeline/resolve.js';
import {findChildren, getNumericAttribute, parseTsx} from './tiled-pipeline/tsx.js';
import {readFileSync} from 'node:fs';

export type RunOptions = {
  appRoot: string;
  argv: string[];
  log: (message: string) => void;
};

// Temp file then rename: a crash cannot leave truncated output in public/.
// Node's rename overwrites an existing destination on Windows as well as POSIX.
function writeAtomic(path: string, contents: string | Uint8Array): void {
  let temporaryPath = `${path}.tmp`;

  writeFileSync(temporaryPath, contents);
  renameSync(temporaryPath, path);
}

export function writeArtifacts(computed: ComputedTileset[]): string[] {
  let written: string[] = [];

  for (let tileset of computed) {
    if (tileset.drift.length === 0) {
      continue;
    }

    writeAtomic(tileset.sourcePath, tileset.sourceText);
    writeAtomic(tileset.outputPath, tileset.outputText);
    writeAtomic(tileset.outputImagePath, tileset.imageBytes);
    written.push(tileset.outputPath);
  }

  return written;
}

function report(appRoot: string, log: (message: string) => void): void {
  for (let tileset of loadConfig(appRoot).tilesets) {
    let document = parseTsx(readFileSync(`${appRoot}/${tileset.source}`, 'utf8'));
    let image = readTilesetImage(readFileSync(`${appRoot}/${tileset.image}`), {
      tileWidth: getNumericAttribute(document.root, 'tilewidth') ?? 0,
      tileHeight: getNumericAttribute(document.root, 'tileheight') ?? 0,
      margin: 0,
      spacing: 0,
      solidAlphaThreshold: tileset.solidAlphaThreshold,
    });

    log(`${tileset.name}: ${image.tileCount} tiles`);

    for (let tileId = 0; tileId < image.tileCount; tileId++) {
      let element = findChildren(document.root, 'tile').find(
        (tile) => getNumericAttribute(tile, 'id') === tileId,
      );
      let mode = resolveCollisionMode({tileId, tile: element, collision: tileset.collision});

      if (mode === 'none' && !element) {
        continue;
      }

      let box = computeCollisionBox(
        image.getTileMask(tileId),
        mode,
        tileset.collision.footprintMaxHeight,
      );

      log(`  tile ${tileId}: ${mode}${box ? ` -> ${box.x},${box.y} ${box.width}x${box.height}` : ''}`);
    }
  }
}

export async function run({appRoot, argv: args, log}: RunOptions): Promise<number> {
  let values;

  try {
    ({values} = parseArgs({
      args,
      options: {
        check: {type: 'boolean', default: false},
        report: {type: 'boolean', default: false},
      },
      allowPositionals: true,
    }));
  } catch (error) {
    log(String(error));

    return 2;
  }

  try {
    if (values.report) {
      report(appRoot, log);

      return 0;
    }

    let config = loadConfig(appRoot);
    let {computed, errors} = computeAll(appRoot, config);

    for (let error of errors) {
      log(error.message);
    }

    if (errors.length > 0) {
      return 2;
    }

    for (let tileset of computed) {
      for (let warning of tileset.warnings) {
        log(`warning: ${warning}`);
      }
    }

    let drifted = computed.filter((tileset) => tileset.drift.length > 0);

    if (values.check) {
      for (let tileset of drifted) {
        for (let message of tileset.drift) {
          log(message);
        }
      }

      return drifted.length > 0 ? 1 : 0;
    }

    for (let path of writeArtifacts(computed)) {
      log(`wrote ${path}`);
    }

    return 0;
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));

    return 2;
  }
}

/* c8 ignore start -- entry-module guard, exercised by `npm run sync-tilesets` */
if (argv[1] && import.meta.url === new URL(`file://${argv[1]}`).href) {
  exit(
    await run({
      appRoot: fileURLToPath(new URL('../', import.meta.url)),
      argv: argv.slice(2),
      // eslint-disable-next-line no-console -- this is the CLI's output
      log: (message: string) => console.log(message),
    }),
  );
}
/* c8 ignore stop */
```

If the entry-module guard misbehaves on Windows paths, replace it with the standard `if (process.argv[1] === fileURLToPath(import.meta.url))` form; the shape matters less than that importing the module from a test must not run the CLI.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/syncTilesets.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run the CLI against the real app for the first time**

```powershell
npm run sync-tilesets -- --check
```

Expected: exit 0, no output beyond the runner's. Confirm with `git status --porcelain` that nothing was written.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/sync-tilesets.ts apps/somewhere/tests/syncTilesets.test.ts
git commit -m "Add the sync-tilesets CLI with check, report and atomic writes"
```

---

## Task 14: Retire the `.mjs` tileset export and gate the artifact in CI

The tileset half of `scripts/export-assets.mjs` is deleted: if both it and `sync-tilesets` wrote the tileset they would fight, and the `.mjs` would win with stale data. Its map half keeps rewriting the map's tileset reference from `tileset.tsx` to `tileset.json`, which `tests/exportedAssets.test.ts` asserts.

The `--check` gate runs as a vitest test alongside `tests/exportedAssets.test.ts`, not as a workflow step: all workflows are Carson-generated, the only gate is `npm test`, and shelling out to `tsx` from vitest would add a subprocess dependency on a hoisted binary for no gain. The check must stay write-free — both PR workflows re-run a dirty-tree check after `npm test`.

**Files:**
- Modify: `apps/somewhere/scripts/export-assets.mjs:1-5, 41-46, 69-74`
- Create: `apps/somewhere/tests/tilesetArtifacts.test.ts`

**Interfaces:**
- Consumes: `computeAll`, `loadConfig`.
- Produces: nothing importable; this task's deliverable is the gate.

- [ ] **Step 1: Write the failing test**

`apps/somewhere/tests/tilesetArtifacts.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

import {computeAll} from '../tools/tiled-pipeline/compute.js';
import {loadConfig} from '../tools/tiled-pipeline/config.js';

let appRoot = fileURLToPath(new URL('../', import.meta.url));

// The shipped-asset gate: the same compute path `sync-tilesets --check` uses,
// with the write call removed, so the two cannot disagree. It must stay
// write-free — both PR workflows re-run a dirty-tree check after `npm test`.
describe('the shipped tileset artifacts', () => {
  test('are up to date with assets/tileset.tsx and tilesets.config.json', () => {
    let {computed, errors} = computeAll(appRoot, loadConfig(appRoot));

    expect(errors.map((error) => error.message)).toStrictEqual([]);
    expect(computed.flatMap((tileset) => tileset.drift)).toStrictEqual([]);
  });

  test('reconciliation raises no warnings', () => {
    let {computed} = computeAll(appRoot, loadConfig(appRoot));

    expect(computed.flatMap((tileset) => tileset.warnings)).toStrictEqual([]);
  });
});

describe('scripts/export-assets.mjs', () => {
  test('no longer exports the tileset, so it cannot fight sync-tilesets', () => {
    let script = readFileSync(new URL('../scripts/export-assets.mjs', import.meta.url), 'utf8');

    expect(script).not.toContain('--export-tileset');
    expect(script).toContain('--export-map');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/tilesetArtifacts.test.ts`
Expected: FAIL on the `--export-tileset` assertion (the artifact assertions should already pass, thanks to Task 6's minimal config).

- [ ] **Step 3: Delete the tileset half of the export script**

In `apps/somewhere/scripts/export-assets.mjs`:

Replace the header comment (lines 1-5) with:

```js
// Re-export public/map.json from the Tiled source in assets/. Requires the
// Tiled editor (https://www.mapeditor.org); the Windows installer does not add
// it to PATH, hence the ProgramFiles probe. The tileset is not exported here:
// `npm run sync-tilesets` owns public/tileset.json and public/tileset.png, and
// two writers would fight. If Tiled's preference "Embed tilesets" or a non-CSV
// layer format sneaks into an export, the vitest guard at the end fails loud.
```

Delete the tileset `execFileSync` call (lines 41-46):

```js
execFileSync(tiled, [
  '--export-tileset',
  'json',
  join(root, 'assets/tileset.tsx'),
  join(root, 'public/tileset.json'),
]);
```

Delete the tileset image rewrite (lines 69-74):

```js
let tilesetPath = join(root, 'public/tileset.json');
let tileset = JSON.parse(readFileSync(tilesetPath, 'utf8'));

tileset.image = 'tileset.png';

writeFileSync(tilesetPath, `${JSON.stringify(tileset, null, 2)}\n`);
```

Update the final log line (line 85):

```js
console.log('exported public/map.json');
```

Leave `resolveTiled()` and the map half exactly as they are. Its three-branch Tiled lookup (`TILED_PATH`, then `where`/`which`, then the `%ProgramFiles%\Tiled\tiled.exe` probe that exists because the Windows installer does not touch `PATH`) is **not** imported by `tools/`: `resolveTiled` is not exported and the module has top-level side effects. Nothing in `tools/` needs it, because the `.tsx` is read directly.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project unit tests/tilesetArtifacts.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the whole suite and a clean tree**

```powershell
npm test
```

```bash
git status --porcelain
```

Expected: the suite passes, and `git status` shows only the two files this task touched. A dirty tree here is exactly what the PR workflow would fail on.

- [ ] **Step 6: Commit**

```bash
git add apps/somewhere/scripts/export-assets.mjs apps/somewhere/tests/tilesetArtifacts.test.ts
git commit -m "Retire the .mjs tileset export and gate the shipped artifacts"
```

---

## Task 15: `evidence/map.ts` — analysis-only tile usage

Maps may be *read* as optional evidence during analysis; they are never written, and never read by the build step. Layer classes from maps appear nowhere in the precedence table — they are evidence for a proposal, not an input to a decision. Nothing accepted in `analyze` leaves a dependency on the evidence that suggested it: deleting the demo map afterwards changes no build output.

`evidence/` is imported by `analyze` only. Nothing on the build path (`compute.ts`, `sync-tilesets.ts`) may import it.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/evidence/map.ts`
- Test: `apps/somewhere/tests/tiledMapEvidence.test.ts`

**Interfaces:**
- Consumes: `parseXmlDocument`, `findChild`, `findChildren`, `getAttribute`, `getNumericAttribute` (Task 4); `resolveInsideAppRoot` (Task 6).
- Produces:
  ```ts
  export function collectTileUsage(options: {
    appRoot: string;
    mapPaths: string[];
    layerClasses: string[];
    tilesetSource: string; // e.g. 'assets/tileset.tsx'; matched against the map's <tileset source>
  }): Set<number>; // tile ids, firstgid subtracted, flip flags stripped
  ```

`assets/map.tmx` references the tileset as `<tileset firstgid="1" source="tileset.tsx"/>` — the `source` is relative to the `.tmx`, so match on the basename. The single entity layer is `<layer id="2" name="stuff" class="entities" …>` with `<data encoding="csv">`. Gids carry flip flags in the top four bits; mask with `0x0fffffff` before subtracting `firstgid`. A gid of 0 is an empty cell.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledMapEvidence.test.ts`:

```ts
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {collectTileUsage} from '../tools/tiled-pipeline/evidence/map.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';

function writeMap(name: string, layers: string[]): void {
  writeFileSync(
    join(appRoot, 'assets', name),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<map version="1.10" tiledversion="1.10.2" orientation="orthogonal" renderorder="right-down" width="2" height="2" tilewidth="16" tileheight="16" infinite="0" nextlayerid="3" nextobjectid="1">',
      ' <tileset firstgid="1" source="tileset.tsx"/>',
      ...layers,
      '</map>',
      '',
    ].join('\n'),
  );
}

function layer(name: string, layerClass: string | undefined, csv: string): string[] {
  let classAttribute = layerClass === undefined ? '' : ` class="${layerClass}"`;

  return [
    ` <layer id="1" name="${name}"${classAttribute} width="2" height="2">`,
    '  <data encoding="csv">',
    csv,
    '</data>',
    ' </layer>',
  ];
}

beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'map-evidence-'));

  mkdirSync(join(appRoot, 'assets'));
});

afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe('collectTileUsage', () => {
  test('returns the tile ids used on a matching layer, firstgid subtracted', () => {
    writeMap('map.tmx', layer('stuff', 'entities', '1,2,\n65,0'));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([0, 1, 64]));
  });

  test('ignores layers whose class is not configured', () => {
    writeMap('map.tmx', [
      ...layer('ground', undefined, '5,5,\n5,5'),
      ...layer('stuff', 'entities', '1,0,\n0,0'),
    ]);

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([0]));
  });

  test('strips the flip flags from a gid', () => {
    // 0x80000000 | 2 = a horizontally flipped tile 1.
    writeMap('map.tmx', layer('stuff', 'entities', `${0x8000_0000 + 2},0,\n0,0`));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([1]));
  });

  test('ignores a tileset the map references but the config does not name', () => {
    writeMap('map.tmx', layer('stuff', 'entities', '1,0,\n0,0'));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/map.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/other.tsx',
      }),
    ).toStrictEqual(new Set());
  });

  test('unions across several maps and skips ones that do not exist', () => {
    writeMap('a.tmx', layer('stuff', 'entities', '1,0,\n0,0'));
    writeMap('b.tmx', layer('stuff', 'entities', '3,0,\n0,0'));

    expect(
      collectTileUsage({
        appRoot,
        mapPaths: ['assets/a.tmx', 'assets/b.tmx', 'assets/missing.tmx'],
        layerClasses: ['entities'],
        tilesetSource: 'assets/tileset.tsx',
      }),
    ).toStrictEqual(new Set([0, 2]));
  });

  test('finds the real demo map’s entity-layer usage', () => {
    let used = collectTileUsage({
      appRoot: realAppRoot,
      mapPaths: ['assets/map.tmx'],
      layerClasses: ['entities'],
      tilesetSource: 'assets/tileset.tsx',
    });

    expect(used.size).toBeGreaterThan(0);
    expect(used.has(64)).toBe(true);
  });
});
```

The last case asserts a property of the committed demo map. If it fails, print the set and update the expectation — the map is data, not code.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledMapEvidence.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/evidence/map.ts`**

```ts
import {existsSync, readFileSync} from 'node:fs';
import {basename} from 'node:path';
import {resolveInsideAppRoot} from '../config.js';
import {
  findChildren,
  getAttribute,
  getNumericAttribute,
  parseXmlDocument,
  type XmlElement,
} from '../tsx.js';

// Tiled packs three flip flags plus a hex-120 rotation flag into the top four
// bits of every gid.
const GID_MASK = 0x0fff_ffff;

function collectFromLayer(layer: XmlElement, firstGid: number, used: Set<number>): void {
  for (let data of findChildren(layer, 'data')) {
    if (getAttribute(data, 'encoding') !== 'csv') {
      throw new Error(
        `Map layer "${getAttribute(layer, 'name')}" is not CSV-encoded! Re-export the map from Tiled with "Tile Layer Format: CSV".`,
      );
    }

    for (let entry of (data.text ?? '').split(',')) {
      let gid = Number(entry.trim()) & GID_MASK;

      if (gid >= firstGid) {
        used.add(gid - firstGid);
      }
    }
  }
}

export function collectTileUsage({
  appRoot,
  mapPaths,
  layerClasses,
  tilesetSource,
}: {
  appRoot: string;
  mapPaths: string[];
  layerClasses: string[];
  tilesetSource: string;
}): Set<number> {
  let used = new Set<number>();
  let wanted = basename(tilesetSource);

  for (let mapPath of mapPaths) {
    let resolved = resolveInsideAppRoot(appRoot, mapPath);

    if (!existsSync(resolved)) {
      continue;
    }

    let root = parseXmlDocument(readFileSync(resolved, 'utf8')).root;
    let reference = findChildren(root, 'tileset').find(
      (tileset) => basename(getAttribute(tileset, 'source') ?? '') === wanted,
    );

    if (!reference) {
      continue;
    }

    let firstGid = getNumericAttribute(reference, 'firstgid') ?? 1;

    for (let layer of findChildren(root, 'layer')) {
      if (layerClasses.includes(getAttribute(layer, 'class') ?? '')) {
        collectFromLayer(layer, firstGid, used);
      }
    }
  }

  return used;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledMapEvidence.test.ts`
Expected: PASS.

If the CSV text comes back empty, `parseXmlDocument` dropped the `#text` node — check that `trimValues: true` did not eat a whitespace-only chunk, and that `toElement` assigns `element.text` for `<data>`.

- [ ] **Step 5: Verify the build path does not import evidence**

```powershell
npx eslint tools --rule "{}" ; Select-String -Path tools/tiled-pipeline/compute.ts,tools/sync-tilesets.ts -Pattern "evidence"
```

Expected: no matches. This boundary is stated in the spec as lint-enforced; there is no rule for it yet, so this grep is the check. If you want it enforced mechanically, add an `import/no-restricted-paths` entry to `.carson/project.json` `overrides.eslintConfig` in a follow-up — not in this task.

- [ ] **Step 6: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/evidence apps/somewhere/tests/tiledMapEvidence.test.ts
git commit -m "Read tile usage from configured maps as analysis-only evidence"
```

---

## Task 16: `propose.ts` — the animation detector

The proposer looks for runs of at least 3 consecutive non-empty tiles that differ below `similarityThreshold` (default 0.1), measured over the **union** of the two tiles' non-transparent masks. It rejects runs whose pairwise difference is exactly 0, which are duplicate tiles rather than frames.

Naive pixel similarity does not work on this atlas, and the draft's default of 0.4 would have printed 86 proposals for a tileset with zero animations, 51 of them 2-frame runs, with roughly zero precision. The reason is structural: tile atlases are laid out in *variant families* (recolours, edge variants) which are contiguous and similar — exactly the signature the detector was keyed on. The discriminator that separates them is that a recolour applies a **consistent colour substitution across the whole sprite**, while an animation frame differs in a **spatially localized** part of it. So the proposer additionally rejects a run when the pixel differences between adjacent tiles form a consistent bijective colour mapping over the shared mask.

The detector never writes tile data. Proposals are accepted by writing a region into the config (Task 18).

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/propose.ts`
- Test: `apps/somewhere/tests/tiledAnimationProposer.test.ts`

**Interfaces:**
- Consumes: `TilesetImage` (Task 7).
- Produces:
  ```ts
  export type TileComparison = {difference: number; isRecolour: boolean; isEmptyPair: boolean};
  export function compareTiles(a: Uint8Array, b: Uint8Array): TileComparison;
  export function proposeAnimationRegions(options: {
    image: TilesetImage;
    similarityThreshold: number;
    minimumFrames?: number; // default 3
  }): Array<{start: number; frames: number; duration: number}>;
  ```
  Proposed regions carry `duration: 150` as a placeholder for the human to tune; the detector cannot know timing from pixels.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledAnimationProposer.test.ts`:

```ts
import {readFileSync} from 'node:fs';
import {encode} from 'fast-png';
import {describe, expect, test} from 'vitest';

import {readTilesetImage} from '../tools/tiled-pipeline/pixels.js';
import {compareTiles, proposeAnimationRegions} from '../tools/tiled-pipeline/propose.js';

// Every fixture atlas is 8 tiles wide, 1 tile tall, 16px tiles.
function atlasFrom(painters: Array<(put: (x: number, y: number, rgba: number[]) => void) => void>) {
  let width = painters.length * 16;
  let data = new Uint8Array(width * 16 * 4);

  painters.forEach((paint, tileIndex) => {
    paint((x, y, rgba) => {
      data.set(rgba, ((y * width) + tileIndex * 16 + x) * 4);
    });
  });

  return readTilesetImage(encode({width, height: 16, data, channels: 4, depth: 8}), {
    tileWidth: 16,
    tileHeight: 16,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: 255,
  });
}

// A 12x12 body of one colour, with an optional 2x2 "flame" patch that moves.
function body(color: number[], flame?: {x: number; y: number; color: number[]}) {
  return (put: (x: number, y: number, rgba: number[]) => void) => {
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 14; x++) {
        put(x, y, color);
      }
    }

    if (flame) {
      for (let y = flame.y; y < flame.y + 2; y++) {
        for (let x = flame.x; x < flame.x + 2; x++) {
          put(x, y, flame.color);
        }
      }
    }
  };
}

function empty() {
  return () => {
    // nothing painted
  };
}

describe('compareTiles', () => {
  test('identical tiles differ by 0 and are flagged as a duplicate pair', () => {
    let image = atlasFrom([body([10, 20, 30, 255]), body([10, 20, 30, 255])]);
    let comparison = compareTiles(image.getTilePixels(0), image.getTilePixels(1));

    expect(comparison.difference).toBe(0);
  });

  test('a small localized change is a small difference', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255], {x: 3, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 5, y: 3, color: [255, 0, 0, 255]}),
    ]);

    expect(compareTiles(image.getTilePixels(0), image.getTilePixels(1)).difference).toBeLessThan(
      0.1,
    );
  });

  test('a whole-sprite recolour is flagged, however it scores', () => {
    let image = atlasFrom([body([10, 20, 30, 255]), body([200, 40, 60, 255])]);

    expect(compareTiles(image.getTilePixels(0), image.getTilePixels(1)).isRecolour).toBe(true);
  });

  test('a localized change is not a recolour', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255], {x: 3, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 5, y: 3, color: [255, 0, 0, 255]}),
    ]);

    expect(compareTiles(image.getTilePixels(0), image.getTilePixels(1)).isRecolour).toBe(false);
  });
});

describe('proposeAnimationRegions', () => {
  test('finds a four-frame run of localized changes', () => {
    let image = atlasFrom([
      empty(),
      body([10, 20, 30, 255], {x: 3, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 5, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 7, y: 3, color: [255, 0, 0, 255]}),
      body([10, 20, 30, 255], {x: 9, y: 3, color: [255, 0, 0, 255]}),
      empty(),
    ]);

    expect(proposeAnimationRegions({image, similarityThreshold: 0.1})).toStrictEqual([
      {start: 1, frames: 4, duration: 150},
    ]);
  });

  test('rejects a recolour family, which is what a naive detector reports', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255]),
      body([40, 50, 60, 255]),
      body([70, 80, 90, 255]),
      body([100, 110, 120, 255]),
    ]);

    expect(proposeAnimationRegions({image, similarityThreshold: 1})).toStrictEqual([]);
  });

  test('rejects duplicate tiles, which differ by exactly 0', () => {
    let image = atlasFrom([
      body([10, 20, 30, 255]),
      body([10, 20, 30, 255]),
      body([10, 20, 30, 255]),
    ]);

    expect(proposeAnimationRegions({image, similarityThreshold: 0.1})).toStrictEqual([]);
  });

  test('will not start a run on an empty tile', () => {
    let image = atlasFrom([empty(), empty(), empty()]);

    expect(proposeAnimationRegions({image, similarityThreshold: 0.1})).toStrictEqual([]);
  });

  test('reports nothing on the real atlas, which has no animations', () => {
    let image = readTilesetImage(readFileSync(new URL('../assets/tileset.png', import.meta.url)), {
      tileWidth: 16,
      tileHeight: 16,
      margin: 0,
      spacing: 0,
      solidAlphaThreshold: 255,
      transparentColor: '#ff00cc',
    });

    expect(proposeAnimationRegions({image, similarityThreshold: 0.1})).toStrictEqual([]);
  });
});
```

The last case is the one that matters: the atlas has zero animations, so the correct output is zero proposals. If it reports any, tighten the detector rather than the expectation — a proposer with poor precision is worse than none, because it trains the human to skim past its output.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledAnimationProposer.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/propose.ts`**

```ts
import {type TilesetImage} from './pixels.js';

export type TileComparison = {
  difference: number;
  isRecolour: boolean;
  isEmptyPair: boolean;
};

function packColor(pixels: Uint8Array, index: number): number {
  return (
    ((pixels[index * 4] as number) << 24) |
    ((pixels[index * 4 + 1] as number) << 16) |
    ((pixels[index * 4 + 2] as number) << 8) |
    (pixels[index * 4 + 3] as number)
  );
}

// Difference over the UNION of the two masks, so a frame that grows or shrinks
// is not scored against the smaller one. A recolour applies a consistent
// substitution across the whole sprite; an animation frame differs in a
// spatially localized part of it, so a bijection over the shared mask is the
// discriminator that separates the two.
export function compareTiles(a: Uint8Array, b: Uint8Array): TileComparison {
  let union = 0;
  let differing = 0;
  let forward = new Map<number, number>();
  let backward = new Map<number, number>();
  let bijective = true;

  for (let index = 0; index < a.length / 4; index++) {
    let alphaA = a[index * 4 + 3] as number;
    let alphaB = b[index * 4 + 3] as number;

    if (alphaA === 0 && alphaB === 0) {
      continue;
    }

    union++;

    let colorA = packColor(a, index);
    let colorB = packColor(b, index);

    if (colorA === colorB) {
      continue;
    }

    differing++;

    if (alphaA === 0 || alphaB === 0) {
      bijective = false;

      continue;
    }

    let mapped = forward.get(colorA);
    let reverse = backward.get(colorB);

    if ((mapped !== undefined && mapped !== colorB) || (reverse !== undefined && reverse !== colorA)) {
      bijective = false;
    }

    forward.set(colorA, colorB);
    backward.set(colorB, colorA);
  }

  return {
    difference: union === 0 ? 0 : differing / union,
    isRecolour: differing > 0 && bijective,
    isEmptyPair: union === 0,
  };
}

export function proposeAnimationRegions({
  image,
  similarityThreshold,
  minimumFrames = 3,
}: {
  image: TilesetImage;
  similarityThreshold: number;
  minimumFrames?: number;
}): Array<{start: number; frames: number; duration: number}> {
  let proposals: Array<{start: number; frames: number; duration: number}> = [];
  let runStart = 0;
  let runLength = 1;

  let flush = () => {
    if (runLength >= minimumFrames) {
      // 150 ms is a placeholder: the detector cannot know timing from pixels.
      proposals.push({start: runStart, frames: runLength, duration: 150});
    }

    runLength = 1;
  };

  for (let tileId = 1; tileId < image.tileCount; tileId++) {
    let comparison = compareTiles(image.getTilePixels(tileId - 1), image.getTilePixels(tileId));
    let continues =
      !comparison.isEmptyPair &&
      !comparison.isRecolour &&
      comparison.difference > 0 &&
      comparison.difference < similarityThreshold;

    if (continues) {
      runLength++;

      continue;
    }

    flush();
    runStart = tileId;
  }

  flush();

  return proposals;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledAnimationProposer.test.ts`
Expected: PASS, including zero proposals on the real atlas.

If the real atlas produces proposals, print them (`console.log` in the test, then remove) and look at what they are. Expect variant families; the fix is in `isRecolour`, not in the threshold.

- [ ] **Step 5: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/propose.ts apps/somewhere/tests/tiledAnimationProposer.test.ts
git commit -m "Propose animation regions while rejecting recolour families"
```

---

## Task 17: `analyze.ts` — the report, `--json` and `--print-config`

`sync-tilesets analyze` reads the tileset, its image and every configured evidence source. Writes nothing without saying what it is about to write. Its job is to turn diffuse signal into durable, reviewable state.

What it reports:

- **Image profile.** Distinct alpha levels present, and the colours found at each. This is how `solidAlphaThreshold` gets chosen from evidence rather than guessed.
- **Tile inventory.** Counts of empty, fully solid and partial tiles.
- **Candidate collision sets**, each with its provenance, so an ad hoc signal is visibly ad hoc: tiles already carrying a manual box; tiles whose Tiled class maps to a mode in `collision.tileClasses`; tiles inside a configured `collision.regions` range; tiles used on a layer whose class is in `analysis.collisionLayerClasses`, in a configured map.
- **Proposed geometry** per candidate, plus a diff against any existing box on that tile.
- **Proposed animation regions** from the detector.
- **Conflicts and gaps:** candidates with no proposal, existing auto data with no candidate.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/analyze.ts`
- Modify: `apps/somewhere/tools/sync-tilesets.ts`
- Test: `apps/somewhere/tests/tiledAnalyze.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 6, 7, 8, 9, 15, 16.
- Produces:
  ```ts
  export type CandidateSource = 'manual' | 'tileClass' | 'region' | 'mapLayer';
  export type CollisionCandidate = {
    tileId: number;
    sources: CandidateSource[];
    mode: CollisionMode;
    proposed: CollisionBox | undefined;
    existing: CollisionBox | undefined;
  };
  export type AnalysisReport = {
    tilesetName: string;
    alphaLevels: Array<{alpha: number; count: number; colors: string[]}>;
    inventory: {empty: number; full: number; partial: number};
    candidates: CollisionCandidate[];
    animationProposals: Array<{start: number; frames: number; duration: number}>;
    conflicts: string[];
  };
  export function analyzeTileset(options: {
    appRoot: string;
    tileset: TilesetConfig;
    analysis: TilesetsConfig['analysis'];
  }): AnalysisReport;
  export function formatReport(report: AnalysisReport): string;
  export function toConfigFragment(report: AnalysisReport): string; // a pasteable JSON fragment
  ```

`--json` prints `JSON.stringify(reports, null, 2)`; `--print-config` prints `toConfigFragment`.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledAnalyze.test.ts`:

```ts
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

import {analyzeTileset, formatReport, toConfigFragment} from '../tools/tiled-pipeline/analyze.js';
import {loadConfig} from '../tools/tiled-pipeline/config.js';

let appRoot = fileURLToPath(new URL('../', import.meta.url));

function analyzeReal() {
  let config = loadConfig(appRoot);

  return analyzeTileset({appRoot, tileset: config.tilesets[0]!, analysis: config.analysis});
}

describe('analyzeTileset', () => {
  test('reports the atlas alpha profile, including the shadow levels', () => {
    expect(analyzeReal().alphaLevels.map((level) => level.alpha)).toStrictEqual([0, 76, 102, 255]);
  });

  test('names the colour found at the shadow level, which is how the threshold gets chosen', () => {
    let shadow = analyzeReal().alphaLevels.find((level) => level.alpha === 102)!;

    expect(shadow.count).toBe(1686);
    expect(shadow.colors).toContain('rgba(0, 0, 0, 102)');
  });

  test('counts empty, fully solid and partial tiles', () => {
    expect(analyzeReal().inventory).toStrictEqual({empty: 3094, full: 187, partial: 815});
  });

  test('the eight authored tiles are candidates with manual provenance', () => {
    let manual = analyzeReal().candidates.filter((candidate) =>
      candidate.sources.includes('manual'),
    );

    expect(manual.map((candidate) => candidate.tileId)).toStrictEqual([
      64, 66, 128, 129, 130, 192, 193, 194,
    ]);
  });

  test('the demo map contributes mapLayer candidates', () => {
    expect(
      analyzeReal().candidates.some((candidate) => candidate.sources.includes('mapLayer')),
    ).toBe(true);
  });

  test('each candidate carries its proposed geometry and the box already there', () => {
    let tile64 = analyzeReal().candidates.find((candidate) => candidate.tileId === 64)!;

    expect(tile64.proposed).toStrictEqual({x: 2, y: 8, width: 12, height: 8});
    expect(tile64.existing).toStrictEqual({x: 2, y: 8, width: 12, height: 8});
  });

  test('the one tile where the proposal disagrees with the author is visible in the report', () => {
    let tile193 = analyzeReal().candidates.find((candidate) => candidate.tileId === 193)!;

    expect(tile193.existing).toStrictEqual({x: 0, y: 0, width: 16, height: 8});
    expect(tile193.proposed).toStrictEqual({x: 0, y: 0, width: 16, height: 7});
  });

  test('proposes no animations on an atlas that has none', () => {
    expect(analyzeReal().animationProposals).toStrictEqual([]);
  });

  test('an absent analysis block is complete and yields no mapLayer candidates', () => {
    let config = loadConfig(appRoot);
    let report = analyzeTileset({appRoot, tileset: config.tilesets[0]!, analysis: undefined});

    expect(report.candidates.every((candidate) => !candidate.sources.includes('mapLayer'))).toBe(
      true,
    );
  });
});

describe('report rendering', () => {
  test('formatReport names every section a human needs', () => {
    let text = formatReport(analyzeReal());

    expect(text).toMatch(/alpha/i);
    expect(text).toMatch(/inventory/i);
    expect(text).toMatch(/candidate/i);
    expect(text).toContain('tile 193');
  });

  test('toConfigFragment emits parseable JSON with the candidate ranges', () => {
    let fragment = JSON.parse(toConfigFragment(analyzeReal())) as {
      collision: {regions: Array<{range: [number, number]; mode: string}>};
    };

    expect(fragment.collision.regions.length).toBeGreaterThan(0);
    expect(fragment.collision.regions[0]!.mode).toBe('bbox');
  });
});
```

The inventory counts and the candidate list are measurements of the committed atlas and map. If they differ, print and update the expectations — but check the *reason* first, because a changed count means the art changed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledAnalyze.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/analyze.ts`**

```ts
import {readFileSync} from 'node:fs';
import {type CollisionBox, computeCollisionBox} from './collision.js';
import {
  type CollisionMode,
  resolveInsideAppRoot,
  type TilesetConfig,
  type TilesetsConfig,
} from './config.js';
import {collectTileUsage} from './evidence/map.js';
import {readTilesetImage, type TilesetImage} from './pixels.js';
import {proposeAnimationRegions} from './propose.js';
import {getTileClass, isAutoObject} from './resolve.js';
import {
  findChild,
  findChildren,
  getAttribute,
  getNumericAttribute,
  parseTsx,
  type XmlElement,
} from './tsx.js';

export type CandidateSource = 'manual' | 'tileClass' | 'region' | 'mapLayer';

export type CollisionCandidate = {
  tileId: number;
  sources: CandidateSource[];
  mode: CollisionMode;
  proposed: CollisionBox | undefined;
  existing: CollisionBox | undefined;
};

export type AnalysisReport = {
  tilesetName: string;
  alphaLevels: Array<{alpha: number; count: number; colors: string[]}>;
  inventory: {empty: number; full: number; partial: number};
  candidates: CollisionCandidate[];
  animationProposals: Array<{start: number; frames: number; duration: number}>;
  conflicts: string[];
};

function describeAlphaLevels(image: TilesetImage): AnalysisReport['alphaLevels'] {
  let colorsByAlpha = new Map<number, Set<string>>();

  for (let tileId = 0; tileId < image.tileCount; tileId++) {
    let pixels = image.getTilePixels(tileId);

    for (let index = 0; index < pixels.length / 4; index++) {
      let alpha = pixels[index * 4 + 3] as number;
      let colors = colorsByAlpha.get(alpha) ?? new Set<string>();

      // Cap the sample: the point is to name the colours at a level, not to
      // enumerate an atlas's whole palette.
      if (colors.size < 8) {
        colors.add(
          `rgba(${pixels[index * 4]}, ${pixels[index * 4 + 1]}, ${pixels[index * 4 + 2]}, ${alpha})`,
        );
      }

      colorsByAlpha.set(alpha, colors);
    }
  }

  return [...image.alphaLevels.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([alpha, count]) => ({alpha, count, colors: [...(colorsByAlpha.get(alpha) ?? [])].sort()}));
}

function existingBox(tile: XmlElement | undefined): CollisionBox | undefined {
  let group = tile ? findChild(tile, 'objectgroup') : undefined;
  let object = group ? findChildren(group, 'object')[0] : undefined;

  return object ?
      {
        x: getNumericAttribute(object, 'x') ?? 0,
        y: getNumericAttribute(object, 'y') ?? 0,
        width: getNumericAttribute(object, 'width') ?? 0,
        height: getNumericAttribute(object, 'height') ?? 0,
      }
    : undefined;
}

export function analyzeTileset({
  appRoot,
  tileset,
  analysis,
}: {
  appRoot: string;
  tileset: TilesetConfig;
  analysis: TilesetsConfig['analysis'];
}): AnalysisReport {
  let document = parseTsx(readFileSync(resolveInsideAppRoot(appRoot, tileset.source), 'utf8'));
  let imageElement = findChild(document.root, 'image');
  let transparent = imageElement ? getAttribute(imageElement, 'trans') : undefined;
  let image = readTilesetImage(readFileSync(resolveInsideAppRoot(appRoot, tileset.image)), {
    tileWidth: getNumericAttribute(document.root, 'tilewidth') ?? 0,
    tileHeight: getNumericAttribute(document.root, 'tileheight') ?? 0,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: tileset.solidAlphaThreshold,
    ...(transparent === undefined ? {} : {transparentColor: `#${transparent.replace('#', '')}`}),
  });
  let tiles = new Map(
    findChildren(document.root, 'tile').map((tile) => [getNumericAttribute(tile, 'id') ?? 0, tile]),
  );
  let usedOnCollisionLayers =
    analysis ?
      collectTileUsage({
        appRoot,
        mapPaths: analysis.maps,
        layerClasses: analysis.collisionLayerClasses,
        tilesetSource: tileset.source,
      })
    : new Set<number>();
  let inventory = {empty: 0, full: 0, partial: 0};
  let sourcesByTile = new Map<number, CandidateSource[]>();

  let addSource = (tileId: number, source: CandidateSource) => {
    sourcesByTile.set(tileId, [...(sourcesByTile.get(tileId) ?? []), source]);
  };

  for (let tileId = 0; tileId < image.tileCount; tileId++) {
    let solid = image.getTileMask(tileId).solid.filter(Boolean).length;

    if (solid === 0) {
      inventory.empty++;
    } else if (solid === image.getTileMask(tileId).solid.length) {
      inventory.full++;
    } else {
      inventory.partial++;
    }

    let tile = tiles.get(tileId);
    let group = tile ? findChild(tile, 'objectgroup') : undefined;
    let tileClass = getTileClass(tile);

    if (group && findChildren(group, 'object').some((object) => !isAutoObject(object))) {
      addSource(tileId, 'manual');
    }

    if (tileClass !== undefined && tileset.collision.tileClasses[tileClass] !== undefined) {
      addSource(tileId, 'tileClass');
    }

    if (
      tileset.collision.regions.some(
        (region) => tileId >= region.range[0] && tileId <= region.range[1],
      )
    ) {
      addSource(tileId, 'region');
    }

    if (usedOnCollisionLayers.has(tileId) && solid > 0) {
      addSource(tileId, 'mapLayer');
    }
  }

  let candidates: CollisionCandidate[] = [];
  let conflicts: string[] = [];

  for (let [tileId, sources] of [...sourcesByTile.entries()].sort((a, b) => a[0] - b[0])) {
    let tile = tiles.get(tileId);
    let tileClass = getTileClass(tile);
    let mode: CollisionMode =
      tileset.collision.regions.find(
        (region) => tileId >= region.range[0] && tileId <= region.range[1],
      )?.mode ??
      (tileClass === undefined ? undefined : tileset.collision.tileClasses[tileClass]) ??
      'bbox';
    let proposed = computeCollisionBox(
      image.getTileMask(tileId),
      mode,
      tileset.collision.footprintMaxHeight,
    );

    if (!proposed) {
      conflicts.push(`tile ${tileId} is a candidate but has no solid pixels to propose a box from`);
    }

    candidates.push({tileId, sources, mode, proposed, existing: existingBox(tile)});
  }

  for (let [tileId, tile] of tiles) {
    let group = findChild(tile, 'objectgroup');

    if (
      group &&
      findChildren(group, 'object').some((object) => isAutoObject(object)) &&
      !sourcesByTile.has(tileId)
    ) {
      conflicts.push(`tile ${tileId} carries auto collision data but no rule claims it`);
    }
  }

  return {
    tilesetName: tileset.name,
    alphaLevels: describeAlphaLevels(image),
    inventory,
    candidates,
    animationProposals: proposeAnimationRegions({
      image,
      similarityThreshold: tileset.animations.similarityThreshold,
    }),
    conflicts,
  };
}

function describeBox(box: CollisionBox | undefined): string {
  return box ? `${box.x},${box.y} ${box.width}x${box.height}` : '-';
}

export function formatReport(report: AnalysisReport): string {
  let lines = [`# ${report.tilesetName}`, '', '## Alpha levels'];

  for (let level of report.alphaLevels) {
    lines.push(`  ${level.alpha}: ${level.count} px  ${level.colors.slice(0, 4).join(' ')}`);
  }

  lines.push(
    '',
    '## Inventory',
    `  empty ${report.inventory.empty}, full ${report.inventory.full}, partial ${report.inventory.partial}`,
    '',
    `## Candidates (${report.candidates.length})`,
  );

  for (let candidate of report.candidates) {
    let change =
      describeBox(candidate.existing) === describeBox(candidate.proposed) ? 'unchanged' : (
        `${describeBox(candidate.existing)} -> ${describeBox(candidate.proposed)}`
      );

    lines.push(`  tile ${candidate.tileId} [${candidate.sources.join(', ')}] ${candidate.mode}  ${change}`);
  }

  lines.push('', `## Animation proposals (${report.animationProposals.length})`);

  for (let proposal of report.animationProposals) {
    lines.push(`  tiles ${proposal.start}..${proposal.start + proposal.frames - 1}`);
  }

  lines.push('', `## Conflicts and gaps (${report.conflicts.length})`, ...report.conflicts.map((conflict) => `  ${conflict}`));

  return lines.join('\n');
}

// Contiguous candidate ids collapse into ranges, which is the shape the config
// wants and the shape a human can read.
export function toConfigFragment(report: AnalysisReport): string {
  let regions: Array<{range: [number, number]; mode: CollisionMode}> = [];

  for (let candidate of report.candidates) {
    let last = regions.at(-1);

    if (last && last.mode === candidate.mode && last.range[1] === candidate.tileId - 1) {
      last.range[1] = candidate.tileId;

      continue;
    }

    regions.push({range: [candidate.tileId, candidate.tileId], mode: candidate.mode});
  }

  return `${JSON.stringify(
    {collision: {regions}, animations: {regions: report.animationProposals}},
    null,
    2,
  )}\n`;
}
```

- [ ] **Step 4: Wire `analyze` into the CLI**

In `tools/sync-tilesets.ts`, add the options and the command dispatch. Add to `parseArgs`:

```ts
        json: {type: 'boolean', default: false},
        'print-config': {type: 'boolean', default: false},
```

and take the command from the positionals. Immediately after `let config = loadConfig(appRoot);`, before `computeAll`:

```ts
    if (positionals[0] === 'analyze') {
      let reports = config.tilesets.map((tileset) =>
        analyzeTileset({appRoot, tileset, analysis: config.analysis}),
      );

      if (values.json) {
        log(JSON.stringify(reports, null, 2));
      } else if (values['print-config']) {
        for (let report of reports) {
          log(toConfigFragment(report));
        }
      } else {
        for (let report of reports) {
          log(formatReport(report));
        }
      }

      return 0;
    }
```

Destructure `positionals` alongside `values` from `parseArgs`, and import `analyzeTileset`, `formatReport` and `toConfigFragment` from `./tiled-pipeline/analyze.js`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledAnalyze.test.ts tests/syncTilesets.test.ts`
Expected: PASS.

- [ ] **Step 6: Run analyze against the real app**

```powershell
npm run sync-tilesets -- analyze
npm run sync-tilesets -- analyze --print-config
```

Expected: a report naming the four alpha levels, the inventory, the candidate tiles with their provenance, and zero animation proposals. Confirm `git status --porcelain` is clean — analyze wrote nothing.

- [ ] **Step 7: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/analyze.ts apps/somewhere/tools/sync-tilesets.ts apps/somewhere/tests/tiledAnalyze.test.ts
git commit -m "Add the analyze phase: image profile, candidates and proposals"
```

---

## Task 18: Interactive accept / skip / never

Interactive is `analyze`'s default mode (`--json` and `--print-config` opt out). Per candidate group: **accept**, **skip**, **mark as never**. Accepting a proposal writes it to durable state — a `collision.regions` entry or a tile property. **Nothing accepted here leaves a dependency on the evidence that suggested it**: deleting the demo map afterwards changes no build output.

Writes go through prettier, because `JSON.stringify(value, null, 2)` is not prettier-stable for this config (verified: prettier collapses `"range": [\n 128,\n 194\n]` to `"range": [128, 194]`), and the config sits at the app root where `npm run format` will reach it. Prettier is already an app devDependency; nothing on the build path imports it.

**Files:**
- Create: `apps/somewhere/tools/tiled-pipeline/accept.ts`
- Modify: `apps/somewhere/tools/sync-tilesets.ts`
- Test: `apps/somewhere/tests/tiledAccept.test.ts`

**Interfaces:**
- Consumes: `AnalysisReport`, `CollisionCandidate` (Task 17); `prettier`; `node:readline/promises`.
- Produces:
  ```ts
  export type CandidateGroup = {
    key: string; // e.g. 'mapLayer:bbox:128-130'
    label: string; // what the prompt shows
    mode: CollisionMode;
    sources: CandidateSource[];
    tileIds: number[];
  };
  export type Decision = 'accept' | 'skip' | 'never';

  export function groupCandidates(report: AnalysisReport): CandidateGroup[];
  export function applyDecisions(options: {
    appRoot: string;
    tilesetName: string;
    decisions: Array<{group: CandidateGroup; decision: Decision}>;
    animationProposals: Array<{proposal: {start: number; frames: number; duration: number}; decision: Decision}>;
  }): Promise<string[]>; // the paths written
  ```
  `applyDecisions` is separated from the prompting so the write semantics are testable without a TTY. The CLI owns the `readline` loop and calls it once at the end, after printing exactly what it is about to write.

Decision semantics:

- **accept** on a collision group → append `{range, mode}` entries to `tilesets.config.json` (contiguous ids collapse into one range).
- **never** on a collision group → set the tile property `autoCollision: false` on each tile in `assets/*.tsx`. This is a durable, tileset-intrinsic claim, and it also *deletes* any auto box already there on the next sync (Task 11's invariant).
- **skip** → nothing at all, so the same group is offered again next run.
- **accept** on an animation proposal → append `{start, frames, duration}` to `animations.regions`.

- [ ] **Step 1: Write the failing tests**

`apps/somewhere/tests/tiledAccept.test.ts`:

```ts
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {applyDecisions, type CandidateGroup, groupCandidates} from '../tools/tiled-pipeline/accept.js';
import {analyzeTileset} from '../tools/tiled-pipeline/analyze.js';
import {loadConfig} from '../tools/tiled-pipeline/config.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';

beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'tiled-accept-'));

  mkdirSync(join(appRoot, 'assets'));
  mkdirSync(join(appRoot, 'public'));
  cpSync(join(realAppRoot, 'assets/tileset.tsx'), join(appRoot, 'assets/tileset.tsx'));
  cpSync(join(realAppRoot, 'assets/tileset.png'), join(appRoot, 'assets/tileset.png'));
  cpSync(join(realAppRoot, 'assets/map.tmx'), join(appRoot, 'assets/map.tmx'));
  cpSync(join(realAppRoot, 'tilesets.config.json'), join(appRoot, 'tilesets.config.json'));
});

afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

function report() {
  let config = loadConfig(appRoot);

  return analyzeTileset({appRoot, tileset: config.tilesets[0]!, analysis: config.analysis});
}

function group(tileIds: number[]): CandidateGroup {
  return {key: `test:bbox:${tileIds[0]}`, label: 'test', mode: 'bbox', sources: ['mapLayer'], tileIds};
}

describe('groupCandidates', () => {
  test('groups by provenance and mode, and collapses contiguous ids', () => {
    let groups = groupCandidates(report());

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((entry) => entry.tileIds.length > 0)).toBe(true);
    expect(new Set(groups.map((entry) => entry.key)).size).toBe(groups.length);
  });
});

describe('applyDecisions', () => {
  test('accept appends a collision region and leaves the file prettier-clean', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([128, 129, 130]), decision: 'accept'}],
      animationProposals: [],
    });

    let text = readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8');

    expect(text).toContain('"range": [128, 130]');
    expect(text).toContain('"mode": "bbox"');
    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toHaveLength(1);
  });

  test('a non-contiguous group becomes several ranges', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([64, 66]), decision: 'accept'}],
      animationProposals: [],
    });

    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toStrictEqual([
      {range: [64, 64], mode: 'bbox'},
      {range: [66, 66], mode: 'bbox'},
    ]);
  });

  test('never writes autoCollision false onto each tile and touches no config', async () => {
    let before = readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8');

    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([64]), decision: 'never'}],
      animationProposals: [],
    });

    let tsx = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');

    expect(tsx).toContain('<property name="autoCollision" type="bool" value="false"/>');
    expect(tsx).toContain('\r\n'); // the writer preserved the source newline
    expect(readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8')).toBe(before);
  });

  test('skip writes nothing at all', async () => {
    let config = readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8');
    let tsx = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');

    expect(
      await applyDecisions({
        appRoot,
        tilesetName: 'tileset',
        decisions: [{group: group([64]), decision: 'skip'}],
        animationProposals: [],
      }),
    ).toStrictEqual([]);
    expect(readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8')).toBe(config);
    expect(readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8')).toBe(tsx);
  });

  test('accepting an animation proposal appends an animation region', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [],
      animationProposals: [{proposal: {start: 256, frames: 4, duration: 150}, decision: 'accept'}],
    });

    expect(loadConfig(appRoot).tilesets[0]!.animations.regions).toStrictEqual([
      {start: 256, frames: 4, duration: 150},
    ]);
  });

  test('accepting the same group twice does not duplicate the region', async () => {
    let options = {
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([128, 130]), decision: 'accept' as const}],
      animationProposals: [],
    };

    await applyDecisions(options);
    await applyDecisions(options);

    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toHaveLength(2);
  });

  test('nothing accepted leaves a dependency on the map that suggested it', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([128, 130]), decision: 'accept'}],
      animationProposals: [],
    });

    rmSync(join(appRoot, 'assets/map.tmx'));

    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toHaveLength(2);
  });
});
```

The "twice does not duplicate" case expects 2 because `[128, 130]` is non-contiguous (129 is absent from the group) and therefore two ranges; the point is that the second run adds none.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/tiledAccept.test.ts`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `tools/tiled-pipeline/accept.ts`**

```ts
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {format, resolveConfig} from 'prettier';
import {
  type AnalysisReport,
  type CandidateSource,
} from './analyze.js';
import {
  type AnimationRegion,
  type CollisionMode,
  DEFAULT_CONFIG_FILE_NAME,
  resolveInsideAppRoot,
  tilesetsConfigSchema,
} from './config.js';
import {AUTO_COLLISION_PROPERTY} from './reconcile.js';
import {
  createElement,
  findChild,
  findChildren,
  formatTsx,
  getAttribute,
  getNumericAttribute,
  parseTsx,
  setAttribute,
} from './tsx.js';

export type CandidateGroup = {
  key: string;
  label: string;
  mode: CollisionMode;
  sources: CandidateSource[];
  tileIds: number[];
};

export type Decision = 'accept' | 'skip' | 'never';

function toRanges(tileIds: number[]): Array<[number, number]> {
  let ranges: Array<[number, number]> = [];

  for (let tileId of [...tileIds].sort((a, b) => a - b)) {
    let last = ranges.at(-1);

    if (last && last[1] === tileId - 1) {
      last[1] = tileId;

      continue;
    }

    ranges.push([tileId, tileId]);
  }

  return ranges;
}

export function groupCandidates(report: AnalysisReport): CandidateGroup[] {
  let byKey = new Map<string, CandidateGroup>();

  for (let candidate of report.candidates) {
    let sources = [...candidate.sources].sort();
    let key = `${sources.join('+')}:${candidate.mode}`;
    let group = byKey.get(key);

    if (!group) {
      group = {
        key,
        label: `${sources.join(' + ')} -> ${candidate.mode}`,
        mode: candidate.mode,
        sources: candidate.sources,
        tileIds: [],
      };
      byKey.set(key, group);
    }

    group.tileIds.push(candidate.tileId);
  }

  return [...byKey.values()];
}

// JSON.stringify is not prettier-stable for this shape (prettier collapses
// short arrays), and the config sits at the app root where `npm run format`
// reaches it. Formatting on write is what keeps the two from fighting.
async function writeConfig(appRoot: string, value: unknown): Promise<string> {
  let path = join(appRoot, DEFAULT_CONFIG_FILE_NAME);
  let options = await resolveConfig(path);

  writeFileSync(
    path,
    await format(JSON.stringify(value, null, 2), {...options, filepath: path}),
  );

  return path;
}

function suppressTiles(appRoot: string, source: string, tileIds: number[]): string {
  let path = resolveInsideAppRoot(appRoot, source);
  let document = parseTsx(readFileSync(path, 'utf8'));

  for (let tileId of tileIds) {
    let tile =
      findChildren(document.root, 'tile').find(
        (entry) => getNumericAttribute(entry, 'id') === tileId,
      ) ?? createElement('tile', {id: String(tileId)});

    if (!document.root.children.includes(tile)) {
      document.root.children.push(tile);
    }

    let properties = findChild(tile, 'properties') ?? createElement('properties', {});

    if (!tile.children.includes(properties)) {
      tile.children.unshift(properties);
    }

    let property = findChildren(properties, 'property').find(
      (entry) => getAttribute(entry, 'name') === AUTO_COLLISION_PROPERTY,
    );

    if (property) {
      setAttribute(property, 'type', 'bool');
      setAttribute(property, 'value', 'false');
    } else {
      properties.children.push(
        createElement('property', {name: AUTO_COLLISION_PROPERTY, type: 'bool', value: 'false'}),
      );
    }
  }

  document.root.children.sort((a, b) => {
    if (a.name !== 'tile' || b.name !== 'tile') {
      return 0;
    }

    return (getNumericAttribute(a, 'id') ?? 0) - (getNumericAttribute(b, 'id') ?? 0);
  });

  writeFileSync(path, formatTsx(document));

  return path;
}

export async function applyDecisions({
  appRoot,
  tilesetName,
  decisions,
  animationProposals,
}: {
  appRoot: string;
  tilesetName: string;
  decisions: Array<{group: CandidateGroup; decision: Decision}>;
  animationProposals: Array<{proposal: AnimationRegion; decision: Decision}>;
}): Promise<string[]> {
  let configPath = join(appRoot, DEFAULT_CONFIG_FILE_NAME);
  let raw = JSON.parse(readFileSync(configPath, 'utf8')) as {
    tilesets: Array<Record<string, unknown>>;
  };
  let entry = raw.tilesets.find((tileset) => tileset['name'] === tilesetName);

  if (!entry) {
    throw new Error(`No tileset named "${tilesetName}" in ${DEFAULT_CONFIG_FILE_NAME}!`);
  }

  let collision = (entry['collision'] ?? {}) as {
    regions?: Array<{range: [number, number]; mode: CollisionMode}>;
  };
  let animations = (entry['animations'] ?? {}) as {regions?: AnimationRegion[]};
  let regions = collision.regions ?? [];
  let animationRegions = animations.regions ?? [];
  let written: string[] = [];
  let configChanged = false;

  for (let {group, decision} of decisions) {
    if (decision === 'accept') {
      for (let range of toRanges(group.tileIds)) {
        let duplicate = regions.some(
          (existing) =>
            existing.range[0] === range[0] &&
            existing.range[1] === range[1] &&
            existing.mode === group.mode,
        );

        if (!duplicate) {
          regions.push({range, mode: group.mode});
          configChanged = true;
        }
      }
    }

    if (decision === 'never') {
      written.push(suppressTiles(appRoot, String(entry['source']), group.tileIds));
    }
  }

  for (let {proposal, decision} of animationProposals) {
    if (decision !== 'accept') {
      continue;
    }

    let duplicate = animationRegions.some((existing) => existing.start === proposal.start);

    if (!duplicate) {
      animationRegions.push(proposal);
      configChanged = true;
    }
  }

  if (configChanged) {
    collision.regions = regions;
    entry['collision'] = collision;

    if (animationRegions.length > 0) {
      animations.regions = animationRegions;
      entry['animations'] = animations;
    }

    // Validate before writing: a malformed accept must not land on disk.
    tilesetsConfigSchema.parse(raw);
    written.push(await writeConfig(appRoot, raw));
  }

  return written;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/tiledAccept.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the interactive loop to the CLI**

In `tools/sync-tilesets.ts`, inside the `analyze` branch, replace the plain `formatReport` output path with a prompt loop when neither `--json` nor `--print-config` was passed and stdin is a TTY:

```ts
      log(formatReport(report));

      if (values.json || values['print-config'] || !stdin.isTTY) {
        continue;
      }

      let reader = createInterface({input: stdin, output: stdout});
      let decisions: Array<{group: CandidateGroup; decision: Decision}> = [];

      for (let group of groupCandidates(report)) {
        let answer = await reader.question(
          `${group.label} (${group.tileIds.length} tiles: ${group.tileIds.slice(0, 8).join(', ')}${group.tileIds.length > 8 ? ', …' : ''})\n  [a]ccept / [s]kip / [n]ever? `,
        );

        decisions.push({
          group,
          decision: answer.startsWith('a') ? 'accept' : answer.startsWith('n') ? 'never' : 'skip',
        });
      }

      let animationDecisions: Array<{proposal: AnimationRegion; decision: Decision}> = [];

      for (let proposal of report.animationProposals) {
        let answer = await reader.question(
          `animation tiles ${proposal.start}..${proposal.start + proposal.frames - 1}\n  [a]ccept / [s]kip? `,
        );

        animationDecisions.push({proposal, decision: answer.startsWith('a') ? 'accept' : 'skip'});
      }

      reader.close();

      // Say what is about to be written before writing it.
      let targets = new Set(
        decisions
          .filter(({decision}) => decision !== 'skip')
          .map(({decision}) => (decision === 'never' ? tileset.source : 'tilesets.config.json')),
      );

      if (targets.size === 0) {
        log('nothing accepted; no files written');

        continue;
      }

      log(`about to write: ${[...targets].join(', ')}`);

      for (let path of await applyDecisions({
        appRoot,
        tilesetName: tileset.name,
        decisions,
        animationProposals: animationDecisions,
      })) {
        log(`wrote ${path}`);
      }
```

This requires restructuring the `analyze` branch into a `for (let tileset of config.tilesets)` loop (hence `continue`), and importing `createInterface` from `node:readline/promises`, `stdin`/`stdout` from `node:process`, and the accept module's exports.

- [ ] **Step 6: Verify the CLI still passes its tests and behaves non-interactively under vitest**

Run: `npx vitest run --project unit tests/syncTilesets.test.ts`
Expected: PASS. `stdin.isTTY` is falsy under vitest, so the prompt loop is skipped and `analyze` stays a pure reporter in tests — which is also what makes it safe in CI.

- [ ] **Step 7: Typecheck, lint and commit**

Run: `npm run typecheck` then `npm run lint`
Expected: both pass.

```bash
git add apps/somewhere/tools/tiled-pipeline/accept.ts apps/somewhere/tools/sync-tilesets.ts apps/somewhere/tests/tiledAccept.test.ts
git commit -m "Accept analyze proposals into durable config and tile properties"
```

---

## Task 19: Adoption — the first real run

The first run is a deliberate, reviewed change, not a side effect of installing the tool. Steps 1 and 2 of the spec's adoption sequence are already done (Tasks 1 and 2); this is steps 3 to 5.

On the current atlas, with the demo map configured as an evidence source, `analyze` should surface roughly 17 candidate tiles: the 8 already authored (where the proposal matches what is there, on 7 of 8) and the 9 of a single 3×3 prop that has no boxes yet. Whether that prop should collide is a judgement call and is exactly what the interactive step is for.

**Files:**
- Modify: `apps/somewhere/tilesets.config.json`, possibly `apps/somewhere/assets/tileset.tsx`, `apps/somewhere/public/tileset.json`

**Interfaces:**
- Consumes: everything.
- Produces: a config that describes the real tileset, and artifacts regenerated from it.

- [ ] **Step 1: Run analyze and read the report**

```powershell
npm run sync-tilesets -- analyze
```

Expected: the four alpha levels; inventory `empty 3094, full 187, partial 815`; the eight authored tiles listed with `manual` provenance and `unchanged` geometry on seven of them; tile 193 showing `0,0 16x8 -> 0,0 16x7`; the map-layer candidates; zero animation proposals.

**Stop and show Jakub the report before accepting anything.** The 3×3 prop is a judgement call about the game, not about the pipeline.

- [ ] **Step 2: Accept the agreed groups**

Re-run interactively and answer the prompts, or paste the fragment by hand:

```powershell
npm run sync-tilesets -- analyze --print-config
```

Then confirm the config still loads and is prettier-clean:

```powershell
npx prettier --check tilesets.config.json
npx vitest run --project unit tests/tilesetsConfig.test.ts
```

- [ ] **Step 3: Review the resolved decisions before anything is written**

```powershell
npm run sync-tilesets -- --report
```

Expected: one line per tile that any rule speaks for, with its mode and geometry. Read it against the report from step 1. **Tile 193 will change from `h:8` to `h:7`** if it is inside an accepted region — that is the pipeline correcting an author's round-up over a shadow row, and it is a real (1 px) gameplay change. Decide deliberately; suppressing it is `autoCollision: false` on tile 193, or a manual claim by leaving the object unclassed.

- [ ] **Step 4: Run the sync and review the diff**

```powershell
npm run sync-tilesets
git diff apps/somewhere/assets/tileset.tsx apps/somewhere/public/tileset.json
```

Expected: `type="auto"` on every generated object; no reordering of existing tiles; no change to the eight authored boxes except where step 3 said so; `public/tileset.json` mirroring the `.tsx` exactly.

- [ ] **Step 5: Confirm the gate is green and idempotent**

```powershell
npm run sync-tilesets -- --check
npm run sync-tilesets
git status --porcelain
```

Expected: `--check` exits 0; the second `sync-tilesets` writes nothing; `git status` shows only the files from step 4.

- [ ] **Step 6: Run the whole suite**

```powershell
npm test
```

Expected: PASS, including `tests/tilesetArtifacts.test.ts` (the CI gate) and `tests/exportedAssets.test.ts` (the runtime schema check on the regenerated JSON).

- [ ] **Step 7: Confirm the game still renders**

```powershell
npm run develop
```

Open the game and walk into the tiles that gained collision boxes. This is the only step in the plan that checks the change against the actual game rather than against a file.

- [ ] **Step 8: Add a changeset and commit**

Both PR workflows run `npx changeset status --since=origin/development`, so a PR without one fails.

```powershell
npx changeset
```

```bash
git add apps/somewhere/tilesets.config.json apps/somewhere/assets/tileset.tsx apps/somewhere/public/tileset.json .changeset
git commit -m "Adopt automatic tileset collision boxes"
```

---

## Self-review

Run against the spec after the plan was written.

**Spec coverage.** Every section maps to a task: source-of-truth inversion (2, 5, 14); code layout (4-18, minus `serialize.ts` — see Deviations); wiring (3, 14); config (6); `analyze` (15, 16, 17, 18); `sync` (12, 13); evidence and precedence (9, 15); collision rules (7, 8); animation rules (10, 16); reconciliation, ownership, the core invariant, stable identity, normalized output, pipeline order (11); "never touched" (11); the engine change (1); error handling and exit codes (7, 11, 12, 13); testing (every task); adoption (2, 19); future work (out of scope by the spec's own framing).

**Known gaps, stated rather than papered over:**

1. **The `evidence/` import boundary is not lint-enforced.** The spec says it is; there is no rule for it. Task 15 checks it with a grep and points at `import/no-restricted-paths` as the follow-up. Adding the rule means an `.carson/project.json` change and a full `carson update workspace`, which is its own commit.
2. **`--import <file.tsx>` and the Tiled-binary adapter are absent**, per the spec's "Future work". Goal 4 (no Tiled binary needed) is satisfied by not coupling to it, which requires no code.
3. **A tileset dropped from the config keeps its auto data forever** (correction 11). No code handles it; Task 11 documents the workaround.
4. **`solidAlphaThreshold` is per tileset, not per region.** The spec does not ask for more, and the atlas's shadow levels (76 and 102) are both well under 255, so one threshold covers it.
5. **The `.tsx` attribute-order table is empirical**, derived from the one real file plus Tiled's writer order. A tileset using attributes the table does not list will still round-trip byte-identically (unknown attributes keep their parsed order); only *newly inserted* attributes could land in a position Tiled would not choose, and the convergence test in Task 12 is what would catch it.
6. **Task 19 step 7 is a manual check.** There is no automated test that the game renders correctly with new collision boxes; `tests/mapSign.browser.test.ts` exercises the real map but asserts sign behaviour, not collision geometry.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no "write tests for the above". Every code step carries the code. Two steps deliberately defer to measurement rather than prescribing a value: Task 15's demo-map usage assertion and Task 17's inventory counts, both of which state the measured number *and* say what to do if the data changed.

**Type consistency.** Names checked across tasks: `parseTsx`/`formatTsx`/`parseXmlDocument` (4, 5, 11, 12, 15, 18); `XmlDocument`/`XmlElement` (4-18); `toTilesetJson`/`formatJson` (5, 12); `CollisionMode`/`CollisionRegion`/`AnimationRegion`/`TilesetConfig`/`TilesetsConfig`/`loadConfig`/`resolveInsideAppRoot`/`DEFAULT_CONFIG_FILE_NAME` (6, 9, 10, 11, 12, 13, 17, 18); `TileMask`/`TilesetImage`/`readTilesetImage`/`assertPngWithinBounds` (7, 8, 11, 16, 17); `CollisionBox`/`computeCollisionBox` (8, 11, 13, 17); `resolveCollisionMode`/`isAutoObject`/`getTileClass`/`getBooleanProperty`/`AUTO_OBJECT_CLASS` (9, 11, 13, 17); `buildAnimationFrames`/`animatedTileIds`/`validateAnimationRegions` (10, 11); `reconcile`/`AUTO_COLLISION_PROPERTY`/`AUTO_ANIMATION_PROPERTY` (11, 12, 18); `computeTileset`/`computeAll`/`ComputedTileset` (12, 13, 14); `run`/`writeArtifacts` (13); `collectTileUsage` (15, 17); `compareTiles`/`proposeAnimationRegions` (16, 17); `analyzeTileset`/`formatReport`/`toConfigFragment`/`AnalysisReport`/`CollisionCandidate`/`CandidateSource` (17, 18); `groupCandidates`/`applyDecisions`/`CandidateGroup`/`Decision` (18); `TilesetTile.frameDurations` (1).

---

## Execution notes

- **Tasks 1 and 2 are independently shippable** and can be merged before the rest exists.
- **Task 3 is the gate.** Nothing after it compiles or lints until its `carson update workspace` lands cleanly.
- **Task 11 is where the time goes.** Budget accordingly, and do not weaken a failing cell to make it pass.
- **Type-aware lint over this app takes minutes.** A slow `npm run lint` is not a hang.
- **`npm test` is the real gate** — turbo makes it depend on `typecheck` and `lint`, and both PR workflows check for a dirty tree after it.
