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
import {getBooleanProperty, getTileClass, isAutoObject, resolveCollisionMode} from './resolve.js';
import {
  findChild,
  findChildren,
  getAttribute,
  getNumericAttribute,
  parseTsx,
  type XmlElement,
} from './tsx.js';

export type CandidateSource = 'autoCollision' | 'manual' | 'mapLayer' | 'region' | 'tileClass';

export type CollisionCandidate = {
  tileId: number;
  sources: CandidateSource[];
  mode: CollisionMode;
  // The mode sync would actually apply right now, from the same precedence chain the build path
  // uses. A proposal whose resolvedMode is "none" will not take effect until the config or the
  // tile's own autoCollision property changes.
  resolvedMode: CollisionMode;
  // Set when accepting this proposal's region can never make it live: a manual box freezes the
  // tile to "none" and autoCollision: false opts it out unconditionally (both in resolve.ts),
  // regardless of what collision.regions or collision.tileClasses say.
  permanentlyBlocked: boolean;
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
    .map(([alpha, count]) => ({
      alpha,
      count,
      colors: [...(colorsByAlpha.get(alpha) ?? [])].sort(),
    }));
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

// A manual box freezes a tile to "none" unless autoCollision explicitly opts it back in, and
// autoCollision: false opts a tile out unconditionally (resolve.ts). Both hold regardless of what
// collision.regions or collision.tileClasses say, so no accepted proposal can ever change them.
function permanentBlockReason(
  flag: boolean | undefined,
  sources: CandidateSource[],
): string | undefined {
  if (flag === true) {
    return undefined;
  }

  if (flag === false) {
    return 'is opted out via autoCollision: false';
  }

  return sources.includes('manual') ? 'has a manual box' : undefined;
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
      inventory.empty += 1;
    } else if (solid === image.getTileMask(tileId).solid.length) {
      inventory.full += 1;
    } else {
      inventory.partial += 1;
    }

    let tile = tiles.get(tileId);
    let group = tile ? findChild(tile, 'objectgroup') : undefined;
    let tileClass = getTileClass(tile);

    // The flag claims the tile by itself: reconcile.ts maintains a box for it whatever the
    // config says, so it is a candidate with its own provenance. Without this the tile appears
    // nowhere in the report, and the conflict below is suppressed for it as well, leaving the
    // box in the build with nothing anywhere to name the tile it belongs to.
    if (getBooleanProperty(tile, 'autoCollision') === true) {
      addSource(tileId, 'autoCollision');
    }

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
      (tileClass === undefined ? undefined : tileset.collision.tileClasses[tileClass]) ?? 'bbox';

    // Last-matching region wins, same as resolve.ts: a narrower later entry has to be able to
    // override a broader earlier one, not be silently outranked by it.
    for (let region of tileset.collision.regions) {
      if (tileId >= region.range[0] && tileId <= region.range[1]) {
        mode = region.mode;
      }
    }

    let proposed = computeCollisionBox(
      image.getTileMask(tileId),
      mode,
      tileset.collision.footprintMaxHeight,
    );

    if (!proposed) {
      conflicts.push(`tile ${tileId} is a candidate but has no solid pixels to propose a box from`);
    }

    let resolvedMode = resolveCollisionMode({tileId, tile, collision: tileset.collision});
    let blockReason = permanentBlockReason(getBooleanProperty(tile, 'autoCollision'), sources);
    let permanentlyBlocked = blockReason !== undefined;

    if (blockReason) {
      conflicts.push(`tile ${tileId} ${blockReason}; accepting this proposal will not change it`);
    }

    candidates.push({
      tileId,
      sources,
      mode,
      resolvedMode,
      permanentlyBlocked,
      proposed,
      existing: existingBox(tile),
    });
  }

  for (let [tileId, tile] of tiles) {
    let group = findChild(tile, 'objectgroup');

    if (
      group &&
      findChildren(group, 'object').some((object) => isAutoObject(object)) &&
      !sourcesByTile.has(tileId) &&
      getBooleanProperty(tile, 'autoCollision') !== true
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
      minimumFrameDifference: tileset.animations.minimumFrameDifference,
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
      describeBox(candidate.existing) === describeBox(candidate.proposed) ?
        'unchanged'
      : `${describeBox(candidate.existing)} -> ${describeBox(candidate.proposed)}`;
    let modeSummary =
      candidate.mode === candidate.resolvedMode ?
        candidate.mode
      : `${candidate.mode} (resolved: ${candidate.resolvedMode})`;
    let blockedNote = candidate.permanentlyBlocked ? ' [blocked]' : '';

    lines.push(
      `  tile ${candidate.tileId} [${candidate.sources.join(', ')}] ${modeSummary}${blockedNote}  ${change}`,
    );
  }

  lines.push('', `## Animation proposals (${report.animationProposals.length})`);

  for (let proposal of report.animationProposals) {
    lines.push(`  tiles ${proposal.start}..${proposal.start + proposal.frames - 1}`);
  }

  lines.push(
    '',
    `## Conflicts and gaps (${report.conflicts.length})`,
    ...report.conflicts.map((conflict) => `  ${conflict}`),
  );

  return lines.join('\n');
}

// Contiguous candidate ids collapse into ranges, which is the shape the config
// wants and the shape a human can read.
export function toConfigFragment(report: AnalysisReport): string {
  let regions: Array<{range: [number, number]; mode: CollisionMode}> = [];

  for (let candidate of report.candidates) {
    // A permanently blocked tile can never take effect (see permanentBlockReason), so pasting a
    // region for it into the config would be a no-op forever.
    if (candidate.permanentlyBlocked) {
      continue;
    }

    let last = regions.at(-1);

    if (last?.mode === candidate.mode && last.range[1] === candidate.tileId - 1) {
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
