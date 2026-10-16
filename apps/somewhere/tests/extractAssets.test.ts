import {zipSync} from 'fflate';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {classifyEntry, findWrapperPrefix, run, slugifyPackName} from '../tools/extract-assets.js';

let appRoot = '';
let output: string[] = [];

function log(message: string): void {
  output.push(message);
}

// Builds a real zip with fflate, matching the tool's own reader. Listing the
// file paths explicitly (instead of recursive collection) stores exactly those
// entry names, which makes wrapper-folder scenarios precise.
function createZip(archivePath: string, files: Record<string, string>): void {
  let encoded: Record<string, Uint8Array> = {};

  for (let [filePath, contents] of Object.entries(files)) {
    encoded[filePath] = new TextEncoder().encode(contents);
  }

  writeFileSync(archivePath, zipSync(encoded));
}

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'extract-assets-'));
  output = [];

  mkdirSync(join(appRoot, 'assets/raw'), {recursive: true});
  writeFileSync(join(appRoot, 'assets/raw/.gitkeep'), '');
});

// eslint-disable-next-line vitest/require-top-level-describe -- global afterEach shared by all describe blocks
afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

describe(slugifyPackName, () => {
  test('slugifies the real pack name, splitting camelCase and underscores', () => {
    expect(slugifyPackName('SuperRetroWorld_InteriorPack_Full.zip')).toBe(
      'super-retro-world-interior-pack-full',
    );
  });

  test('collapses spaces and punctuation and trims stray hyphens', () => {
    expect(slugifyPackName('My Pack (v2).zip')).toBe('my-pack-v2');
  });
});

describe(classifyEntry, () => {
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

describe(findWrapperPrefix, () => {
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

describe(run, () => {
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
    expect(report).toContain('CozyPack_Full.zip -> assets/extracted/cozy-pack-full/');
    expect(report).toContain('keep animation/chest.png');
    expect(report).toContain('drop screenshots/promo.png (folder name "screenshots")');
    expect(report).toContain('drop DONATE.html (extension .html)');
    expect(report).toContain('flag notes.txt (unrecognized — review manually)');
    expect(report).toContain('kept 2, dropped 2, flagged 1');
    expect(existsSync(join(appRoot, 'assets/extracted'))).toBe(false);
  });

  test('extracts kept files, strips the wrapper folder, and preserves structure', () => {
    createZip(join(appRoot, 'assets/raw/CozyPack_Full.zip'), {
      'CozyPack_Full/atlas.png': 'atlas-art',
      'CozyPack_Full/animation/chest.png': 'chest-art',
      'CozyPack_Full/screenshots/promo.png': 'junk',
      'CozyPack_Full/DONATE.html': 'junk',
      'CozyPack_Full/notes.txt': 'meta',
    });

    expect(run({appRoot, argv: [], log})).toBe(0);
    expect(output.join('\n')).toContain('wrote 2 files to assets/extracted/cozy-pack-full/');

    let packRoot = join(appRoot, 'assets/extracted/cozy-pack-full');

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
    expect(readFileSync(join(appRoot, 'assets/extracted/loose/atlas.png'), 'utf8')).toBe(
      'atlas-art',
    );
    expect(readFileSync(join(appRoot, 'assets/extracted/loose/tiles/floor.png'), 'utf8')).toBe(
      'floor-art',
    );
  });

  test('skips an already-imported pack without touching it', () => {
    createZip(join(appRoot, 'assets/raw/CozyPack_Full.zip'), {
      'CozyPack_Full/atlas.png': 'new-art',
    });
    mkdirSync(join(appRoot, 'assets/extracted/cozy-pack-full'), {recursive: true});
    writeFileSync(join(appRoot, 'assets/extracted/cozy-pack-full/atlas.png'), 'old-art');

    expect(run({appRoot, argv: [], log})).toBe(0);
    expect(output.join('\n')).toContain('already imported');
    expect(readFileSync(join(appRoot, 'assets/extracted/cozy-pack-full/atlas.png'), 'utf8')).toBe(
      'old-art',
    );
  });

  test('reports a corrupt archive, continues the batch, and exits 1', () => {
    writeFileSync(join(appRoot, 'assets/raw/broken.zip'), 'this is not a zip file');
    createZip(join(appRoot, 'assets/raw/good.zip'), {'good/atlas.png': 'art'});

    expect(run({appRoot, argv: [], log})).toBe(1);
    expect(output.join('\n')).toContain('broken.zip: corrupt or unreadable archive');
    expect(readFileSync(join(appRoot, 'assets/extracted/good/atlas.png'), 'utf8')).toBe('art');
  });

  test('reports an unsupported archive format, continues the batch, and exits 1', () => {
    writeFileSync(join(appRoot, 'assets/raw/apack.rar'), 'rar bytes');
    createZip(join(appRoot, 'assets/raw/good.zip'), {'good/atlas.png': 'art'});

    expect(run({appRoot, argv: [], log})).toBe(1);
    expect(output.join('\n')).toContain(
      'apack.rar: unsupported archive format; only .zip is supported',
    );
    expect(readFileSync(join(appRoot, 'assets/extracted/good/atlas.png'), 'utf8')).toBe('art');
  });

  test('exits 2 when the batch dies on an unexpected filesystem error', () => {
    rmSync(join(appRoot, 'assets/raw'), {recursive: true, force: true});
    writeFileSync(join(appRoot, 'assets/raw'), 'a file where the raw directory should be');

    expect(run({appRoot, argv: [], log})).toBe(2);
    expect(output.join('\n')).toContain('ENOTDIR');
  });

  test('ignores directory entries and hostile ".." paths inside an archive', () => {
    createZip(join(appRoot, 'assets/raw/loose.zip'), {
      'atlas.png': 'atlas-art',
      'dir/floor.png': 'floor-art',
      'dir/': '',
      '../escape.png': 'escape-art',
      '..\\backslash-escape.png': 'backslash-art',
    });

    expect(run({appRoot, argv: [], log})).toBe(0);
    expect(output.join('\n')).toContain('loose.zip -> assets/extracted/loose/');
    expect(output.join('\n')).toContain('kept 2, dropped 0, flagged 0');
    expect(readFileSync(join(appRoot, 'assets/extracted/loose/atlas.png'), 'utf8')).toBe(
      'atlas-art',
    );
    expect(readFileSync(join(appRoot, 'assets/extracted/loose/dir/floor.png'), 'utf8')).toBe(
      'floor-art',
    );
    expect(existsSync(join(appRoot, 'assets/extracted/escape.png'))).toBe(false);
    expect(existsSync(join(appRoot, 'assets/extracted/backslash-escape.png'))).toBe(false);
  });
});
