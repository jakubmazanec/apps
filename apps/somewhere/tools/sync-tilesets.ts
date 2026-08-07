import {readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {argv, exit, stdin, stdout} from 'node:process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

import {
  applyDecisions,
  type CandidateGroup,
  type Decision,
  decisionTargets,
  groupCandidates,
} from './tiled-pipeline/accept.js';
import {analyzeTileset, formatReport, toConfigFragment} from './tiled-pipeline/analyze.js';
import {computeCollisionBox} from './tiled-pipeline/collision.js';
import {computeAll, type ComputedTileset} from './tiled-pipeline/compute.js';
import {type AnimationRegion, loadConfig} from './tiled-pipeline/config.js';
import {readTilesetImage} from './tiled-pipeline/pixels.js';
import {resolveCollisionMode} from './tiled-pipeline/resolve.js';
import {findChildren, getNumericAttribute, parseTsx} from './tiled-pipeline/tsx.js';

export type RunOptions = {
  appRoot: string;
  argv: string[];
  log: (message: string) => void;
};

// Temp file then rename: a crash cannot leave truncated output in public/.
// Node's rename overwrites an existing destination on Windows as well as POSIX.
function writeAtomic(path: string, contents: Uint8Array | string): void {
  let temporaryPath = `${path}.tmp`;

  writeFileSync(temporaryPath, contents);

  try {
    renameSync(temporaryPath, path);
  } catch (error) {
    // The rename can still fail after the write succeeded (a locked
    // destination, a permission error, ...). Remove the orphaned temp file so
    // a crash cannot leave it sitting in public/ forever; if the cleanup
    // itself fails, the original error is still what surfaces.
    try {
      unlinkSync(temporaryPath);
    } catch {
      // best-effort cleanup only
    }

    throw error;
  }
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
  // Deleting a tileset entry does not delete what it already wrote: nothing
  // runs on that .tsx again, so its auto-owned data survives and its
  // artifacts are orphaned in public/.
  log(
    'note: deleting a tileset from the config leaves its auto-owned data and public/ artifacts behind; resolve every rule to "none", run sync-tilesets, then delete the entry',
  );

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

      log(
        `  tile ${tileId}: ${mode}${box ? ` -> ${box.x},${box.y} ${box.width}x${box.height}` : ''}`,
      );
    }
  }
}

export async function run({appRoot, argv: args, log}: RunOptions): Promise<number> {
  let values;
  let positionals;

  try {
    ({values, positionals} = parseArgs({
      args,
      options: {
        check: {type: 'boolean', default: false},
        report: {type: 'boolean', default: false},
        json: {type: 'boolean', default: false},
        'print-config': {type: 'boolean', default: false},
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

    if (positionals[0] === 'analyze') {
      if (values.json) {
        // One array over every tileset, matching Task 17's contract: a consumer parses this as
        // JSON once. Logging per-tileset instead (as the interactive branch below does) would
        // print concatenated objects, which is not parseable JSON at all once there is more than
        // one tileset.
        log(
          JSON.stringify(
            config.tilesets.map((tileset) =>
              analyzeTileset({appRoot, tileset, analysis: config.analysis}),
            ),
            null,
            2,
          ),
        );

        return 0;
      }

      for (let tileset of config.tilesets) {
        let report = analyzeTileset({appRoot, tileset, analysis: config.analysis});

        if (values['print-config']) {
          log(toConfigFragment(report));

          continue;
        }

        log(formatReport(report));

        if (!stdin.isTTY) {
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
            decision:
              answer.startsWith('a') ? 'accept'
              : answer.startsWith('n') ? 'never'
              : 'skip',
          });
        }

        let animationDecisions: Array<{proposal: AnimationRegion; decision: Decision}> = [];

        for (let proposal of report.animationProposals) {
          let answer = await reader.question(
            `animation tiles ${proposal.start}..${proposal.start + proposal.frames - 1}\n  [a]ccept / [s]kip? `,
          );

          animationDecisions.push({
            proposal,
            decision: answer.startsWith('a') ? 'accept' : 'skip',
          });
        }

        reader.close();

        // Say what is about to be written before writing it.
        let targets = decisionTargets(decisions, animationDecisions, tileset.source);

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
      }

      return 0;
    }

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
