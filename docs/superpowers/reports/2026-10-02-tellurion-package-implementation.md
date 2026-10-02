# `tellurion` Package Extraction: Implementation Report

Implements `docs/superpowers/specs/2026-10-02-tellurion-package-design.md` on branch
`somewhere-update` (pull request #270). Base commit `9344204`; the work is 13 commits on top of it.
Executed with subagent-driven development: six tasks transcribed from the spec's Sequencing (step 5
skipped on the author's instruction), one implementer and one reviewer per task, a whole-branch
review, one fix wave and one scoped re-review.

## Outcome

- The engine lives only in `packages/tellurion` (13 folders, 170 files, moved with `git mv`), built
  by esbuild plus `tsc` declarations, exported through a 154-line barrel, tested on its own (51
  files, 713 tests across the `unit` and `browser` Vitest projects).
- `apps/somewhere` consumes `tellurion ^0.0.0`: 110 files rewritten to one
  `import {…} from 'tellurion'` each (identical specifier sets, no value-to-type flips), its own
  build, typecheck, lint and tests green (54 files, 456 tests), and the game boots through the
  package from a cold Vite cache to the main menu and an open dialogue.
- Root Turborepo `build` 11/11, `typecheck` 12/12, `lint` 0 errors, `test` 24/24, run with
  `--concurrency=1` (see "Environment").
- Two changesets: `tellurion: minor`, `somewhere: patch`; `npx changeset status` exits 0.

## Commits

| Commit    | Subject                                                         | Notes                                                                                                             |
| --------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `1c1c632` | Create tellurion package scaffold                               | Carson `projects/react-library` output, 20 files, created through `runCreateProject`                              |
| `b538772` | Configure tellurion package                                     | `.carson/project.json` overrides, hand-added `package.json` keys, `LICENSE.md`, `.gitignore`, first `npm install` |
| `ffd7d9a` | Move the engine into the tellurion package                      | `git mv`, 28 `.js` suffixes, 5 dev-mode checks, barrel, `tests/env.d.ts`, `tests/main.test.ts`                    |
| `b7e30ff` | Guard the barrel against erased runtime exports                 | Task 3 fix round: `export type *` targets must have no runtime exports                                            |
| `20a9142` | Move the engine tests into the tellurion package                | 51 tests + `installMonogram.ts`, `createTestTheme.ts` copy, font fixture, browser-mode config                     |
| `35ae858` | Consume the engine from the tellurion package                   | Dependency edits, import rewrite, `mapSign`/`levelManager` edits, `LayoutSystem` test setup                       |
| `912e94b` | Add changesets for the tellurion package                        |                                                                                                                   |
| `6d3f096` | Pre-bundle the engine dependencies for the Somewhere dev server | `optimizeDeps.include` via Carson override; fixes the cold-cache first-load stall                                 |
| `321e569` | Import @pixi/layout in every module that uses layout            | Final-review fix: production consumers without `Game` kept the layout feature                                     |
| `131699e` | Reject non-star lines in the barrel guard                       |                                                                                                                   |
| `dd7cf69` | Drop the type-only dependency from the dev pre-bundle list      |                                                                                                                   |
| `6b34aa4` | Quote the esbuild glob in the tellurion develop script          | Works around an upstream template bug (see "Found along the way")                                                 |
| `6d800fe` | Correct the development workflow in the tellurion spec          |                                                                                                                   |

## Deviations from the spec (rulings)

Each ruling was recorded before acting; the spec stayed the authority wherever it was not
contradicted by the tree or by the author's instruction.

1. **Spec step 5 skipped.** The `carson-templates` Docker fix (9.1.0) is not on npm and the branch
   already contains `origin/development`; the author said to assume the tools repository is fixed
   and that the Fly deploy is not needed yet. The installed templates 9.0.0 rendered `.dockerignore`
   with `packages/tellurion/build/**` and `package.json`, and every app's `Dockerfile` with a
   final-stage copy of `packages/tellurion/build`; both are committed as Carson output.
2. **Package created through Carson's API.** `npx carson create project` asks for the location with
   an interactive select and has no flag for it, so a throwaway script called `runCreateProject`
   from `@jakubmazanec/carson` with `projectPath: packages/tellurion`. Output is the CLI's; it also
   wrote `.carson/project.snapshot`, which sibling projects track.
3. **`tests/env.d.ts` one step earlier.** The bare scaffold's typecheck fails on the generated
   `.storybook/preview.tsx` CSS import (TS2882); the `vite/client` reference moved from step 4 to
   step 3 so the move commit is green.
4. **Scaffold-only red state accepted at `b538772`** (typecheck TS2882, lint on the placeholder
   `export {}`); both cleared by the next commit.
5. **`@pixi/layout` stays a devDependency of Somewhere, as the spec says.** A preflight ruling had
   removed it (every test that imported it moves, no game source imports it); the switch showed why
   the spec was right: importing the barrel evaluates `app/Game.ts`, whose `import '@pixi/layout'`
   installs the `layout` setter on every Pixi container, so the two renderer-less game browser tests
   (`mapSign`, `pauseFlow`) init `LayoutSystem` in a `beforeAll` exactly like the engine's own tests
   and import it directly. `pauseFlow` also gives its `UiRoot` a layout (Modal sizes against it).
   The spec's `Text` mock fallback was not needed.
6. **Spec-mandated duplication stands:** `createTestTheme.ts` copied into the package, the game's
   theme literal copied into the moved `Game.browser.test.ts`, `monogram.fnt` copied as a fixture.
   The spec chose package-test independence; the three copies can drift.
7. **Lint under the upgraded config.** The first `npm install` moved `@jakubmazanec/eslint-config`
   from 5.0.0 (stale `node_modules`) to the lockfile's `6.0.0-unstable`; warnings on lines this work
   never changed were reported, not fixed. No lint errors remain anywhere.
8. **Cold-cache dev-server stall fixed through Carson.** With an empty `.vite` cache the first page
   load got 504 "Outdated Optimize Dep" because Vite discovered `pixi.js`, `@pixi/layout`,
   `@pixi/layout/components`, `pixi-filters` and `zod` late through the linked package.
   `viteConfig.optimizeDeps.include` in Somewhere's `.carson/project.json` pre-bundles them; the
   `@pixi/layout/components` subpath needed its own entry.
9. **Final-review fixes:** layout side-effect imports in every module that uses the layout feature
   (keeping `sideEffects: false`), a stricter barrel guard, the dead `@jakubmazanec/ts-utils`
   pre-bundle entry dropped, the spec's "Development workflow" section corrected to what works, and
   the `develop` script quoting override.
10. **Parked for the author** (API or spec-level decisions outside the extraction): shared
    `LayoutSystem` test helper, `pixi.js` as dependency versus peer dependency, unused `react-dom`
    peer, the Chromatic release step, sub-project tsconfigs on `node16`, pre-existing lint warnings
    (27 in engine code, 92 in moved tests), exported names that shadow globals (`Map`, `Event`,
    `Text`), the `ui/internals` boundary, `testTimeout` reaching only the first Vitest project.

## Found along the way

- **Barrel `export type *` erasure.** The linter rewrote 70 of 154 barrel lines to
  `export type * from`, which erases runtime exports if a type-only module later gains a value;
  `consistent-type-exports` never reports the reverse direction. `tests/main.test.ts` now asserts
  the barrel set equals the module set, that every line is the star form, and that no
  `export type *` target has a runtime export.
- **`sideEffects: false` versus `import '@pixi/layout'`.** Only `Game.ts` carried the import; a
  production build of a consumer using `UiRoot`, `Modal`, `Text` and `Vector` without `Game` lost
  the layout feature silently (`.layout` writes became plain properties). Every layout-dependent
  module now imports `@pixi/layout`; `tests/layoutImports.test.ts` guards it; the same consumer
  build keeps the import.
- **Upstream template bug: `develop` script quoting.** `carson-templates` 9.0.0 renders the library
  and react-library `develop` script with nested unescaped quotes, so the shell expands
  `source/**/*` as `source/*/*`; the esbuild watcher fails on every rebuild and never writes
  `build/`. Worked around with a `packageJson.scripts.develop` override; fix it in
  `templates/projects/react-library/package.json.ejs:73` and `library/package.json.ejs:61`.
- **Development workflow.** There is no root `develop` script.
  `npx turbo run develop --filter=somewhere...` builds tellurion first and runs both watchers; with
  the quoting fix, HMR reaches Somewhere on each rebuild (observed:
  `hmr update /source/routes/_index.tsx, /source/ui/Renderer.tsx`). Somewhere's dev server and tests
  read the package's `build/`, so engine edits are ignored without the watcher, and a fresh clone
  needs one package build first.
- **Docker and deploy (out of scope, graded).** With templates 9.0.0 the Somewhere image build fails
  (tellurion's `build` deletes the whitelisted `build/` and finds no `source/`). The four other
  apps' Dockerfiles now copy `packages/tellurion/build` in their final stage, which their
  `--filter=<app>` build never produces, so they build in CI only because the test step's build
  output leaks into the context. The upstream plan
  `docs/superpowers/plans/2026-10-02-carson-templates-docker-context.md` says the app Dockerfile
  template needs no change; after that plan ships, those four images fail for certain. The app
  template should copy or build only the workspace packages each app depends on.
- **Environment.** On this codespace (2 cores, 7.9 GB, no swap) root `npm run lint` and `npm test`
  at Turborepo's default concurrency get one task SIGTERM-killed (exit 143); both pass with
  `-- --concurrency=1 --continue`.

## Review trail

- Task reviews: 1 approved; 2 approved after two rulings; 3 approved after one fix round (barrel
  guard); 4 approved (plan-mandated duplication ruled); 5 approved (specifier fidelity proven by
  script); 6 approved after a pre-review fix (cold-cache boot).
- Whole-branch review: "with fixes"; two Important findings fixed (layout side-effect imports,
  development workflow), one graded and out of scope (deploy), four minors fixed or parked.
- Scoped re-review of the fix wave: all five items addressed, no new breakage. Four residual minors
  were parked rather than opening a second fix round; they are items 6 to 9 below.

## Follow-ups for the author

1. Decide the deploy story: land the `carson-templates` Docker-context fix with the app Dockerfile
   correction above, bump it here, regenerate, and verify the image build.
2. Fix the `develop` script quoting in `carson-templates`, then drop the override.
3. Consider a shared `LayoutSystem` test helper (or a `setupFiles` entry) for headless widget tests,
   and documenting that engine users need it.
4. Consider `pixi.js` and `@pixi/layout` as peer dependencies of `tellurion` so a consumer never
   ends up with two Pixi copies.
5. Audit the barrel's public surface before a 1.0 (global-shadowing names, `*Parts`/`*Runtime`
   types, utilities).
6. Spec "Development workflow": `tellurion#develop` starts alongside `tellurion#build`; only
   `somewhere#develop` waits for the build. The sentence saying Turborepo builds first, then runs
   the package's watchers, is wrong.
7. Spec "Development workflow", HMR sentences: say "built JavaScript file"; a comment-only edit
   rewrites the source map, which does not trigger HMR.
8. `packages/tellurion/tests/layoutImports.test.ts`: the dependency pattern misses `.once('layout'`,
   `addEventListener('layout'` and shorthand `{layout}` forms (none used today).
9. The `develop` script override in `packages/tellurion/.carson/project.json` hard-codes
   `--target=node24.18`; a Node bump updates the template's `build` target but not the override.
   Drop the override once the template quoting fix ships.
10. `Modal.attach`'s "UI root has no layout" error has no test; with the layout feature now present
    in the package suite it is testable.
