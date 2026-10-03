# itch.io Asset Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic `npm run import-itch-assets` command that turns raw pack archives in `assets/raw/` into organized, filtered game assets under `assets/itch-io/<pack-name>/`.

**Architecture:** One new CLI tool, `tools/import-itch-assets.ts`, built exactly like the existing `tools/sync-tilesets.ts`: it exports pure, unit-testable helpers plus a `run({appRoot, argv, log})` entry point, with a c8-ignored entry-module guard at the bottom. It shells out to the system `unzip` binary (list with `unzip -Z1`, extract to an OS temp dir, copy kept files into the project). Classification is pure path-based rules — no network, no content inspection.

**Tech Stack:** TypeScript (ESM, `module: node16`), `tsx` (already hoisted at the monorepo root — `sync-tilesets` uses it), system `unzip` (UnZip 6.00, present), vitest (`unit` project, node environment). Tests build fixture zips at runtime with the system `zip` binary (present at `/usr/bin/zip`).

**Spec:** `docs/superpowers/specs/2026-08-15-itch-io-asset-import-design.md` (repo root `docs/`, committed in `7978e9c`).

## Global Constraints

- Working directory for every command: `/workspaces/apps/apps/somewhere`. Branch: `somewhere-update` (already checked out).
- No new npm dependencies. `tsx` resolves from the workspace root `node_modules/.bin` (note: it is NOT in `apps/somewhere/node_modules/.bin` — that is expected).
- ESM everywhere: imports use the `node:` prefix for builtins and a `.js` extension for local files (`import {run} from '../tools/import-itch-assets.js'`).
- `tools/tsconfig.json` has `erasableSyntaxOnly: true` (no enums, no namespaces), `noUncheckedIndexedAccess: true`, `module/moduleResolution: node16`. Write plain types + functions only.
- House style: `let` instead of `const` for locals (repo convention — `prefer-const` is off, nothing enforces it; see `tools/sync-tilesets.ts`); eslint-enforced: blank line before every `return`/`continue`/`if` and around `let` groups; plus full-word identifiers (`temporaryRoot`, not `tmpDir`) and `String.replaceAll` with `/g` regexes for global replaces.
- Before each commit run: `npx prettier --write <touched files>` then `npx eslint <touched files>` and fix any complaints. (If tsc rejects the one `as SpawnSyncReturns<string>` cast in Task 7, widen it to `as unknown as SpawnSyncReturns<string>`.)
- Commit messages: short imperative sentence, no conventional-commit prefix (repo style: "Add itch.io asset import design spec", "Add docs").
- Exit codes (mirrors `sync-tilesets` where 2 = hard error): `0` = batch fine (imports, "already imported" skips, "nothing to import"); `1` = batch completed but ≥1 archive was corrupt/unsupported; `2` = hard error (missing `unzip`, bad CLI args, or any unexpected I/O failure — the whole body of `run` after arg parsing sits in a try/catch that logs the error message and returns 2, exactly like `sync-tilesets`; Task 7 adds it).
- Filtering constants, copied verbatim from the spec:
  - Junk name tokens (case-insensitive, matched inside a path segment at non-letter boundaries — so `every_packs_screenshots` and `Demo_v2` match, but `demon_idle.png` and `demolition.png` do not): `screenshot(s)`, `preview(s)`, `promo(tional)`, `marketing`, `demo`.
  - Extension denylist: `.html .htm .url .exe .pdf`.
  - Extension allowlist: images `.png .jpg .jpeg .gif .bmp .webp .tga`; audio `.wav .mp3 .ogg .flac`; fonts `.ttf .otf .woff`; Tiled `.tsx .tmx .tmj .tsj`; source sprites `.ase .aseprite`.
  - Rule order: junk folder → deny extension → allow extension → flag ("unrecognized — review manually").
- Slug rule: archive filename minus extension, camelCase boundaries split, lowercased, non-alphanumeric runs collapsed to `-`, stray hyphens trimmed. `SuperRetroWorld_InteriorPack_Full.zip` → `super-retro-world-interior-pack-full`.

## File Structure

- Create `tools/import-itch-assets.ts` — the whole tool: pure helpers (`slugifyPackName`, `classifyEntry`, `findWrapperPrefix`), private `listArchiveEntries`, exported `run`, entry guard. One file, matching the scale of the task; the heavy multi-module layout of `tools/tiled-pipeline/` is not needed here.
- Create `tests/importItchAssets.test.ts` — vitest, node project (filename has no `.browser.`, so vite.config.ts routes it to the `unit` project automatically). Fixture style copied from `tests/syncTilesets.test.ts`: `mkdtempSync` app root per test, cleaned in `afterEach`.
- Modify `package.json` — one new script line.
- Generated output (Task 9): four pack directories under `assets/itch-io/` (294 files total), committed: `super-retro-odyssey-exterior-pack-week4/` (15), `super-retro-world-character-pack-full/` (104), `super-retro-world-interior-pack-full/` (15), `exterior-pack-full-version/` (160).

## Design decisions locked in (an implementer must not re-decide these)

1. **Two `unzip` invocations per imported archive.** `unzip -Z1 <archive>` (zipinfo mode: one entry path per line) both validates the archive and yields the entry list used for classification and the dry-run report. The real run then extracts *everything* to an OS temp dir (`unzip -qq <archive> -d <temporaryRoot>`) and copies only the kept files into `assets/itch-io/<pack>/`. Extracting everything and copying selectively avoids shell-quoting individual entry names (the real pack has names like `screenshot (1).gif`), and `unzip` itself refuses to extract entries with hostile `../` paths outside the temp dir, so no archive *content* can land outside it. (An archive whose entry *names* contain `..` would at worst make the copy step fail on the missing extracted source and the run exit 2 via the top-level catch — acceptable for hand-purchased packs.)
2. **`unzip` exit status 1 is success.** Info-ZIP uses 1 for "warnings, but processing completed"; only status ≥ 2 (or a spawn error) counts as unreadable.
3. **Classification runs on the wrapper-stripped path.** The wrapper folder never appears in output paths, so its name is not subject to the junk-folder rule (a pack wrapped in `CoolDemo_Pack/` must not have its entire contents dropped because the wrapper contains "demo"). Every segment of the stripped path — including the filename itself — is checked against the junk pattern (the spec's rule 1 says "any path with a segment matching", which includes the filename segment).
4. **Corrupt vs unsupported is decided by extension.** A file in `assets/raw/` not ending in `.zip` (case-insensitive) → "unsupported archive format; only .zip is supported". A `.zip` that `unzip` cannot list → "corrupt or unreadable archive". Both count toward exit code 1 and neither stops the batch.
5. **A pack whose report keeps zero files writes nothing** (no empty directory is created), so it is re-reported on every run. Deterministic and visible; acceptable.
6. **`run` is synchronous** (returns `number`, not `Promise`). Everything inside is `spawnSync`/sync fs. Tests call it without `await`.
7. **Known spec deviation, intentional:** the spec's Verification section claims "nothing is flagged" for the real pack, but the pack contains `unity/tile_palette.unitypackage`, which the spec's own rules flag as unrecognized. The correct expected result (verified against the actual zip listing: 33 file entries) is **kept 15, dropped 17, flagged 1**. Task 9 documents the full expected report.
8. **Degenerate archive names are out of scope.** Archives are hand-downloaded purchases; a name that slugifies to the empty string, or two archives slugifying to the same pack name, is not guarded against. A slug collision surfaces as an "already imported" skip in the report — visible, but it relies on the operator reading the report.

## Report format (exact strings; tests assert substrings of these)

```
dry run — nothing will be written                        (banner, --dry-run only)
<ArchiveFileName.zip> -> assets/itch-io/<pack-name>/     (per-archive header)
  keep animation/chest_001.png
  drop every_packs_screenshots/screenshot (1).png (folder name "every_packs_screenshots")
  drop DONATE.html (extension .html)
  flag unity/tile_palette.unitypackage (unrecognized — review manually)
  kept 15, dropped 17, flagged 1                         (per-archive summary)
  wrote 15 files to assets/itch-io/<pack-name>/          (real run only, when kept > 0)
<ArchiveFileName.zip> -> assets/itch-io/<pack-name>/: already imported; delete the folder and re-run to re-import
<broken.zip>: corrupt or unreadable archive
<pack.rar>: unsupported archive format; only .zip is supported
`unzip` binary not found; install unzip to use this tool
nothing to import
```

Entries are sorted lexicographically before reporting, so output is stable regardless of archive internal order.

---

### Task 1: `slugifyPackName`

**Files:**
- Create: `tools/import-itch-assets.ts`
- Create: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function slugifyPackName(fileName: string): string` — later tasks call it with an archive filename (e.g. `'CozyPack_Full.zip'`) and get the slug (`'cozy-pack-full'`).

- [ ] **Step 1: Write the failing test**

Create `tests/importItchAssets.test.ts`:

```ts
import {describe, expect, test} from 'vitest';

import {slugifyPackName} from '../tools/import-itch-assets.js';

describe('slugifyPackName', () => {
  test('slugifies the real pack name, splitting camelCase and underscores', () => {
    expect(slugifyPackName('SuperRetroWorld_InteriorPack_Full.zip')).toBe(
      'super-retro-world-interior-pack-full',
    );
  });

  test('collapses spaces and punctuation and trims stray hyphens', () => {
    expect(slugifyPackName('My Pack (v2).zip')).toBe('my-pack-v2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: FAIL — cannot resolve `../tools/import-itch-assets.js`.

- [ ] **Step 3: Write minimal implementation**

Create `tools/import-itch-assets.ts`:

```ts
// Imports a downloaded itch.io pack archive from assets/raw/ into organized,
// filtered assets under assets/itch-io/<pack-name>/. Deterministic path-based
// rules only — see docs/superpowers/specs/2026-08-15-itch-io-asset-import-design.md.

export function slugifyPackName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Add pack-name slugification for itch.io asset import"
```

---

### Task 2: `classifyEntry` — the filtering rules

**Files:**
- Modify: `tools/import-itch-assets.ts`
- Modify: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export type Classification =
    | {action: 'drop'; rule: 'extension'; extension: string}
    | {action: 'drop'; rule: 'folder-name'; segment: string}
    | {action: 'flag'}
    | {action: 'keep'};

  export function classifyEntry(entryPath: string): Classification;
  ```
  `entryPath` is a `/`-separated archive path *after* wrapper stripping (e.g. `'animation/chest_001.png'`).

- [ ] **Step 1: Write the failing tests**

Add to `tests/importItchAssets.test.ts` — extend the import line and append a describe block:

```ts
import {classifyEntry, slugifyPackName} from '../tools/import-itch-assets.js';
```

```ts
describe('classifyEntry', () => {
  test('keeps allowlisted asset extensions, case-insensitively', () => {
    expect(classifyEntry('atlas_16x.png')).toEqual({action: 'keep'});
    expect(classifyEntry('music/Theme.OGG')).toEqual({action: 'keep'});
    expect(classifyEntry('fonts/pixel.ttf')).toEqual({action: 'keep'});
    expect(classifyEntry('sprites/hero.aseprite')).toEqual({action: 'keep'});
    // "demo" only matches at non-letter boundaries, not inside "demon".
    expect(classifyEntry('sprites/demon_idle.png')).toEqual({action: 'keep'});
  });

  test('drops any path with a junk folder segment, even for allowlisted extensions', () => {
    expect(classifyEntry('every_packs_screenshots/screenshot (1).png')).toEqual({
      action: 'drop',
      rule: 'folder-name',
      segment: 'every_packs_screenshots',
    });
    expect(classifyEntry('deep/nested/Previews/art.png')).toEqual({
      action: 'drop',
      rule: 'folder-name',
      segment: 'Previews',
    });
  });

  test('drops denylisted extensions regardless of location', () => {
    expect(classifyEntry('DONATE.html')).toEqual({
      action: 'drop',
      rule: 'extension',
      extension: '.html',
    });
    expect(classifyEntry('sub/dir/link.url')).toEqual({
      action: 'drop',
      rule: 'extension',
      extension: '.url',
    });
  });

  test('junk folder wins over a denylisted extension (rule order)', () => {
    expect(classifyEntry('promo/DONATE.html')).toEqual({
      action: 'drop',
      rule: 'folder-name',
      segment: 'promo',
    });
  });

  test('flags unrecognized files instead of copying or silently dropping', () => {
    expect(classifyEntry('unity/tile_palette.unitypackage')).toEqual({action: 'flag'});
    expect(classifyEntry('README')).toEqual({action: 'flag'});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: FAIL — `classifyEntry` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `tools/import-itch-assets.ts`:

```ts
export type Classification =
  | {action: 'drop'; rule: 'extension'; extension: string}
  | {action: 'drop'; rule: 'folder-name'; segment: string}
  | {action: 'flag'}
  | {action: 'keep'};

// Junk tokens are matched at non-letter boundaries inside a segment:
// "every_packs_screenshots" and "Demo_v2" are junk, "demon_idle.png" and
// "demolition.png" are not.
const JUNK_SEGMENT_PATTERN =
  /(^|[^a-z])(screenshots?|previews?|promo(tional)?|marketing|demo)([^a-z]|$)/i;

const DENIED_EXTENSIONS = new Set(['.html', '.htm', '.url', '.exe', '.pdf']);

const KEPT_EXTENSIONS = new Set([
  // images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.webp',
  '.tga',
  // audio
  '.wav',
  '.mp3',
  '.ogg',
  '.flac',
  // fonts
  '.ttf',
  '.otf',
  '.woff',
  // Tiled
  '.tsx',
  '.tmx',
  '.tmj',
  '.tsj',
  // source sprites
  '.ase',
  '.aseprite',
]);

export function classifyEntry(entryPath: string): Classification {
  let segments = entryPath.split('/').filter((segment) => segment.length > 0);
  let junkSegment = segments.find((segment) => JUNK_SEGMENT_PATTERN.test(segment));

  if (junkSegment !== undefined) {
    return {action: 'drop', rule: 'folder-name', segment: junkSegment};
  }

  let fileName = segments.at(-1) ?? '';
  let extensionMatch = /\.[^.]+$/.exec(fileName);
  let extension = extensionMatch ? extensionMatch[0].toLowerCase() : '';

  if (DENIED_EXTENSIONS.has(extension)) {
    return {action: 'drop', rule: 'extension', extension};
  }

  if (KEPT_EXTENSIONS.has(extension)) {
    return {action: 'keep'};
  }

  return {action: 'flag'};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Add itch.io import filtering rules"
```

---

### Task 3: `findWrapperPrefix` — wrapper-folder detection

**Files:**
- Modify: `tools/import-itch-assets.ts`
- Modify: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function findWrapperPrefix(entryPaths: string[]): string | null` — takes *file* entry paths (no trailing-`/` directory entries), returns the single shared top-level directory name, or `null` when there is none. Deliberate refinement of the spec's "every entry" wording: directory entries are excluded by the caller, so a stray empty second top-level directory cannot defeat wrapper stripping.

- [ ] **Step 1: Write the failing tests**

Extend the import line and append to `tests/importItchAssets.test.ts`:

```ts
import {classifyEntry, findWrapperPrefix, slugifyPackName} from '../tools/import-itch-assets.js';
```

```ts
describe('findWrapperPrefix', () => {
  test('finds the single top-level wrapper directory', () => {
    expect(
      findWrapperPrefix(['Pack/atlas.png', 'Pack/animation/chest.png', 'Pack/DONATE.html']),
    ).toBe('Pack');
  });

  test('returns null when a file sits at the archive root', () => {
    expect(findWrapperPrefix(['atlas.png', 'Pack/animation/chest.png'])).toBeNull();
  });

  test('returns null when there are multiple top-level directories', () => {
    expect(findWrapperPrefix(['a/atlas.png', 'b/chest.png'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: FAIL — `findWrapperPrefix` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `tools/import-itch-assets.ts`:

```ts
export function findWrapperPrefix(entryPaths: string[]): string | null {
  let firstSegments = new Set<string>();

  for (let entryPath of entryPaths) {
    let separatorIndex = entryPath.indexOf('/');

    if (separatorIndex === -1) {
      // A file sits at the archive root, so there is no wrapper.
      return null;
    }

    firstSegments.add(entryPath.slice(0, separatorIndex));
  }

  if (firstSegments.size !== 1) {
    return null;
  }

  return firstSegments.values().next().value ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Add wrapper-folder detection for itch.io import"
```

---

### Task 4: `run()` — archive discovery, listing, classification report, `--dry-run`

**Files:**
- Modify: `tools/import-itch-assets.ts`
- Modify: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: `slugifyPackName`, `classifyEntry`, `findWrapperPrefix` (Tasks 1–3).
- Produces:
  ```ts
  export type RunOptions = {
    appRoot: string;
    argv: string[];
    log: (message: string) => void;
  };

  export function run(options: RunOptions): number;
  ```
  Tasks 5–7 edit the body of `run` at the exact anchors shown in those tasks. The test helper `createZip(archivePath: string, files: Record<string, string>): void` defined here is reused by Tasks 5–7.

- [ ] **Step 1: Write the failing tests**

Replace the entire top of `tests/importItchAssets.test.ts` (everything above `describe('slugifyPackName', ...)`) with:

```ts
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {
  classifyEntry,
  findWrapperPrefix,
  run,
  slugifyPackName,
} from '../tools/import-itch-assets.js';

let appRoot = '';
let output: string[] = [];

function log(message: string): void {
  output.push(message);
}

// Builds a real zip with the system `zip` binary. Listing the file paths
// explicitly (instead of `zip -r .`) stores exactly those entry names, which
// makes wrapper-folder scenarios precise.
function createZip(archivePath: string, files: Record<string, string>): void {
  let stagingRoot = mkdtempSync(join(tmpdir(), 'itch-fixture-'));

  for (let [filePath, contents] of Object.entries(files)) {
    mkdirSync(join(stagingRoot, dirname(filePath)), {recursive: true});
    writeFileSync(join(stagingRoot, filePath), contents);
  }

  let result = spawnSync('zip', ['-q', '-X', archivePath, ...Object.keys(files)], {
    cwd: stagingRoot,
  });

  rmSync(stagingRoot, {recursive: true, force: true});

  if (result.status !== 0) {
    throw new Error(`failed to create fixture zip at ${archivePath}`);
  }
}

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'import-itch-assets-'));
  output = [];

  mkdirSync(join(appRoot, 'assets/raw'), {recursive: true});
  writeFileSync(join(appRoot, 'assets/raw/.gitkeep'), '');
});

// eslint-disable-next-line vitest/require-top-level-describe -- global afterEach shared by all describe blocks
afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});
```

(`readFileSync` is imported now but first used in Task 5; if eslint flags it as unused, drop it here and re-add it in Task 5.)

Then append a new describe block at the bottom of the file:

```ts
describe('run', () => {
  test('reports "nothing to import" and exits 0 when assets/raw/ holds only .gitkeep', () => {
    expect(run({appRoot, argv: [], log})).toBe(0);
    expect(output.join('\n')).toContain('nothing to import');
  });

  test('--dry-run prints the full report without writing anything', () => {
    createZip(join(appRoot, 'assets/raw/CozyPack_Full.zip'), {
      'CozyPack_Full/atlas.png': 'art',
      'CozyPack_Full/animation/chest.png': 'art',
      'CozyPack_Full/screenshots/promo.png': 'junk',
      'CozyPack_Full/DONATE.html': 'junk',
      'CozyPack_Full/notes.txt': 'meta',
    });

    expect(run({appRoot, argv: ['--dry-run'], log})).toBe(0);

    let report = output.join('\n');

    expect(report).toContain('dry run — nothing will be written');
    expect(report).toContain('CozyPack_Full.zip -> assets/itch-io/cozy-pack-full/');
    expect(report).toContain('keep animation/chest.png');
    expect(report).toContain('drop screenshots/promo.png (folder name "screenshots")');
    expect(report).toContain('drop DONATE.html (extension .html)');
    expect(report).toContain('flag notes.txt (unrecognized — review manually)');
    expect(report).toContain('kept 2, dropped 2, flagged 1');
    expect(existsSync(join(appRoot, 'assets/itch-io'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: FAIL — `run` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `tools/import-itch-assets.ts`, add these imports at the very top of the file:

```ts
import {spawnSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {argv, exit} from 'node:process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
```

Then append at the bottom of the file:

```ts
export type RunOptions = {
  appRoot: string;
  argv: string[];
  log: (message: string) => void;
};

function listArchiveEntries(
  archivePath: string,
): {entries: string[]} | {error: 'missing-unzip' | 'unreadable'} {
  // -Z1 is zipinfo mode: one entry path per line, nothing else.
  let result = spawnSync('unzip', ['-Z1', archivePath], {encoding: 'utf8'});
  let spawnError = result.error as NodeJS.ErrnoException | undefined;

  if (spawnError?.code === 'ENOENT') {
    return {error: 'missing-unzip'};
  }

  // unzip exit status 1 means "warnings, but processing completed" — usable.
  if (result.status !== 0 && result.status !== 1) {
    return {error: 'unreadable'};
  }

  return {
    entries: result.stdout
      .split('\n')
      .filter((line) => line.length > 0 && !line.endsWith('/'))
      .sort(),
  };
}

export function run({appRoot, argv: args, log}: RunOptions): number {
  let values;

  try {
    ({values} = parseArgs({
      args,
      options: {
        'dry-run': {type: 'boolean', default: false},
      },
    }));
  } catch (error) {
    log(String(error));

    return 2;
  }

  let dryRun = values['dry-run'];
  let rawRoot = join(appRoot, 'assets/raw');
  let archiveNames =
    existsSync(rawRoot) ?
      readdirSync(rawRoot, {withFileTypes: true})
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort()
    : [];

  if (archiveNames.length === 0) {
    log('nothing to import');

    return 0;
  }

  if (dryRun) {
    log('dry run — nothing will be written');
  }

  for (let archiveName of archiveNames) {
    let archivePath = join(rawRoot, archiveName);
    let packName = slugifyPackName(archiveName);
    let targetRoot = join(appRoot, 'assets/itch-io', packName);
    let targetLabel = `assets/itch-io/${packName}/`;
    let listing = listArchiveEntries(archivePath);

    if ('error' in listing) {
      if (listing.error === 'missing-unzip') {
        log('`unzip` binary not found; install unzip to use this tool');

        return 2;
      }

      log(`${archiveName}: corrupt or unreadable archive`);

      continue;
    }

    let wrapperPrefix = findWrapperPrefix(listing.entries);
    let keptEntries: string[] = [];
    let droppedCount = 0;
    let flaggedCount = 0;

    log(`${archiveName} -> ${targetLabel}`);

    for (let entry of listing.entries) {
      let strippedEntry = wrapperPrefix ? entry.slice(wrapperPrefix.length + 1) : entry;
      let classification = classifyEntry(strippedEntry);

      if (classification.action === 'keep') {
        keptEntries.push(entry);
        log(`  keep ${strippedEntry}`);
      } else if (classification.action === 'flag') {
        flaggedCount += 1;
        log(`  flag ${strippedEntry} (unrecognized — review manually)`);
      } else if (classification.rule === 'folder-name') {
        droppedCount += 1;
        log(`  drop ${strippedEntry} (folder name "${classification.segment}")`);
      } else {
        droppedCount += 1;
        log(`  drop ${strippedEntry} (extension ${classification.extension})`);
      }
    }

    log(`  kept ${keptEntries.length}, dropped ${droppedCount}, flagged ${flaggedCount}`);
  }

  return 0;
}

/* c8 ignore start -- entry-module guard, exercised by `npm run import-itch-assets` */
if (argv[1] && import.meta.url === new URL(`file://${argv[1]}`).href) {
  exit(
    run({
      appRoot: fileURLToPath(new URL('../', import.meta.url)),
      argv: argv.slice(2),
      // eslint-disable-next-line no-console -- this is the CLI's output
      log: (message: string) => console.log(message),
    }),
  );
}

/* c8 ignore stop */
```

Note: `targetRoot` is intentionally declared now but first *used* in Task 5. If eslint rejects the unused variable at this task's commit, delete the `let targetRoot = ...` line here and Task 5 re-adds it at the same position.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Add itch.io import dry-run report"
```

---

### Task 5: Real extraction — copy kept files into `assets/itch-io/<pack>/`

**Files:**
- Modify: `tools/import-itch-assets.ts`
- Modify: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: `run` from Task 4 (the loop body anchor `log(\`  kept ...\`)`), `createZip` test helper from Task 4.
- Produces: real-run behavior — kept files land at `assets/itch-io/<pack>/<stripped path>`; Tasks 6–7 rely on this to prove skip/continue behavior.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('run', ...)` in `tests/importItchAssets.test.ts`:

```ts
  test('extracts kept files, strips the wrapper folder, and preserves structure', () => {
    createZip(join(appRoot, 'assets/raw/CozyPack_Full.zip'), {
      'CozyPack_Full/atlas.png': 'atlas-art',
      'CozyPack_Full/animation/chest.png': 'chest-art',
      'CozyPack_Full/screenshots/promo.png': 'junk',
      'CozyPack_Full/DONATE.html': 'junk',
      'CozyPack_Full/notes.txt': 'meta',
    });

    expect(run({appRoot, argv: [], log})).toBe(0);

    let packRoot = join(appRoot, 'assets/itch-io/cozy-pack-full');

    expect(readFileSync(join(packRoot, 'atlas.png'), 'utf8')).toBe('atlas-art');
    expect(readFileSync(join(packRoot, 'animation/chest.png'), 'utf8')).toBe('chest-art');
    expect(existsSync(join(packRoot, 'screenshots'))).toBe(false);
    expect(existsSync(join(packRoot, 'DONATE.html'))).toBe(false);
    expect(existsSync(join(packRoot, 'notes.txt'))).toBe(false);
  });

  test('extracts as-is when the archive has no single wrapper folder', () => {
    createZip(join(appRoot, 'assets/raw/loose.zip'), {
      'atlas.png': 'atlas-art',
      'tiles/floor.png': 'floor-art',
    });

    expect(run({appRoot, argv: [], log})).toBe(0);
    expect(readFileSync(join(appRoot, 'assets/itch-io/loose/atlas.png'), 'utf8')).toBe('atlas-art');
    expect(readFileSync(join(appRoot, 'assets/itch-io/loose/tiles/floor.png'), 'utf8')).toBe(
      'floor-art',
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: FAIL — the two new tests find no files under `assets/itch-io/`.

- [ ] **Step 3: Implement extraction**

In `tools/import-itch-assets.ts`, extend the fs/os/path imports to:

```ts
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
```

Then, inside the archive loop in `run`, replace this line:

```ts
    log(`  kept ${keptEntries.length}, dropped ${droppedCount}, flagged ${flaggedCount}`);
```

with:

```ts
    log(`  kept ${keptEntries.length}, dropped ${droppedCount}, flagged ${flaggedCount}`);

    if (dryRun || keptEntries.length === 0) {
      continue;
    }

    // Extract everything to a temp dir, then copy only the kept files: this
    // avoids shell-quoting individual entry names (packs contain names like
    // "screenshot (1).gif"), and unzip sanitizes hostile ../ paths itself.
    let temporaryRoot = mkdtempSync(join(tmpdir(), 'import-itch-assets-'));

    try {
      let extraction = spawnSync('unzip', ['-qq', archivePath, '-d', temporaryRoot]);

      if (extraction.status !== 0 && extraction.status !== 1) {
        log(`${archiveName}: corrupt or unreadable archive`);

        continue;
      }

      for (let entry of keptEntries) {
        let strippedEntry = wrapperPrefix ? entry.slice(wrapperPrefix.length + 1) : entry;
        let destination = join(targetRoot, strippedEntry);

        mkdirSync(dirname(destination), {recursive: true});
        copyFileSync(join(temporaryRoot, entry), destination);
      }

      log(`  wrote ${keptEntries.length} files to ${targetLabel}`);
    } finally {
      rmSync(temporaryRoot, {recursive: true, force: true});
    }
```

(If Task 4 ended up deleting the unused `let targetRoot = join(appRoot, 'assets/itch-io', packName);` line, re-add it now directly below the `let packName = ...` line.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Add itch.io import extraction"
```

---

### Task 6: Idempotency — skip already-imported packs

**Files:**
- Modify: `tools/import-itch-assets.ts`
- Modify: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: `run` (Tasks 4–5), `createZip`.
- Produces: skip behavior — a non-empty `assets/itch-io/<pack>/` is never touched again.

- [ ] **Step 1: Write the failing test**

Append inside `describe('run', ...)`:

```ts
  test('skips an already-imported pack without touching it', () => {
    createZip(join(appRoot, 'assets/raw/CozyPack_Full.zip'), {
      'CozyPack_Full/atlas.png': 'new-art',
    });
    mkdirSync(join(appRoot, 'assets/itch-io/cozy-pack-full'), {recursive: true});
    writeFileSync(join(appRoot, 'assets/itch-io/cozy-pack-full/atlas.png'), 'old-art');

    expect(run({appRoot, argv: [], log})).toBe(0);
    expect(output.join('\n')).toContain('already imported');
    expect(readFileSync(join(appRoot, 'assets/itch-io/cozy-pack-full/atlas.png'), 'utf8')).toBe(
      'old-art',
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: FAIL — `atlas.png` now contains `'new-art'` (the pack was re-extracted) and "already imported" was never logged.

- [ ] **Step 3: Implement the skip**

In `run`'s archive loop, replace:

```ts
    let listing = listArchiveEntries(archivePath);
```

with:

```ts
    if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) {
      log(
        `${archiveName} -> ${targetLabel}: already imported; delete the folder and re-run to re-import`,
      );

      continue;
    }

    let listing = listArchiveEntries(archivePath);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Skip already-imported itch.io packs"
```

---

### Task 7: Error handling — unsupported formats, batch continuation, exit codes, missing unzip

**Files:**
- Modify: `tools/import-itch-assets.ts`
- Modify: `tests/importItchAssets.test.ts`

**Interfaces:**
- Consumes: `run` (Tasks 4–6), `createZip`.
- Produces: final exit-code contract — `0` clean batch, `1` some archives failed, `2` hard error (bad args, missing `unzip`, unexpected I/O failure).

- [ ] **Step 1: Write the failing tests**

In `tests/importItchAssets.test.ts`, extend the child_process import and add the module mock (place the `vitest.mock` line directly below the import block, and add `vitest` to the vitest import):

```ts
import {spawnSync, type SpawnSyncReturns} from 'node:child_process';
```

```ts
import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';
```

```ts
vitest.mock(import('node:child_process'), {spy: true});
```

Append inside `describe('run', ...)`:

```ts
  test('reports a corrupt archive, continues the batch, and exits 1', () => {
    writeFileSync(join(appRoot, 'assets/raw/broken.zip'), 'this is not a zip file');
    createZip(join(appRoot, 'assets/raw/good.zip'), {'good/atlas.png': 'art'});

    expect(run({appRoot, argv: [], log})).toBe(1);
    expect(output.join('\n')).toContain('broken.zip: corrupt or unreadable archive');
    expect(readFileSync(join(appRoot, 'assets/itch-io/good/atlas.png'), 'utf8')).toBe('art');
  });

  test('reports an unsupported archive format, continues the batch, and exits 1', () => {
    writeFileSync(join(appRoot, 'assets/raw/apack.rar'), 'rar bytes');
    createZip(join(appRoot, 'assets/raw/good.zip'), {'good/atlas.png': 'art'});

    expect(run({appRoot, argv: [], log})).toBe(1);
    expect(output.join('\n')).toContain(
      'apack.rar: unsupported archive format; only .zip is supported',
    );
    expect(readFileSync(join(appRoot, 'assets/itch-io/good/atlas.png'), 'utf8')).toBe('art');
  });

  test('exits 2 when the batch dies on an unexpected filesystem error', () => {
    rmSync(join(appRoot, 'assets/raw'), {recursive: true, force: true});
    writeFileSync(join(appRoot, 'assets/raw'), 'a file where the raw directory should be');

    expect(run({appRoot, argv: [], log})).toBe(2);
    expect(output.join('\n')).toContain('ENOTDIR');
  });

  test('exits 2 with a clear message when the unzip binary is missing', () => {
    createZip(join(appRoot, 'assets/raw/CozyPack_Full.zip'), {'CozyPack_Full/atlas.png': 'art'});

    vitest.mocked(spawnSync).mockReturnValueOnce({
      pid: 0,
      output: [],
      stdout: '',
      stderr: '',
      status: null,
      signal: null,
      error: Object.assign(new Error('spawnSync unzip ENOENT'), {code: 'ENOENT'}),
    } as SpawnSyncReturns<string>);

    expect(run({appRoot, argv: [], log})).toBe(2);
    expect(output.join('\n')).toContain('`unzip` binary not found');
  });
```

(The mock has `spy: true`, so `createZip`'s real `zip` calls pass through untouched; `mockReturnValueOnce` only intercepts the next call, which is `run`'s `unzip -Z1`.)

- [ ] **Step 2: Run tests to verify the new behavior is missing**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: the corrupt-archive test FAILS on exit code (`0` instead of `1`), the `.rar` test FAILS (reported as corrupt, exit `0`), and the filesystem-error test FAILS (uncaught ENOTDIR exception instead of exit `2`). The missing-unzip test already passes (Task 4 implemented that branch) — that is fine; it locks the behavior in.

- [ ] **Step 3: Implement failure counting, the unsupported-format branch, and the top-level catch**

Four edits inside `run` in `tools/import-itch-assets.ts`:

1. Directly above the `for (let archiveName of archiveNames) {` line, add:

```ts
  let failures = 0;
```

2. Replace:

```ts
    let targetLabel = `assets/itch-io/${packName}/`;
```

with:

```ts
    let targetLabel = `assets/itch-io/${packName}/`;

    if (!archiveName.toLowerCase().endsWith('.zip')) {
      log(`${archiveName}: unsupported archive format; only .zip is supported`);
      failures += 1;

      continue;
    }
```

3. In both places that log `corrupt or unreadable archive` (the listing branch from Task 4 and the extraction branch from Task 5), add `failures += 1;` directly after the `log(...)` call. Then replace the final `return 0;` of `run` with:

```ts
  return failures > 0 ? 1 : 0;
```

4. Wrap the whole body of `run` after the `parseArgs` try/catch — everything from `let dryRun = values['dry-run'];` through the final `return failures > 0 ? 1 : 0;` — in a try/catch, exactly like `sync-tilesets`:

```ts
  try {
    // ...existing body; prettier re-indents it in Step 5...
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));

    return 2;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project unit tests/importItchAssets.test.ts`
Expected: PASS (19 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write tools/import-itch-assets.ts tests/importItchAssets.test.ts
npx eslint tools/import-itch-assets.ts tests/importItchAssets.test.ts
git add tools/import-itch-assets.ts tests/importItchAssets.test.ts
git commit -m "Handle corrupt and unsupported archives in itch.io import"
```

---

### Task 8: npm script + full project gates

**Files:**
- Modify: `package.json` (the `scripts` block, currently lines 14–27)

**Interfaces:**
- Consumes: the finished CLI (Tasks 4–7).
- Produces: `npm run import-itch-assets` (and `-- --dry-run`), used by Task 9.

- [ ] **Step 1: Add the script**

In `package.json`, scripts are sorted alphabetically (enforced by `prettier-plugin-packagejson`). Insert between `"format"` and `"lint"`:

```json
    "import-itch-assets": "tsx tools/import-itch-assets.ts",
```

- [ ] **Step 2: Smoke-test the CLI wiring**

Run: `npm run import-itch-assets -- --dry-run`
Expected: exit 0; report starts with `dry run — nothing will be written`, then one block per archive in lexicographic order with these summary lines:

```
SuperRetroOdyssey_ExteriorPack_week4.zip …   kept 15, dropped 43, flagged 1
SuperRetroWorld_CharacterPack_Full.zip …     kept 104, dropped 2, flagged 33
SuperRetroWorld_InteriorPack_Full.zip …      kept 15, dropped 17, flagged 1
exterior-pack-full_version.zip …             kept 160, dropped 0, flagged 2
```

Confirm `assets/itch-io/` was NOT created (`ls assets/` — no `itch-io`).

- [ ] **Step 3: Run all project gates**

Run, in order, expecting each to pass:

```bash
npm run typecheck
npm run lint
npm test
```

`npm test` runs the full unit + browser suite with coverage; the new test file runs in the `unit` project. Fix anything that fails before committing.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "Add import-itch-assets npm script"
```

---

### Task 9: Real-world import of all four raw packs

> **Plan update 2026-08-15:** three more archives were committed to `assets/raw/` after the original plan (`SuperRetroOdyssey_ExteriorPack_week4.zip`, `SuperRetroWorld_CharacterPack_Full.zip`, `exterior-pack-full_version.zip`). This task now imports and commits all four packs. All expected numbers below were verified by running the reviewed Task 1–3 helpers over the actual zip listings.

**Files:**
- Create (generated by the tool, then committed): four directories under `assets/itch-io/` — 294 files total.

**Interfaces:**
- Consumes: `npm run import-itch-assets` (Task 8) and the four real archives in `assets/raw/` (already committed).
- Produces: the committed asset set. Wiring any of these into `tilesets.config.json` stays a manual follow-up per `docs/tileset-automation.md` — NOT part of this plan.

- [ ] **Step 1: Dry-run against the real packs and verify the report**

Run: `npm run import-itch-assets -- --dry-run`

Expected report, per archive in lexicographic order (paths are wrapper-stripped):

1. `SuperRetroOdyssey_ExteriorPack_week4.zip -> assets/itch-io/super-retro-odyssey-exterior-pack-week4/` — wrapper folder `package` stripped.
   - **keep (15):** `atlas_16x.png`, `atlas_32x.png`, `atlas_48x.png`, and 12 files under `rpgmaker/MV/tilesets/` and `rpgmaker/MZ/tilesets/` (`SRO_ExteriorPack_A1/A2/B/C/D/E.png` each)
   - **drop (43):** everything under `screenshots/` (folder name "screenshots")
   - **flag (1):** `LICENCE.txt`
   - Summary: `kept 15, dropped 43, flagged 1`
2. `SuperRetroWorld_CharacterPack_Full.zip -> assets/itch-io/super-retro-world-character-pack-full/` — wrapper folder `SuperRetroWorld_CharacterPack_Full` stripped.
   - **keep (104):** 30 files under `rpgmaker/{MV,MZ,VXace}/characters/`, 10 under `sprite/`, 64 under `sprite_split/character_1..32/` (`*_frame16x20.png` + `*_frame32x32.png` each)
   - **drop (2):** `DONATE.html`, `STORE.html` (extension .html)
   - **flag (33):** `LICENCE.txt` + 32 `sprite_split/character_N/Note.txt`
   - Summary: `kept 104, dropped 2, flagged 33`
3. `SuperRetroWorld_InteriorPack_Full.zip -> assets/itch-io/super-retro-world-interior-pack-full/` — wrapper folder `SuperRetroWorld_InteriorPack_Full` stripped.
   - **keep (15):** `animation/chest_001.png` … `chest_004.png`, `animation/fire.png`, `animation/fire2.png`, `atlas_16x.png`, `atlas_32x.png`, `atlas_48x.png`, `rpgmaker/mvmz/tileset_B/C/D.png`, `rpgmaker/vxace/tileset_B/C/D.png`
   - **drop (17):** all 15 files under `every_packs_screenshots/` (folder name) plus `DONATE.html` and `STORE.html` (extension .html)
   - **flag (1):** `unity/tile_palette.unitypackage`
   - Summary: `kept 15, dropped 17, flagged 1`
4. `exterior-pack-full_version.zip -> assets/itch-io/exterior-pack-full-version/` — **no wrapper folder** (files sit at the archive root; real-world exercise of the no-wrapper path).
   - **keep (160):** `atlas.png`, 3 under `autotiles/`, 111 under `godot_autotiles/`, 40 under `rpgmaker/{MV,MZ,VXace}/`, 5 under `sprite/`
   - **drop (0)**
   - **flag (2):** `LICENCE.txt`, `legacy/legacy_tiles.zip` (nested zip — stays flagged, not recursed into)
   - Summary: `kept 160, dropped 0, flagged 2`

Note: the spec's Verification section says "nothing is flagged" — that line is wrong; the packs contain license/readme text files, a `.unitypackage`, and a nested `.zip` which the spec's own rules flag. The reports above are the correct application of the spec's rules. None of the flagged files need action (Unity-only payload, license notes kept in the archives, legacy nested zip).

- [ ] **Step 2: Run the real import**

Run: `npm run import-itch-assets`
Expected: exit 0, same report plus a `  wrote N files to assets/itch-io/<pack>/` line per archive (15, 104, 15, 160).

- [ ] **Step 3: Verify the output tree**

Run: `find assets/itch-io -type f | wc -l` → 294, spread over exactly the four pack directories (`find assets/itch-io -maxdepth 1 -type d`). Spot-check one image per pack has plausible size (e.g. `ls -la assets/itch-io/super-retro-world-interior-pack-full/atlas_48x.png` ≈ 41 KB).

- [ ] **Step 4: Verify idempotency on the real packs**

Run: `npm run import-itch-assets`
Expected: exit 0, exactly four lines, each ending `already imported; delete the folder and re-run to re-import`, no file changes (`git status` shows the same untracked set, nothing modified).

- [ ] **Step 5: Commit the imported assets**

```bash
git add assets/itch-io
git commit -m "Import itch.io asset packs"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** Goals 1–4 → Tasks 4–7 + 9 (one command, filtered, deterministic report, re-run safe). Filtering rules 1–4 → Task 2 (incl. rule-order test). Wrapper stripping → Tasks 3 & 5. Slug rule → Task 1. Idempotency → Task 6. `--dry-run` → Task 4. Error handling (missing unzip / corrupt / empty raw / unsupported format) → Tasks 4 & 7. npm script shape → Task 8. Spec's Testing section: every listed test exists (Tasks 1–7). Spec's Verification section → Tasks 8–9, with the "nothing is flagged" claim corrected against the real archive.
- **Non-goals respected:** no downloading, no credentials, no license manifest, no `tilesets.config.json` wiring, no content-based classification.
- **Type consistency:** `slugifyPackName(fileName: string): string`, `classifyEntry(entryPath: string): Classification`, `findWrapperPrefix(entryPaths: string[]): string | null`, `run(options: RunOptions): number` — used with exactly these names/signatures in every task.
