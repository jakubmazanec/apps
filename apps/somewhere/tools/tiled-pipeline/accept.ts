import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {format, resolveConfig} from 'prettier';

import {type AnalysisReport, type CandidateSource} from './analyze.js';
import {
  type AnimationRegion,
  type CollisionMode,
  DEFAULT_CONFIG_FILE_NAME,
  resolveInsideAppRoot,
  tilesetsConfigSchema,
} from './config.js';
import {
  AUTO_COLLISION_PROPERTY,
  getOrCreateTile,
  setBooleanProperty,
  sortTilesById,
} from './reconcile.js';
import {formatTsx, parseTsx} from './tsx.js';

export type CandidateGroup = {
  key: string;
  label: string;
  mode: CollisionMode;
  sources: CandidateSource[];
  tileIds: number[];
};

export type Decision = 'accept' | 'never' | 'skip';

function toRanges(tileIds: number[]): Array<[number, number]> {
  let ranges: Array<[number, number]> = [];

  for (let tileId of [...tileIds].sort((a, b) => a - b)) {
    let last = ranges.at(-1);

    if (last?.[1] === tileId - 1) {
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
    // A permanently blocked tile can never take effect (a manual box freezes it to "none", or
    // autoCollision: false opts it out unconditionally — see analyze.ts), so offering it here
    // would let "accept" look like it worked while changing nothing.
    if (candidate.permanentlyBlocked) {
      continue;
    }

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

  writeFileSync(path, await format(JSON.stringify(value, null, 2), {...options, filepath: path}));

  return path;
}

function suppressTiles(appRoot: string, source: string, tileIds: number[]): string {
  let path = resolveInsideAppRoot(appRoot, source);
  let document = parseTsx(readFileSync(path, 'utf8'));

  // Both the tile lookup and the property write go through reconcile.ts: a copy of them here
  // dropped the UTF-16 splice that keeps Tiled from rewriting the file on its next save.
  for (let tileId of tileIds) {
    setBooleanProperty(getOrCreateTile(document.root, tileId), AUTO_COLLISION_PROPERTY, false);
  }

  sortTilesById(document.root);
  writeFileSync(path, formatTsx(document));

  return path;
}

// What a set of decisions is about to write, before anything is written. The CLI has to print
// this before calling applyDecisions (see sync-tilesets.ts), so the prediction has to live
// somewhere other than inside applyDecisions itself — but keeping it here, next to the function
// whose behavior it predicts, is what stops the two from drifting apart. They already did once:
// the CLI used to compute this inline and forgot to count animation accepts, so an animation-only
// accept silently wrote nothing while the CLI reported "nothing accepted".
export function decisionTargets(
  decisions: Array<{group: CandidateGroup; decision: Decision}>,
  animationProposals: Array<{proposal: AnimationRegion; decision: Decision}>,
  tilesetSource: string,
): Set<string> {
  let targets = new Set<string>();

  for (let {decision} of decisions) {
    if (decision !== 'skip') {
      targets.add(decision === 'never' ? tilesetSource : DEFAULT_CONFIG_FILE_NAME);
    }
  }

  for (let {decision} of animationProposals) {
    if (decision === 'accept') {
      targets.add(DEFAULT_CONFIG_FILE_NAME);
    }
  }

  return targets;
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
  let entry = raw.tilesets.find((tileset) => tileset.name === tilesetName);

  if (!entry) {
    throw new Error(`No tileset named "${tilesetName}" in ${DEFAULT_CONFIG_FILE_NAME}!`);
  }

  let collision = (entry.collision ?? {}) as {
    regions?: Array<{range: [number, number]; mode: CollisionMode}>;
  };
  let animations = (entry.animations ?? {}) as {regions?: AnimationRegion[]};
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
      written.push(suppressTiles(appRoot, String(entry.source), group.tileIds));
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
    entry.collision = collision;

    if (animationRegions.length > 0) {
      animations.regions = animationRegions;
      entry.animations = animations;
    }

    // Validate before writing: a malformed accept must not land on disk.
    tilesetsConfigSchema.parse(raw);
    written.push(await writeConfig(appRoot, raw));
  }

  return written;
}
