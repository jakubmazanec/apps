import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

import {computeAll} from '../tools/tiled-pipeline/compute.js';
import {loadConfig} from '../tools/tiled-pipeline/config.js';

let appRoot = fileURLToPath(new URL('../', import.meta.url));

describe('the shipped tileset artifacts', () => {
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
