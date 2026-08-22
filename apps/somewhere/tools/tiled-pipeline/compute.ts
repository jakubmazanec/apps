import {existsSync, readFileSync} from 'node:fs';
import {basename} from 'node:path';

import {resolveInsideAppRoot, type TilesetConfig, type TilesetsConfig} from './config.js';
import {formatJson} from './json.js';
import {readTilesetImage} from './pixels.js';
import {reconcile} from './reconcile.js';
import {findChild, formatTsx, getAttribute, getNumericAttribute, parseTsx} from './tsx.js';

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
  let imageElement = findChild(document.root, 'image');

  if (!imageElement) {
    throw new Error(
      'The tileset has no <image> element! Collection-of-images tilesets are not supported.',
    );
  }

  let transparentColor = getAttribute(imageElement, 'trans');
  let image = readTilesetImage(imageBytes, {
    tileWidth: getNumericAttribute(document.root, 'tilewidth') ?? 0,
    tileHeight: getNumericAttribute(document.root, 'tileheight') ?? 0,
    margin: getNumericAttribute(document.root, 'margin') ?? 0,
    spacing: getNumericAttribute(document.root, 'spacing') ?? 0,
    solidAlphaThreshold: tileset.solidAlphaThreshold,
    ...(transparentColor === undefined ?
      {}
    : {transparentColor: `#${transparentColor.replace('#', '')}`}),
  });
  let {warnings} = reconcile(document, {tileset, image});
  let sourceText = formatTsx(document);
  // The exported JSON's "image" field is the shipped runtime path (outputImage's basename), not
  // the tileset's own <image source> authoring path: those diverge whenever the source PNG lives
  // outside public/ (an extracted asset pack), and only the shipped name resolves in the browser.
  let outputText = formatJson(document, basename(tileset.outputImage));
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
