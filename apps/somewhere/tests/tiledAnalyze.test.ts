import {encode} from 'fast-png';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {analyzeTileset, formatReport, toConfigFragment} from '../tools/tiled-pipeline/analyze.js';
import {loadConfig, type TilesetConfig} from '../tools/tiled-pipeline/config.js';

let appRoot = fileURLToPath(new URL('../', import.meta.url));

function analyzeReal() {
  let config = loadConfig(appRoot);

  return analyzeTileset({appRoot, tileset: config.tilesets[0]!, analysis: config.analysis});
}

describe(analyzeTileset, () => {
  test('reports the atlas alpha profile, including the shadow levels', () => {
    expect(analyzeReal().alphaLevels.map((level) => level.alpha)).toStrictEqual([0, 76, 102, 255]);
  });

  test('names the colour found at the shadow level, which is how the threshold gets chosen', () => {
    let shadow = analyzeReal().alphaLevels.find((level) => level.alpha === 102)!;

    expect(shadow.count).toBe(1686);
    expect(shadow.colors).toContain('rgba(0, 0, 0, 102)');
  });

  test('counts empty, fully solid and partial tiles', () => {
    expect(analyzeReal().inventory).toStrictEqual({empty: 3094, full: 187, partial: 815});
  });

  test('the demo map contributes mapLayer candidates', () => {
    expect(
      analyzeReal().candidates.some((candidate) => candidate.sources.includes('mapLayer')),
    ).toBe(true);
  });

  test('each candidate carries its proposed geometry and the box already there', () => {
    let tile64 = analyzeReal().candidates.find((candidate) => candidate.tileId === 64)!;

    expect(tile64.proposed).toStrictEqual({x: 2, y: 8, width: 12, height: 8});
    expect(tile64.existing).toStrictEqual({x: 2, y: 8, width: 12, height: 8});
  });

  test('proposes the four fire strips and none of the furniture runs on the real atlas', () => {
    let proposals = analyzeReal().animationProposals;

    for (let start of [353, 417, 481, 545]) {
      expect(proposals).toContainEqual({start, frames: 6, duration: 150});
    }

    // The tent, couch and awning slices that the old similarity ceiling
    // mistook for animation frames.
    for (let start of [69, 133, 192, 197, 581, 645]) {
      expect(proposals.find((proposal) => proposal.start === start)).toBeUndefined();
    }
  });

  test('an absent analysis block is complete and yields no mapLayer candidates', () => {
    let config = loadConfig(appRoot);
    let report = analyzeTileset({appRoot, tileset: config.tilesets[0]!, analysis: undefined});

    expect(report.candidates.every((candidate) => !candidate.sources.includes('mapLayer'))).toBe(
      true,
    );
  });

  test('the manual tiles are permanently blocked, since a manual box freezes them to none regardless of the config', () => {
    let manual = analyzeReal().candidates.filter((candidate) =>
      candidate.sources.includes('manual'),
    );

    expect(manual.every((candidate) => candidate.resolvedMode === 'none')).toBe(true);
    expect(manual.every((candidate) => candidate.permanentlyBlocked)).toBe(true);
  });

  test('a mapLayer candidate with no manual box is proposed normally, unlike the manual tiles', () => {
    let tile1502 = analyzeReal().candidates.find((candidate) => candidate.tileId === 1502)!;

    expect(tile1502.permanentlyBlocked).toBe(false);
    expect(tile1502.mode).toBe('bbox');
  });

  test('the last matching region wins, so a narrower later region overrides a broader earlier one', () => {
    let config = loadConfig(appRoot);
    let tileset: TilesetConfig = {
      ...config.tilesets[0]!,
      collision: {
        ...config.tilesets[0]!.collision,
        regions: [
          {range: [0, 4095], mode: 'bbox'},
          {range: [1232, 1234], mode: 'footprint'},
        ],
      },
    };
    let report = analyzeTileset({appRoot, tileset, analysis: config.analysis});
    let tile1232 = report.candidates.find((candidate) => candidate.tileId === 1232)!;

    expect(tile1232.mode).toBe('footprint');
  });
});

describe('report rendering', () => {
  test('formatReport names every section a human needs', () => {
    let text = formatReport(analyzeReal());

    expect(text).toMatch(/alpha/i);
    expect(text).toMatch(/inventory/i);
    expect(text).toMatch(/candidate/i);
    expect(text).toContain('tile 193');
  });

  test('toConfigFragment emits parseable JSON with the candidate ranges', () => {
    let fragment = JSON.parse(toConfigFragment(analyzeReal())) as {
      collision: {regions: Array<{range: [number, number]; mode: string}>};
    };

    expect(fragment.collision.regions.length).toBeGreaterThan(0);
    expect(fragment.collision.regions[0]!.mode).toBe('bbox');
  });
});

function tilesetWithRegion(): TilesetConfig {
  return {
    name: 'tileset',
    source: 'assets/tileset.tsx',
    image: 'assets/tileset.png',
    output: 'public/tileset.json',
    outputImage: 'public/tileset.png',
    solidAlphaThreshold: 255,
    collision: {
      default: 'none',
      regions: [{range: [1232, 1232], mode: 'bbox'}],
      tileClasses: {},
      footprintMaxHeight: 8,
    },
    animations: {regions: [], minimumFrameDifference: 0.7},
  };
}

describe('autoCollision visibility', () => {
  let tempAppRoot = '';

  beforeEach(() => {
    tempAppRoot = mkdtempSync(join(tmpdir(), 'tiled-analyze-'));
    mkdirSync(join(tempAppRoot, 'assets'));

    let sourceText = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');
    let augmented = sourceText.replace(
      '</tileset>',
      [
        ' <tile id="1232"><properties><property name="autoCollision" type="bool" value="false"/></properties></tile>',
        ' <tile id="1300"><properties><property name="autoCollision" type="bool" value="true"/></properties><objectgroup draworder="index" id="2"><object id="1" type="auto" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
        '</tileset>',
      ].join('\n'),
    );

    writeFileSync(join(tempAppRoot, 'assets/tileset.tsx'), augmented);
    cpSync(join(appRoot, 'assets/tileset.png'), join(tempAppRoot, 'assets/tileset.png'));
  });

  afterEach(() => {
    rmSync(tempAppRoot, {recursive: true, force: true});
  });

  test('a tile opted out via autoCollision: false is permanently blocked and excluded from the fragment', () => {
    let report = analyzeTileset({
      appRoot: tempAppRoot,
      tileset: tilesetWithRegion(),
      analysis: undefined,
    });
    let candidate = report.candidates.find((entry) => entry.tileId === 1232)!;

    expect(candidate.permanentlyBlocked).toBe(true);
    expect(candidate.resolvedMode).toBe('none');
    expect(report.conflicts).toContain(
      'tile 1232 is opted out via autoCollision: false; accepting this proposal will not change it',
    );

    let fragment = JSON.parse(toConfigFragment(report)) as {
      collision: {regions: Array<{range: [number, number]; mode: string}>};
    };

    expect(
      fragment.collision.regions.some(
        (region) => region.range[0] <= 1232 && region.range[1] >= 1232,
      ),
    ).toBe(false);
  });

  // reconcile.ts maintains a box for a tile the flag claims, so a report that never names the
  // tile leaves the author no way to see, from the report alone, why the box is in the build.
  test('a tile claimed only by autoCollision: true is a candidate with its own provenance', () => {
    let report = analyzeTileset({
      appRoot: tempAppRoot,
      tileset: tilesetWithRegion(),
      analysis: undefined,
    });
    let candidate = report.candidates.find((entry) => entry.tileId === 1300);

    expect(candidate?.sources).toStrictEqual(['autoCollision']);
    expect(candidate?.permanentlyBlocked).toBe(false);
    expect(candidate?.mode).toBe('bbox');
    expect(candidate?.resolvedMode).toBe('bbox');
    expect(formatReport(report)).toContain('tile 1300 [autoCollision]');
  });

  test('autoCollision: true suppresses the false "no rule claims it" conflict', () => {
    let report = analyzeTileset({
      appRoot: tempAppRoot,
      tileset: tilesetWithRegion(),
      analysis: undefined,
    });

    expect(report.conflicts.some((conflict) => conflict.includes('tile 1300'))).toBe(false);
  });
});

// A 2x1-tile atlas dedicated to manual-box behaviour, independent of the live atlas so these
// tests keep exercising a manual box even after production adopts one. Tile 0 gets a 2x2 solid
// block at (1, 1), so bbox proposes {x: 1, y: 1, width: 2, height: 2}; tile 1 gets a 3x3 block at
// (2, 2), a different shape so the two tiles are easy to tell apart in assertions.
function manualBoxAtlas(): Uint8Array {
  let data = new Uint8Array(32 * 16 * 4);
  let paint = (x: number, y: number) => data.set([10, 20, 30, 255], (y * 32 + x) * 4);

  for (let y = 1; y <= 2; y++) {
    for (let x = 1; x <= 2; x++) {
      paint(x, y);
    }
  }

  for (let y = 2; y <= 4; y++) {
    for (let x = 18; x <= 20; x++) {
      paint(x, y);
    }
  }

  return encode({width: 32, height: 16, data, channels: 4, depth: 8});
}

function manualBoxTileset(): TilesetConfig {
  return {
    name: 't',
    source: 'assets/t.tsx',
    image: 'assets/t.png',
    output: 'public/t.json',
    outputImage: 'public/t.png',
    solidAlphaThreshold: 255,
    collision: {
      default: 'bbox',
      // Tile 1 needs a rule of its own so its candidate is not permanently blocked, which is what
      // proves the manual tile's exclusion below is selective rather than an empty fragment.
      regions: [{range: [1, 1], mode: 'bbox'}],
      tileClasses: {},
      footprintMaxHeight: 8,
    },
    animations: {regions: [], minimumFrameDifference: 0.7},
  };
}

describe('manual box provenance', () => {
  let tempAppRoot = '';

  beforeEach(() => {
    tempAppRoot = mkdtempSync(join(tmpdir(), 'tiled-analyze-manual-'));
    mkdirSync(join(tempAppRoot, 'assets'));

    // Tile 0's box, x=1 y=1 width=2 height=3, is one row taller than the pixels justify (height
    // 2): the same "author rounded up over a drop-shadow row" shape the live atlas's tile 193 had
    // before it was adopted. The missing `type` attribute is what makes the object manual.
    writeFileSync(
      join(tempAppRoot, 'assets/t.tsx'),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="2" columns="2">',
        ' <image source="t.png" width="32" height="16"/>',
        ' <tile id="0">',
        '  <objectgroup draworder="index" id="2">',
        '   <object id="1" x="1" y="1" width="2" height="3"/>',
        '  </objectgroup>',
        ' </tile>',
        '</tileset>',
        '',
      ].join('\n'),
    );
    writeFileSync(join(tempAppRoot, 'assets/t.png'), manualBoxAtlas());
  });

  afterEach(() => {
    rmSync(tempAppRoot, {recursive: true, force: true});
  });

  function report() {
    return analyzeTileset({appRoot: tempAppRoot, tileset: manualBoxTileset(), analysis: undefined});
  }

  test('the manually authored tile is a candidate with manual provenance', () => {
    let manual = report().candidates.filter((candidate) => candidate.sources.includes('manual'));

    expect(manual.map((candidate) => candidate.tileId)).toStrictEqual([0]);
  });

  test('the tile where the proposal disagrees with the author is visible in the report', () => {
    let tile0 = report().candidates.find((candidate) => candidate.tileId === 0)!;

    expect(tile0.existing).toStrictEqual({x: 1, y: 1, width: 2, height: 3});
    expect(tile0.proposed).toStrictEqual({x: 1, y: 1, width: 2, height: 2});
  });

  test('a manual box is named in the conflicts list, since accepting its region alone cannot fix it', () => {
    expect(report().conflicts).toContain(
      'tile 0 has a manual box; accepting this proposal will not change it',
    );
  });

  test('toConfigFragment excludes the permanently blocked manual tile, since a region for it is a no-op forever', () => {
    let fragment = JSON.parse(toConfigFragment(report())) as {
      collision: {regions: Array<{range: [number, number]; mode: string}>};
    };

    expect(fragment.collision.regions.every((region) => region.range[0] > 0)).toBe(true);
    // And the unblocked tile 1 is present, so the exclusion above is proven selective rather than
    // an empty fragment that would pass the same assertion by accident.
    expect(
      fragment.collision.regions.some((region) => region.range[0] <= 1 && region.range[1] >= 1),
    ).toBe(true);
  });
});
