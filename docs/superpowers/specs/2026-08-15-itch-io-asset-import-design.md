# itch.io asset import — design

Date: 2026-08-15
App: `apps/somewhere`
Status: approved design, pending implementation plan

## Background

The game uses purchased itch.io asset packs (e.g. `assets/tileset.png`/`.tsx`, added in the Tiled
tileset automation work). Bringing a newly purchased pack into the project today means manually
unzipping it somewhere and sorting art from marketing filler by hand. This design adds a small,
deterministic import step that takes over the sorting.

itch.io has no API for a buyer to bulk-download everything they own — `butler` is a creator upload
tool, and the server API's `download_key` endpoint verifies ownership, it doesn't enumerate a
library. So the download itself stays manual and out of scope here (see "Non-goals"); what this
design automates is turning a downloaded zip into organized, committed project assets.

Verified against this session's actual environment:

- This project runs in a GitHub Codespace. Browser automation against itch.io (to log in and click
  "download") was considered and rejected: the account has 2FA, and neither an in-container
  headless browser (no display to complete a 2FA prompt) nor `claude-in-chrome` (uncertain whether
  its local relay bridges into a container) is a reliable path. The human completes the itch.io
  login and download in their own already-authenticated browser instead.
- The user is on an Android phone, not a desktop. Files reach the Codespace either via the
  Codespace's own web UI (VS Code web upload, tested and working — see `assets/raw/`) or via
  `github.com` → branch → path → **Add file → Upload files** (native file picker, 25 MiB/file
  limit) as a fallback.
- The system `unzip` binary (UnZip 6.00) is present in this container.
- A real test pack, `SuperRetroWorld_InteriorPack_Full.zip` (8.3 MB), was uploaded and inspected.
  It wraps everything in one top-level `SuperRetroWorld_InteriorPack_Full/` directory, and mixes
  real art (`atlas_16x/32x/48x.png`, `animation/*.png`) with non-asset filler: an
  `every_packs_screenshots/` folder of itch.io promo screenshots/gifs, and a `DONATE.html` page.
  The filtering rules below are shaped directly against this pack.

## Goals

1. Turn a raw pack archive sitting in `assets/raw/` into organized, filtered game assets under
   `assets/itch-io/<pack-name>/`, via one command.
2. Filter out non-asset marketing filler (promo screenshots, donation pages) automatically, without
   ever dropping real art by content — only by unambiguous extension or a recognized junk-folder
   name.
3. Deterministic and explainable: same archive in, same output and same report out every time: no
   network calls, no ML/content classification. This matches how `sync-tilesets` already works in
   this repo (`docs/tileset-automation.md`) — a build step whose decisions can be read off a diff
   and a report, not inferred.
4. Safe to re-run: an already-imported pack is left alone and reported, never silently overwritten.

## Non-goals / out of scope

- Downloading from itch.io. The human downloads packs in their own browser (already authenticated,
  handles 2FA) and brings the archive into `assets/raw/` themselves (Codespace upload UI, or
  `github.com` web upload as a fallback for larger files/desktop use).
- Credential storage of any kind — nothing in this design touches an itch.io password, API key, or
  session.
- License/attribution tracking (a manifest of per-pack source/author/license) — explicitly declined;
  the user will handle this separately.
- Wiring an imported tileset into `tilesets.config.json` — stays the existing manual step described
  in `docs/tileset-automation.md`. This tool only gets art into `assets/itch-io/`; deciding which
  files are tilesets and configuring them is unchanged.
- Content-based/ML filtering (image classification, "does this look like a screenshot"). Rejected in
  favor of deterministic rules — see Goal 3.

## Decisions

### Inputs and outputs

- **Input:** archive files placed in `assets/raw/` (created this session, tracked via
  `.gitkeep`). Nothing here is gitignored — raw archives are committed alongside the organized
  output, mirroring how `assets/tileset.png` is already committed.
- **Output:** `assets/itch-io/<pack-name>/`, one directory per archive, also committed.
- **Pack naming:** the archive's filename, slugified — lowercased, non-alphanumerics collapsed to
  `-` (e.g. `SuperRetroWorld_InteriorPack_Full.zip` → `super-retro-world-interior-pack-full`).
- **Wrapper-folder stripping:** if every entry in the archive is nested under a single top-level
  directory (the common itch.io export habit — true of the test pack), that directory's *contents*
  are extracted directly into `assets/itch-io/<pack-name>/`, not nested one level deeper inside it.
  If the archive has multiple top-level entries, everything extracts directly into
  `assets/itch-io/<pack-name>/` as-is.
- Directory structure below the (possibly stripped) root is otherwise preserved as-is for kept
  files, e.g. `assets/itch-io/super-retro-world-interior-pack-full/animation/chest_001.png`.

### Filtering rules

Applied per entry in the archive, in this order — drop rules are checked before the keep rule, so a
junk folder or a denylisted extension always wins over an otherwise-allowlisted file:

1. **Folder-name pattern → drop:** any path with a segment matching (case-insensitive, singular or
   plural) `screenshot(s)`, `preview(s)`, `promo(tional)`, `marketing`, `demo`. Checked against the
   full path, however deep the folder sits, and regardless of the file's own extension, so promo
   `.gif`/`.jpg`/`.png` files inside such a folder go too. (Catches `every_packs_screenshots/`.)
2. **Extension denylist → drop:** `.html .htm .url .exe .pdf`. Always non-asset formats, dropped
   regardless of location. (Catches `DONATE.html`.)
3. **Extension allowlist → keep:** images `.png .jpg .jpeg .gif .bmp .webp .tga`; audio
   `.wav .mp3 .ogg .flac`; fonts `.ttf .otf .woff`; Tiled `.tsx .tmx .tmj .tsj`; source sprites
   `.ase .aseprite`.
4. **Everything else → flagged, not copied.** Files that reach this point without matching any rule
   above (e.g. a stray `README.md`, an unrecognized extension) are left out of
   `assets/itch-io/<pack-name>/` but listed in the run's report as "unrecognized — review manually,"
   so nothing disappears without being visible in the output.

This ordering is what makes `every_packs_screenshots/*.png` droppable (rule 1 matches before rule 3
is ever reached) despite `.png` being keep-listed elsewhere.

### Idempotency

Before extracting an archive, the script checks whether `assets/itch-io/<pack-name>/` already exists
and is non-empty. If so, that archive is skipped and reported as "already imported," not
overwritten. Re-running after deleting the stale folder resolves it. This matches the "never
overwrite silently" stance the tileset pipeline already takes.

### Command

- New tool: `tools/import-itch-assets.ts`, run via `tsx`, added as an npm script:
  `"import-itch-assets": "tsx tools/import-itch-assets.ts"` — same shape as the existing
  `sync-tilesets` script.
- `npm run import-itch-assets` processes every archive in `assets/raw/`, extracts+filters new ones,
  skips already-imported ones, and prints a per-archive summary: files kept, files dropped (with
  which rule matched), files flagged for manual review.
- `npm run import-itch-assets -- --dry-run` computes and prints the same report without writing
  anything, for previewing a new archive before committing to the import.

### Error handling

- `unzip` binary missing → clear error naming the missing dependency, non-zero exit.
- A corrupt/invalid archive → reported for that one archive only; the rest of the batch still
  processes.
- `assets/raw/` empty (only `.gitkeep`) → "nothing to import," exits 0.
- Unsupported archive format (anything `unzip` can't read, e.g. `.rar`/`.7z`) → reported as
  unsupported for that file, not silently skipped, rest of the batch still processes.

## Testing

`tests/importItchAssets.test.ts` (vitest, fixture-directory style matching
`tests/syncTilesets.test.ts`):

- Extracts a zip's contents into the correctly slugified `assets/itch-io/<pack-name>/`.
- Strips a single top-level wrapper directory; preserves structure when there is none.
- Drops files by denylisted extension, and by folder-name pattern (including an allowlisted
  extension inside a drop-pattern folder).
- Flags an unrecognized file as "review manually" rather than copying or silently dropping it.
- Skips an archive whose target folder already exists and is non-empty, without modifying it.
- Reports (not crashes on) a corrupt archive and an unsupported format, and continues the batch.

## Verification

1. `npm run import-itch-assets -- --dry-run` against `assets/raw/SuperRetroWorld_InteriorPack_Full.zip`
   as a first real-world check: confirms `atlas_*.png` and `animation/*.png` are kept, `DONATE.html`
   and `every_packs_screenshots/` are dropped, nothing is flagged.
2. `npm run import-itch-assets` for real, review the diff, commit
   `assets/itch-io/super-retro-world-interior-pack-full/`.
3. `npm test`, `npm run typecheck`, `npm run lint`.

## Follow-ups (not this design)

- Deciding which imported files are tilesets and wiring them into `tilesets.config.json` stays a
  manual step per `docs/tileset-automation.md`.
- The folder-name/extension pattern lists are a starting set tuned against one real pack; expect to
  extend them the next time a pack's junk doesn't match (e.g. a differently named promo folder).
