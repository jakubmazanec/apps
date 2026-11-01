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

function collectFromLayer(
  layer: XmlElement,
  firstGid: number,
  nextFirstGid: number,
  used: Set<number>,
): void {
  for (let data of findChildren(layer, 'data')) {
    if (getAttribute(data, 'encoding') !== 'csv') {
      throw new Error(
        `Map layer "${getAttribute(layer, 'name')}" is not CSV-encoded! Re-export the map from Tiled with "Tile Layer Format: CSV".`,
      );
    }

    for (let entry of (data.text ?? '').split(',')) {
      // eslint-disable-next-line no-bitwise -- masking off Tiled's flip/rotation flags requires a bitwise AND
      let gid = Number(entry.trim()) & GID_MASK;

      // A gid belongs to the tileset with the greatest firstgid <= it, so a
      // gid from a later tileset (>= nextFirstGid) is not this tileset's.
      if (gid >= firstGid && gid < nextFirstGid) {
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

    let {root} = parseXmlDocument(readFileSync(resolved, 'utf8'));
    let tilesetElements = findChildren(root, 'tileset');
    let reference = tilesetElements.find(
      (tileset) => basename(getAttribute(tileset, 'source') ?? '') === wanted,
    );

    if (!reference) {
      continue;
    }

    let firstGid = getNumericAttribute(reference, 'firstgid') ?? 1;
    // Tiled resolves a gid to the tileset with the greatest firstgid <= it,
    // so this tileset's gids stop just below the next tileset's firstgid.
    let nextFirstGid = tilesetElements
      .map((tileset) => getNumericAttribute(tileset, 'firstgid') ?? 1)
      .filter((candidate) => candidate > firstGid)
      .reduce((lowest, candidate) => Math.min(lowest, candidate), Infinity);

    for (let layer of findChildren(root, 'layer')) {
      if (layerClasses.includes(getAttribute(layer, 'class') ?? '')) {
        collectFromLayer(layer, firstGid, nextFirstGid, used);
      }
    }
  }

  return used;
}
