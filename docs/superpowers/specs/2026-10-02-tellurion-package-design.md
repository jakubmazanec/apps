# `tellurion` Package Design

Extract the game engine from `apps/somewhere/source/engine` into a Carson-managed workspace package
named `tellurion` under `packages/tellurion`, and make Somewhere consume it as a dependency.

## Goal and success criteria

- The engine lives in exactly one place, `packages/tellurion`, built and tested on its own.
- Somewhere builds, typechecks, lints and tests exactly as before, importing the engine from the
  `tellurion` package.
- All configuration of the new package is owned by Carson templates; hand-written files are limited
  to source, tests, `LICENSE.md`, `.gitignore`, `.carson/project.json` and the hand-added
  `package.json` fields Carson's merge strategy preserves.
- The work lands as new commits on the `somewhere-update` branch (pull request #270). That branch is
  not going to be merged, so release-only concerns are recorded here but not blocking; the pull
  request's CI run, which builds, tests and deploys `somewhere-unstable`, must stay green.

## Decisions

| Decision          | Choice                                                                                                                  | Why                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carson template   | `@jakubmazanec/carson-templates:projects/react-library`                                                                 | Only `app` and `react-library` templates know about Vitest browser mode, and the engine has 21 browser tests. The Storybook, Tailwind and Chromatic parts come along unused. |
| Package name      | `tellurion`, unscoped                                                                                                   | Chosen in `docs/engine-package-name.md`.                                                                                                                                     |
| Visibility        | `"private": true`                                                                                                       | Changesets versions it and writes its changelog but never publishes it.                                                                                                      |
| License           | `LGPL-3.0-only`, the template default, with `LICENSE.md`                                                                | The generated README links to `./LICENSE.md`.                                                                                                                                |
| Public API        | One barrel, `source/main.ts`, exporting every module outside `internals/` directories                                   | Template default `exports`, same shape as the author's other packages, 235 unique names, no collisions.                                                                      |
| Module resolution | `module: preserve`, `moduleResolution: bundler` via `project.json` override                                             | Same override Somewhere uses; under the template's `node16` default, `@pixi/layout` declarations produce 20 errors. Emitted declarations are unaffected.                     |
| Staging           | Move in place: the engine exists in one location at every commit                                                        | No duplicate engine to keep in sync; `git mv` preserves history. Somewhere is red between the move commit and the switch commit.                                             |
| Deploy image      | Depends on the `carson-templates` fix planned in `docs/superpowers/plans/2026-10-02-carson-templates-docker-context.md` | Without it the Fly image cannot build a workspace package. The switch commit assumes the fix has been merged into `development` and `development` merged into this branch.   |

## The package

### Creation

Run at the repo root:

```sh
npx carson create project --template @jakubmazanec/carson-templates:projects/react-library --name tellurion
```

Answer `packages/tellurion` for the location. Carson writes `.carson/project.json`, renders the
create-strategy files (`package.json`, `README.md`, `source/main.ts`) and runs the first project
update. The first commit holds exactly this output.

### Files Carson owns

| File                                                                                                                   | Strategy            | Notes                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                                                                                         | create, then merge  | Scripts, devDependencies, `exports` (`.` and `./package.json`), `files`, `peerDependencies` on `react` and `react-dom`, `engines`. Keys added by hand survive updates. |
| `tsconfig.json`, `tsconfig.typecheck.json`                                                                             | overwrite           | `rootDir: ./source`, `emitDeclarationOnly`, `outDir: ./build`; the typecheck variant also covers `tests/`, `stories/`, `.storybook/`.                                  |
| `tests/tsconfig.json`, `stories/tsconfig.json`, `.storybook/tsconfig.json`                                             | overwrite           | Editor and ESLint projects.                                                                                                                                            |
| `vite.config.ts`                                                                                                       | overwrite           | Tailwind plugin plus `unit` and `browser` Vitest projects, chosen because `*.browser.test.ts` files exist. Rendered again after the tests move (see Sequencing).       |
| `eslint.config.js`, `prettier.config.cjs`, `.prettierignore`, `.editorconfig`, `typedoc.config.cjs`, `CONTRIBUTING.md` | overwrite           | As in the other projects, plus `prettier-plugin-tailwindcss` and a `storybook-static` ignore.                                                                          |
| `.storybook/main.ts`                                                                                                   | overwrite           | Stories glob `../stories/**`. Zero matches only logs a warning; `storybook build` succeeds. No stories are added.                                                      |
| `.storybook/preview.tsx`, `.storybook/tailwind.css`                                                                    | ensure              | Created once, then ours. Left as generated.                                                                                                                            |
| `README.md`                                                                                                            | create, then insert | Header and prerequisites regenerated from `package.json`.                                                                                                              |
| `source/main.ts`                                                                                                       | create, then check  | Created empty; becomes the barrel.                                                                                                                                     |

### `.carson/project.json`

Template id, three overrides copied from Somewhere's file and one of the package's own:

- `eslintConfig`: the `unicorn/prefer-dom-node-remove` and `@typescript-eslint/no-redeclare`
  disables, and the `@stylistic/js/lines-around-comment`, `perfectionist/sort-classes` and
  `@stylistic/js/padding-line-between-statements` rule blocks. Not copied: the `$/**` and
  `assets/**` ignores and the `tools/**` parser block.
- `tsconfig`: `compilerOptions.module: "preserve"`, `compilerOptions.moduleResolution: "bundler"`.
- `viteConfig`: `test.projects: [{test: {testTimeout: 60000}}]`, as in Somewhere.
- `packageJson`: `scripts.develop` with the esbuild glob's quotes escaped. The template's script
  nests unescaped double quotes inside the `concurrently` argument, so the shell expands
  `source/**/*` itself, as `source/*/*`: the watcher skips the barrel and every `internals` file,
  fails to resolve the two `internals` directories and never writes `build/`.

### Hand-added `package.json` fields

- `"private": true`
- `"description": "2D game engine on top of Pixi.js."` (also feeds the root README project list)
- `dependencies`: `pixi.js ^8.19.0`, `@pixi/layout ^3.2.0`, `pixi-filters ^6.1.5`, `zod ^4.4.3`,
  `eventemitter3 ^5.0.4`, `@jakubmazanec/ts-utils ^3.0.18` (Somewhere's current ranges; the root
  `overrides` pin on `pixi.js` keeps applying)
- `devDependencies`: `vite ^8.1.5`, so the `vite/client` type reference in `tests/env.d.ts` resolves
  without relying on hoisting. Everything else comes from the template, including `react`,
  `react-dom`, `playwright`, `@vitest/browser-playwright`, `vitest-browser-react`, Storybook and
  Chromatic.

### Other hand-written files

- `LICENSE.md`: the LGPL-3.0 text, copied from `@jakubmazanec/args`.
- `.gitignore`: `tests/__screenshots__/` (Vitest browser mode writes failure screenshots there).

## Source changes

- **Move.** `git mv` each of the 13 engine folders (`app`, `audio`, `dialogue`, `ecs`, `graphics`,
  `input`, `pixi-tools`, `scheduler`, `storage`, `tiled`, `tiled-tools`, `ui`, `utilities`) from
  `apps/somewhere/source/engine/` to `packages/tellurion/source/`. Relative imports between folders
  keep working.
- **Barrel.** `source/main.ts` holds one `export * from './<folder>/<File>.js';` line per module
  outside `internals/` directories, 154 lines, alphabetical by path. The 16 files under
  `app/internals` and `ui/internals` are not exported. A unit test, `tests/main.test.ts`, lists
  every `.ts` and `.tsx` under `source/` except `main.ts` and `internals/` and asserts the barrel's
  export set equals it, so a forgotten or stale line fails the test.
- **Extension-less imports.** The 28 `import {type …} from './X'` lines without `.js` get the
  suffix. They are type-only and erased at runtime; this is consistency with the other imports.
- **Development-mode checks.** The 5 `import.meta.env.DEV` sites in `utilities/failUnsupported.ts`,
  `utilities/ObjectPool.ts`, `graphics/Sprite.ts` (two) and `dialogue/Dialogue.ts` become
  `process.env.NODE_ENV !== 'production'`, inline at each site. Vite's client dev server and client
  build replace it statically, Vite's SSR build leaves the Node runtime value, Vitest in Node sees
  `test`, and Vitest browser mode goes through Vite's replacement; the branch is taken exactly when
  `import.meta.env.DEV` was true. Typing comes from the template's `types: ['node']`.
- **Build output.** `esbuild "source/**/*"` transpiles each file, reads `jsx: react-jsx` from the
  package's `tsconfig.json` for `GameProvider.tsx`, and `tsc` emits declarations beside the
  JavaScript.

## Tests

### Move to `packages/tellurion/tests`

51 files from `apps/somewhere/tests`: 49 test files (21 `*.browser.test.ts`, 28 unit) and the two
compile-time assertion files `Disposables.types.ts` and `GameScreenContents.types.ts`. The set is
"every test whose real import statements reach only the engine", plus `Game.browser.test.ts`, minus
`exportedAssets.test.ts`:

- `Game.browser.test.ts` moves although it imports the game's `theme` object: that object is a plain
  `UiThemeDescription` naming frames in the `ui` spriteset, which the test already mirrors in its
  `UI_FRAMES` list. The moved test gets a test-local copy of that description, and its four
  `pixi-tools` asset-parser mocks stay internal relative paths.
- `exportedAssets.test.ts` stays although it imports only engine schemas: it validates Somewhere's
  own `public/` and `assets/` files.

`tests/engine/GameInput.browser.test.ts` flattens to `tests/GameInput.browser.test.ts`. In every
moved file the import prefix `../source/engine/` becomes `../source/` (and `../../source/engine/`
becomes `../source/` for the flattened file), which keeps deep paths intact; several tests exercise
or mock `internals/` modules such as `measureTextWidth`, `createBackground` and `swapBackground`,
which the barrel does not expose.

### Helpers and fixture

- `createTestTheme.ts` is copied: the package copy imports `../source/ui/UiTheme.js`; Somewhere's
  copy stays for six game tests and imports its type from `tellurion`.
- `installMonogram.ts` moves: its only users, `Text.browser.test.ts` and
  `DialogueBoxReveal.browser.test.ts`, move too. The package copy reads
  `./fixtures/monogram.fnt?raw`.
- `tests/fixtures/monogram.fnt` is a copy of `apps/somewhere/public/monogram.fnt` (XML font
  descriptor, 65 KB); the PNG page is not needed because the helper only installs metrics.
- `tests/env.d.ts` holds `/// <reference types="vite/client" />` to type the `?raw` import.

### Stay in Somewhere

35 tests keep engine imports and have them rewritten to `tellurion`: 33 that mix game code and the
engine, `tiledJson.test.ts` (tools and engine) and `exportedAssets.test.ts`. The remaining Somewhere
tests (`settings.browser.test.ts` and the `tools/` suites) import no engine code and are untouched.
Two tests need more than a rewrite:

- `mapSign.browser.test.ts` mocks `ui/Text.js` with a stub class. A barrel import cannot intercept
  the engine's internal `./Text.js` imports, so the mock is removed and the real `Text` runs, as
  `GameScreen.browser.test.ts` and `pauseFlow.browser.test.ts` already do with `createTestTheme` and
  no font; the test already spies `BitmapFontManager.measureText`, and its assertions read game
  component state. Its `await import('../source/engine/ui/UiRoot.js')` inside a mock factory becomes
  `await import('tellurion')`. Fallback if the real widget misbehaves there:
  `vitest.mock(import('../../../packages/tellurion/build/ui/Text.js'), …)`, which Vitest keys by
  resolved absolute path and therefore does intercept the internal import, at the cost of coupling a
  game test to the package's build layout.
- `levelManager.test.ts` uses top-level `await import('../source/engine/…')` lines to control load
  order after a hoisted game mock. They collapse to one `await import('tellurion')` destructuring,
  and its four `import('…').Type` aliases become `import('tellurion').Type`.

## Somewhere changes

- `package.json`: add `"tellurion": "^0.0.0"` to `dependencies`; remove `pixi-filters` and
  `@jakubmazanec/ts-utils` (engine-only); move `@pixi/layout` from `dependencies` to
  `devDependencies` (two staying tests import it directly); keep `pixi.js`, `zod`, `eventemitter3`
  (used by 11, 2 and 1 game files).
- Import rewrite in 74 source files (140 import lines, up to 9 per file) and the 35 staying tests
  plus `createTestTheme.ts`: all `import {…} from '<relative>/engine/<path>.js'` lines in a file are
  replaced by one `import {…} from 'tellurion'` at the position of the first, specifiers unioned
  with inline `type` modifiers kept (a name imported both as `type X` and `X` keeps `X`), then
  `eslint --fix` and `prettier` restore ordering and wrapping. 101 of these files have
  prettier-wrapped multi-line imports; the rewrite must treat the braces as spanning lines. No
  namespace, default or side-effect imports of the engine exist outside it.
- `routes/_index.tsx` and `ui/Renderer.tsx` get the same rewrite and nothing else. The server now
  evaluates the barrel once at module load during SSR; all seven engine dependencies import cleanly
  in Node, verified.
- `source/engine` is gone after the `git mv`; nothing else is deleted.

## Carson regeneration

`npm install` after the dependency is added runs `carson update workspace`, which regenerates:
Somewhere's `tsconfig.json` with `references: [{path: '../../packages/tellurion'}]`; the root
`README.md` project list with `tellurion`; the root `.dockerignore` with the six
`packages/tellurion/…` lines (requires the template fix); and `.github/workflows/release.yaml` with
a Chromatic deploy step for `tellurion` in the main-branch job. Nothing else changes.

## Changesets

Two files: `tellurion: minor`, "Extracts the game engine from Somewhere into its own package" (0.0.0
to 0.1.0 on a release); `somewhere: patch`, "Consumes the engine from the `tellurion` package". The
pull request's "Check for changesets" step then passes.

## CI, release and deploy

- On every push to the pull request: build, typecheck, lint and test both packages through
  Turborepo; snapshot-version; `changeset publish` skips the private `tellurion`; deploy
  `somewhere-unstable`, whose image builds `tellurion` from source once the template fix is in.
- Deferred, because the branch is not going to be merged: on a merge to main the Chromatic step for
  `tellurion` runs `npx chromatic --project-token="$TELLURION_CHROMATIC_TOKEN"` after publish, push
  and deploy, and fails without the secret. Add the secret or accept the red step if a merge ever
  happens.

## Development workflow

The root has no `develop` script, and a repository-wide `turbo run develop` would start all five
apps' dev servers on port 5000 with `strictPort`. From the root,
`npx turbo run develop --filter=somewhere...` runs what the game needs: the `develop` task depends
on `^build`, so Turborepo builds `tellurion` first, then runs the package's watchers (esbuild, `tsc`
declarations and Storybook dev on port 6006, unused) next to Somewhere's dev server on port 5000.
The alternative is `npm run develop --workspace tellurion` in one terminal and
`npm run develop --workspace somewhere` in a second.

Somewhere's dev server, typecheck and tests read the package's `build/`, not its source. Without the
watcher, engine edits are silently ignored until the next `npm run build --workspace tellurion`.
After a fresh clone `tellurion` does not resolve until a build exists, so run
`npm run build --workspace tellurion` once (the Turborepo command above builds it too); the build
also gives the editor its declarations.

Vite treats the linked package as source. When a rebuild rewrites a built file, Somewhere's Vite
hot-updates the modules that import the engine
(`hmr update /source/routes/_index.tsx, /source/ui/Renderer.tsx`) without reloading the page, and
reloads its SSR module graph. An edit that compiles to the same JavaScript, such as an ordinary
comment, which esbuild drops, rewrites no file and triggers nothing.

## Not moved

The engine design specs and plans under `apps/somewhere/docs/superpowers` stay as history.
`docs/engine-package-name.md` stays at the root. No README content beyond the generated blocks. No
stories.

## Sequencing

1. Create the package with Carson and commit the generated scaffold untouched.
2. Write `.carson/project.json` overrides, add the hand-added `package.json` fields and
   dependencies, `LICENSE.md` and `.gitignore`; `npm install`; commit.
3. `git mv` the 13 engine folders; generate the barrel; fix the 28 extension-less imports; replace
   the 5 `import.meta.env.DEV` sites; add `tests/main.test.ts`. `npm run build`, `typecheck` and
   `lint` pass in the package. Commit.
4. `git mv` the 51 test files (flattening `tests/engine/`), move `installMonogram.ts`, copy
   `createTestTheme.ts`, add the fixture and `tests/env.d.ts`, rewrite import prefixes, give the
   moved `Game.browser.test.ts` its local theme description. Run `npx carson update workspace` so
   `vite.config.ts` and `package.json` pick up browser mode, then `npm install`. `npm test` passes
   in the package. Commit.
5. Merge `development` into the branch once the `carson-templates` bump with the Docker fix has
   landed there; `npm install`; commit if anything regenerated.
6. In Somewhere: add the dependency, adjust the other dependencies, run the import rewrite over
   source and tests, apply the two test-specific changes, `npm install` (regenerates tsconfig
   references, README, `.dockerignore`, workflows). `npm run build`, `typecheck`, `lint` and `test`
   pass in Somewhere. Commit.
7. Add the two changesets; run the root verification; commit.

## Tests and verification

- `packages/tellurion`: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` exit 0;
  `tests/main.test.ts` guards the barrel.
- `apps/somewhere`: the same four scripts exit 0; `grep -r "engine/" source tests` finds no import
  of the old paths.
- Repo root: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test` exit 0; `git status`
  is clean after `npm install`; `npx changeset status --since=origin/development` exits 0.
- The game boots in a browser through the package: `npx turbo run develop --filter=somewhere...`,
  then open the page, reach the main menu and start a dialogue.
- Optional, Docker is available locally:
  `docker build -f apps/somewhere/Dockerfile --build-arg VITE_APP_URL=http://localhost:5000 .`
  succeeds, the same build Fly runs.
