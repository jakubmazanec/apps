import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

import {run} from '../tools/sync-tilesets.js';

vitest.mock(import('node:fs'), {spy: true});

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';
let output: string[] = [];

function log(message: string): void {
  output.push(message);
}

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'sync-tilesets-'));
  output = [];

  mkdirSync(join(appRoot, 'assets'));
  mkdirSync(join(appRoot, 'public'));
  cpSync(join(realAppRoot, 'assets/tileset.tsx'), join(appRoot, 'assets/tileset.tsx'));
  cpSync(join(realAppRoot, 'assets/tileset.png'), join(appRoot, 'assets/tileset.png'));
  cpSync(join(realAppRoot, 'public/tileset.json'), join(appRoot, 'public/tileset.json'));
  cpSync(join(realAppRoot, 'public/tileset.png'), join(appRoot, 'public/tileset.png'));
  cpSync(join(realAppRoot, 'tilesets.config.json'), join(appRoot, 'tilesets.config.json'));
});

// eslint-disable-next-line vitest/require-top-level-describe -- global afterEach shared by all describe blocks
afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe('sync-tilesets', () => {
  test('exits 0 and writes nothing when everything is already up to date', async () => {
    let before = readFileSync(join(appRoot, 'public/tileset.json'), 'utf8');

    await expect(run({appRoot, argv: [], log})).resolves.toBe(0);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe(before);
  });

  test('--check exits 1 on drift and writes nothing', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    await expect(run({appRoot, argv: ['--check'], log})).resolves.toBe(1);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe('{}\n');
  });

  test('--check exits 0 when there is no drift', async () => {
    await expect(run({appRoot, argv: ['--check'], log})).resolves.toBe(0);
  });

  test('the default mode repairs drift', async () => {
    let expected = readFileSync(join(appRoot, 'public/tileset.json'), 'utf8');

    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    await expect(run({appRoot, argv: [], log})).resolves.toBe(0);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe(expected);
  });

  test('the default mode creates a missing output image', async () => {
    rmSync(join(appRoot, 'public/tileset.png'));

    await expect(run({appRoot, argv: [], log})).resolves.toBe(0);
    expect(
      readFileSync(join(appRoot, 'public/tileset.png')).equals(
        readFileSync(join(appRoot, 'assets/tileset.png')),
      ),
    ).toBe(true);
  });

  test('--report prints per-tile decisions and writes nothing', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    await expect(run({appRoot, argv: ['--report'], log})).resolves.toBe(0);
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe('{}\n');
    expect(output.join('\n')).toMatch(/tile 64/);
  });

  test('--report warns that deleting a tileset entry orphans its output', async () => {
    await expect(run({appRoot, argv: ['--report'], log})).resolves.toBe(0);

    expect(output.join('\n')).toMatch(/resolve every rule to "none"/);
  });

  test('analyze --json prints one parseable array over every tileset', async () => {
    await expect(run({appRoot, argv: ['analyze', '--json'], log})).resolves.toBe(0);

    let reports = JSON.parse(output.join('')) as unknown[];

    expect(Array.isArray(reports)).toBe(true);
    expect(reports).toHaveLength(1);
  });

  test('analyze --print-config prints a config fragment', async () => {
    await expect(run({appRoot, argv: ['analyze', '--print-config'], log})).resolves.toBe(0);

    expect(output.join('\n')).toMatch(/"collision"/);
    expect(output.join('\n')).toMatch(/"animations"/);
  });

  test('exits 2 on a hard error, and 2 wins over drift', async () => {
    rmSync(join(appRoot, 'assets/tileset.png'));

    await expect(run({appRoot, argv: ['--check'], log})).resolves.toBe(2);
  });

  test('exits 2 when the config escapes the app root', async () => {
    writeFileSync(
      join(appRoot, 'tilesets.config.json'),
      `${JSON.stringify(
        {
          tilesets: [
            {
              name: 't',
              source: '../../escape.tsx',
              image: 'assets/tileset.png',
              output: 'public/t.json',
              outputImage: 'public/t.png',
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    await expect(run({appRoot, argv: [], log})).resolves.toBe(2);
  });

  test('writes nothing at all when any tileset fails to compute', async () => {
    let config = JSON.parse(readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8')) as {
      tilesets: unknown[];
    };

    config.tilesets.push({
      name: 'broken',
      source: 'assets/missing.tsx',
      image: 'assets/missing.png',
      output: 'public/missing.json',
      outputImage: 'public/missing.png',
    });
    writeFileSync(join(appRoot, 'tilesets.config.json'), `${JSON.stringify(config, null, 2)}\n`);
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    await expect(run({appRoot, argv: [], log})).resolves.toBe(2);
    // The healthy tileset was NOT written: the write phase is all-or-nothing.
    expect(readFileSync(join(appRoot, 'public/tileset.json'), 'utf8')).toBe('{}\n');
    expect(existsSync(join(appRoot, 'public/missing.json'))).toBe(false);
  });

  test('leaves no temp files behind', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    await run({appRoot, argv: [], log});

    expect(existsSync(join(appRoot, 'public/tileset.json.tmp'))).toBe(false);
  });

  test('cleans up the temp file when the atomic rename fails', async () => {
    writeFileSync(join(appRoot, 'public/tileset.json'), '{}\n');

    vitest.mocked(renameSync).mockImplementationOnce(() => {
      throw new Error('simulated rename failure');
    });

    await expect(run({appRoot, argv: [], log})).resolves.toBe(2);
    expect(existsSync(join(appRoot, 'assets/tileset.tsx.tmp'))).toBe(false);
  });
});
