import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {
  applyDecisions,
  type CandidateGroup,
  decisionTargets,
  groupCandidates,
} from '../tools/tiled-pipeline/accept.js';
import {analyzeTileset} from '../tools/tiled-pipeline/analyze.js';
import {loadConfig} from '../tools/tiled-pipeline/config.js';

let realAppRoot = fileURLToPath(new URL('../', import.meta.url));
let appRoot = '';

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeEach shared by all describe blocks
beforeEach(() => {
  appRoot = mkdtempSync(join(tmpdir(), 'tiled-accept-'));

  mkdirSync(join(appRoot, 'assets'));
  mkdirSync(join(appRoot, 'public'));
  cpSync(join(realAppRoot, 'assets/tileset.tsx'), join(appRoot, 'assets/tileset.tsx'));
  cpSync(join(realAppRoot, 'assets/tileset.png'), join(appRoot, 'assets/tileset.png'));
  cpSync(join(realAppRoot, 'assets/map.tmx'), join(appRoot, 'assets/map.tmx'));

  // Every assertion below counts the regions applyDecisions wrote. Copying the real config
  // verbatim would make those counts "accepted + whatever the app has adopted so far", so the
  // fixture starts from an empty region list and the counts describe this file's own writes.
  let config = JSON.parse(readFileSync(join(realAppRoot, 'tilesets.config.json'), 'utf8')) as {
    tilesets: Array<{
      collision?: {regions?: unknown[]};
      animations?: {regions?: unknown[]};
    }>;
  };

  config.tilesets[0]!.collision = {...config.tilesets[0]!.collision, regions: []};
  config.tilesets[0]!.animations = {...config.tilesets[0]!.animations, regions: []};
  writeFileSync(join(appRoot, 'tilesets.config.json'), JSON.stringify(config, null, 2));
});

// eslint-disable-next-line vitest/require-top-level-describe -- global afterEach shared by all describe blocks
afterEach(() => {
  rmSync(appRoot, {recursive: true, force: true});
});

function report() {
  let config = loadConfig(appRoot);

  return analyzeTileset({appRoot, tileset: config.tilesets[0]!, analysis: config.analysis});
}

function group(tileIds: number[]): CandidateGroup {
  return {
    key: `test:bbox:${tileIds[0]}`,
    label: 'test',
    mode: 'bbox',
    sources: ['mapLayer'],
    tileIds,
  };
}

describe(groupCandidates, () => {
  test('groups by provenance and mode, and collapses contiguous ids', () => {
    let groups = groupCandidates(report());

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((entry) => entry.tileIds.length > 0)).toBe(true);
    expect(new Set(groups.map((entry) => entry.key)).size).toBe(groups.length);
  });

  test('never offers a permanently blocked candidate for accept', () => {
    // The live atlas has no manual box of its own to pin this to (the fixture's copy of it was
    // adopted into automation, same as the app's), so a manual box is added here instead: tile
    // 4000 is unused in the real atlas, and the missing `type` attribute makes the object manual.
    let tsxPath = join(appRoot, 'assets/tileset.tsx');

    writeFileSync(
      tsxPath,
      readFileSync(tsxPath, 'utf8').replace(
        '</tileset>',
        [
          ' <tile id="4000">',
          '  <objectgroup draworder="index" id="2">',
          '   <object id="1" x="0" y="0" width="4" height="4"/>',
          '  </objectgroup>',
          ' </tile>',
          '</tileset>',
        ].join('\n'),
      ),
    );

    let analysis = report();
    let blockedIds = new Set(
      analysis.candidates
        .filter((candidate) => candidate.permanentlyBlocked)
        .map((candidate) => candidate.tileId),
    );
    let offeredIds = groupCandidates(analysis).flatMap((entry) => entry.tileIds);

    expect(blockedIds.has(4000)).toBe(true);
    expect(offeredIds.length).toBeGreaterThan(0);
    expect(offeredIds.every((tileId) => !blockedIds.has(tileId))).toBe(true);
  });
});

describe(applyDecisions, () => {
  test('accept appends a collision region and leaves the file prettier-clean', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([128, 129, 130]), decision: 'accept'}],
      animationProposals: [],
    });

    let text = readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8');

    expect(text).toContain('"range": [128, 130]');
    expect(text).toContain('"mode": "bbox"');
    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toHaveLength(1);
  });

  test('a non-contiguous group becomes several ranges', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([64, 66]), decision: 'accept'}],
      animationProposals: [],
    });

    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toStrictEqual([
      {range: [64, 64], mode: 'bbox'},
      {range: [66, 66], mode: 'bbox'},
    ]);
  });

  test('never writes autoCollision false onto each tile and touches no config', async () => {
    let before = readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8');

    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([64]), decision: 'never'}],
      animationProposals: [],
    });

    let tsx = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');

    expect(tsx).toContain('<property name="autoCollision" type="bool" value="false"/>');
    expect(tsx).toContain('\r\n'); // the writer preserved the source newline
    expect(readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8')).toBe(before);
  });

  test('never splices the property into Tiled’s order rather than appending it', async () => {
    let tsxPath = join(appRoot, 'assets/tileset.tsx');

    // "blocked" sorts after "autoCollision" by UTF-16 code unit, which is the order Tiled writes
    // properties in; appending instead would hand back a file Tiled rewrites on its next save.
    writeFileSync(
      tsxPath,
      readFileSync(tsxPath, 'utf8').replace(
        '</tileset>',
        [
          ' <tile id="1000">',
          '  <properties>',
          '   <property name="blocked" type="bool" value="true"/>',
          '  </properties>',
          ' </tile>',
          '</tileset>',
        ].join('\r\n'),
      ),
    );

    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([1000]), decision: 'never'}],
      animationProposals: [],
    });

    expect(readFileSync(tsxPath, 'utf8')).toContain(
      '<property name="autoCollision" type="bool" value="false"/>\r\n   <property name="blocked" type="bool" value="true"/>',
    );
  });

  test('skip writes nothing at all', async () => {
    let config = readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8');
    let tsx = readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8');

    await expect(
      applyDecisions({
        appRoot,
        tilesetName: 'tileset',
        decisions: [{group: group([64]), decision: 'skip'}],
        animationProposals: [],
      }),
    ).resolves.toStrictEqual([]);
    expect(readFileSync(join(appRoot, 'tilesets.config.json'), 'utf8')).toBe(config);
    expect(readFileSync(join(appRoot, 'assets/tileset.tsx'), 'utf8')).toBe(tsx);
  });

  test('accepting an animation proposal appends an animation region', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [],
      animationProposals: [{proposal: {start: 256, frames: 4, duration: 150}, decision: 'accept'}],
    });

    expect(loadConfig(appRoot).tilesets[0]!.animations.regions).toStrictEqual([
      {start: 256, frames: 4, duration: 150},
    ]);
  });

  test('accepting the same group twice does not duplicate the region', async () => {
    let options = {
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([128, 130]), decision: 'accept' as const}],
      animationProposals: [],
    };

    await applyDecisions(options);
    await applyDecisions(options);

    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toHaveLength(2);
  });

  test('nothing accepted leaves a dependency on the map that suggested it', async () => {
    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [{group: group([128, 130]), decision: 'accept'}],
      animationProposals: [],
    });

    rmSync(join(appRoot, 'assets/map.tmx'));

    expect(loadConfig(appRoot).tilesets[0]!.collision.regions).toHaveLength(2);
  });
});

describe(decisionTargets, () => {
  test('counts an animation-only accept as something to write, and it reaches the config', async () => {
    let animationProposals = [
      {proposal: {start: 256, frames: 4, duration: 150}, decision: 'accept' as const},
    ];

    // This is exactly what gates the CLI's "nothing accepted; no files written" message (see
    // sync-tilesets.ts): if targets came back empty here, that message would print — and
    // applyDecisions would never be called — even though the user accepted an animation proposal.
    expect(decisionTargets([], animationProposals, 'assets/tileset.tsx').size).toBeGreaterThan(0);

    await applyDecisions({
      appRoot,
      tilesetName: 'tileset',
      decisions: [],
      animationProposals,
    });

    expect(loadConfig(appRoot).tilesets[0]!.animations.regions).toStrictEqual([
      {start: 256, frames: 4, duration: 150},
    ]);
  });
});
