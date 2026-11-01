import {encode} from 'fast-png';
import {describe, expect, test} from 'vitest';

import {tilesetsConfigSchema} from '../tools/tiled-pipeline/config.js';
import {readTilesetImage, type TilesetImage} from '../tools/tiled-pipeline/pixels.js';
import {reconcile} from '../tools/tiled-pipeline/reconcile.js';
import {formatTsx, parseTsx, type XmlDocument} from '../tools/tiled-pipeline/tsx.js';

// A 2x2-tile, 32x32 atlas. Tile 0 is a 2x2 solid block at (1, 1); tiles 1-3
// are empty unless `solidTiles` says otherwise.
function atlas(solidTiles: number[] = [0]): Uint8Array {
  let data = new Uint8Array(32 * 32 * 4);

  for (let tileId of solidTiles) {
    let originX = (tileId % 2) * 16;
    let originY = Math.floor(tileId / 2) * 16;

    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 3; x++) {
        data.set([10, 20, 30, 255], ((originY + y) * 32 + originX + x) * 4);
      }
    }
  }

  return encode({width: 32, height: 32, data, channels: 4, depth: 8});
}

function imageFor(solidTiles: number[] = [0]): TilesetImage {
  return readTilesetImage(atlas(solidTiles), {
    tileWidth: 16,
    tileHeight: 16,
    margin: 0,
    spacing: 0,
    solidAlphaThreshold: 255,
  });
}

function documentWith(tiles: string[]): XmlDocument {
  return parseTsx(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
      ' <image source="t.png" width="32" height="32"/>',
      ...tiles,
      '</tileset>',
      '',
    ].join('\n'),
  );
}

function configFor(overrides: Record<string, unknown> = {}) {
  return tilesetsConfigSchema.parse({
    tilesets: [
      {
        name: 't',
        source: 'assets/t.tsx',
        image: 'assets/t.png',
        output: 'public/t.json',
        outputImage: 'public/t.png',
        ...overrides,
      },
    ],
  }).tilesets[0]!;
}

function run(
  document: XmlDocument,
  overrides: Record<string, unknown> = {},
  solidTiles: number[] = [0],
) {
  return reconcile(document, {tileset: configFor(overrides), image: imageFor(solidTiles)});
}

const AUTO_ON_TILE_0 = {collision: {regions: [{range: [0, 0], mode: 'bbox'}]}};

describe('reconcile: collision', () => {
  test('no rule and no data leaves the file untouched', () => {
    let document = documentWith([]);
    let before = formatTsx(document);

    run(document);

    expect(formatTsx(document)).toBe(before);
  });

  test('a rule with no data creates the tile, group and auto object', () => {
    let document = documentWith([]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain(
      ' <tile id="0">\n  <objectgroup draworder="index" id="2">\n   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>\n  </objectgroup>\n </tile>\n',
    );
  });

  test('refreshing an auto object rewrites only its geometry', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="4" name="knee height" type="auto" x="9" y="9" width="9" height="9" rotation="0" visible="1"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain(
      '<object id="4" name="knee height" type="auto" x="1" y="1" width="2" height="2" rotation="0" visible="1"/>',
    );
  });

  test('a manual object is untouched and suppresses the auto box', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);
    let before = formatTsx(document);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toBe(before);
  });

  // A .tsx last written by Tiled 1.9, or exported at 1.9 compatibility, spells the class as
  // `class` rather than `type`. Reconcile has to converge on the single attribute it writes: an
  // object carrying both is auto forever, because resolve.ts reads `class ?? type` and clearing
  // either one leaves the other still claiming the box, so the escape hatch would never work.
  test('claiming an auto box by clearing its class makes it manual', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" class="auto" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain(
      '<object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
    );
    expect(formatTsx(document)).not.toContain('class=');

    let claimed = parseTsx(formatTsx(document).replace(' type="auto"', ''));

    run(claimed, AUTO_ON_TILE_0);

    expect(formatTsx(claimed)).toContain('<object id="1" x="1" y="1" width="2" height="2"/>');
    expect(formatTsx(claimed)).not.toContain('type="auto"');
  });

  test('the rule going away deletes the auto object, the group and the tile entry', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document);

    // `<tile` alone would match the `<tileset>` root element.
    expect(formatTsx(document)).not.toContain('<tile id=');
    expect(formatTsx(document)).not.toContain('objectgroup');
  });

  test('autoCollision false deletes an existing auto object and keeps the property', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoCollision" type="bool" value="false"/>',
      '  </properties>',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('name="autoCollision"');
    expect(formatTsx(document)).not.toContain('<objectgroup');
  });

  test('an absent property and autoCollision false are not the same thing', () => {
    let withoutFlag = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(withoutFlag, AUTO_ON_TILE_0);

    expect(formatTsx(withoutFlag)).toContain('x="1" y="1" width="2" height="2"');
  });

  test('art that disappeared deletes the stale box', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0, []);

    expect(formatTsx(document)).not.toContain('<tile id=');
  });

  test('several auto objects collapse to the lowest id', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="3" type="auto" x="9" y="9" width="9" height="9"/>',
      '   <object id="1" type="auto" x="8" y="8" width="8" height="8"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('<object id="1" type="auto" x="1" y="1"');
    expect(formatTsx(document)).not.toContain('id="3"');
  });

  test('a new auto object in an existing group takes max(id) + 1', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="7" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document, {
      collision: {regions: [{range: [0, 0], mode: 'bbox'}]},
      // The manual object would suppress; the flag overrides it.
    });

    expect(formatTsx(document)).not.toContain('id="8"');

    let withFlag = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoCollision" type="bool" value="true"/>',
      '  </properties>',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="7" x="9" y="9" width="9" height="9"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(withFlag, AUTO_ON_TILE_0);

    expect(formatTsx(withFlag)).toContain('<object id="8" type="auto" x="1" y="1"');
  });

  test('reconciling twice reallocates nothing', () => {
    let document = documentWith([]);

    run(document, AUTO_ON_TILE_0);

    let once = formatTsx(document);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toBe(once);
  });

  test('tiles are emitted in id order regardless of source order', () => {
    let document = documentWith([' <tile id="3"/>', ' <tile id="1"/>']);

    run(document, {collision: {regions: [{range: [1, 3], mode: 'full'}]}}, [1, 3]);

    let text = formatTsx(document);

    expect(text.indexOf('id="1"')).toBeLessThan(text.indexOf('id="3"'));
  });

  // A comment among the tiles is the shape that turns a comparator returning 0 for every
  // non-tile pair into an arbitrary order, and it is also the shape where a note can end up
  // annotating a tile its author never saw.
  test('a comment among the tiles travels with the tile it annotates', () => {
    let document = documentWith([
      ' <tile id="3"/>',
      ' <!-- tile 1 is hand-placed -->',
      ' <tile id="1"/>',
    ]);

    run(document, {collision: {regions: [{range: [0, 3], mode: 'bbox'}]}}, [0, 1, 3]);

    let text = formatTsx(document);

    expect(text).toContain(' <!-- tile 1 is hand-placed -->\n <tile id="1">');
    expect(text.indexOf('<tile id="0"')).toBeLessThan(text.indexOf('<tile id="1"'));
    expect(text.indexOf('<tile id="1"')).toBeLessThan(text.indexOf('<tile id="3"'));
  });

  test('a note below the last tile stays below it when a rule adds a tile', () => {
    let document = documentWith([' <tile id="1"/>', ' <!-- ids above 1 are unused -->']);

    run(document, {collision: {regions: [{range: [0, 1], mode: 'bbox'}]}}, [0, 1]);

    expect(formatTsx(document)).toContain(' <!-- ids above 1 are unused -->\n</tileset>');
  });

  test('wangsets land after the tiles, where Tiled writes them', () => {
    let document = documentWith([
      ' <wangsets>',
      '  <wangset name="terrain" type="corner" tile="-1"/>',
      ' </wangsets>',
    ]);

    run(document, AUTO_ON_TILE_0);

    let text = formatTsx(document);

    expect(text.indexOf('<tile id="0"')).toBeLessThan(text.indexOf('<wangsets>'));
  });

  test('a group left holding only a comment is pruned like an empty one', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <!-- the doorway -->',
      '   <object id="1" type="auto" x="1" y="1" width="2" height="2"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    run(document);

    expect(formatTsx(document)).not.toContain('<objectgroup');
  });
});

const ANIMATION_ON_TILE_0 = {animations: {regions: [{start: 0, frames: 2, duration: 150}]}};

describe('reconcile: animations', () => {
  test('a region writes the frame array and the ownership flag onto the carrier only', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);

    let text = formatTsx(document);

    expect(text).toContain('<property name="autoAnimation" type="bool" value="true"/>');
    expect(text).toContain('<frame tileid="0" duration="150"/>');
    expect(text).toContain('<frame tileid="1" duration="150"/>');
    expect(text).not.toContain('<tile id="1"');
  });

  // `Blocked` sorts before `autoAnimation` by UTF-16 code unit ('B' is 0x42,
  // 'a' is 0x61) and after it under every ICU collation, so this cell tells the
  // two apart instead of passing either way.
  test('the flag lands in Tiled’s property order without disturbing authored ones', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="Blocked" type="bool" value="true"/>',
      '  </properties>',
      ' </tile>',
    ]);

    run(document, ANIMATION_ON_TILE_0);

    expect(formatTsx(document)).toContain(
      '  <properties>\n   <property name="Blocked" type="bool" value="true"/>\n   <property name="autoAnimation" type="bool" value="true"/>\n  </properties>\n',
    );
  });

  test('moving a region deletes the orphaned array, flag and tile entry', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);
    run(document, {animations: {regions: [{start: 2, frames: 2, duration: 150}]}}, [0, 2]);

    let text = formatTsx(document);

    expect(text).not.toContain('<tile id="0"');
    expect(text).toContain('<tile id="2"');
  });

  test('deleting every region deletes every auto animation', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);
    run(document);

    expect(formatTsx(document)).not.toContain('<animation>');
  });

  test('a manual animation inside a region is skipped with a warning, not overwritten', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <animation>',
      '   <frame tileid="0" duration="40"/>',
      '   <frame tileid="1" duration="900"/>',
      '  </animation>',
      ' </tile>',
    ]);
    let result = run(document, ANIMATION_ON_TILE_0);

    expect(formatTsx(document)).toContain('duration="900"');
    expect(result.warnings.join(' ')).toMatch(/manual animation/i);
  });

  test('autoAnimation false deletes the array and blocks regeneration', () => {
    let document = documentWith([]);

    run(document, ANIMATION_ON_TILE_0);

    let suppressed = parseTsx(
      formatTsx(document).replace(
        '<property name="autoAnimation" type="bool" value="true"/>',
        '<property name="autoAnimation" type="bool" value="false"/>',
      ),
    );

    run(suppressed, ANIMATION_ON_TILE_0);

    expect(formatTsx(suppressed)).not.toContain('<animation>');
    expect(formatTsx(suppressed)).toContain('value="false"');
  });

  // The one path where this module destroys hand-drawn work: the flag claims
  // the array, so neither the "manual animation" nor the "can never apply"
  // warning fires and the frames would otherwise go silently.
  test('deleting frames under a false flag is warned about rather than done silently', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoAnimation" type="bool" value="false"/>',
      '  </properties>',
      '  <animation>',
      '   <frame tileid="0" duration="40"/>',
      '   <frame tileid="1" duration="900"/>',
      '  </animation>',
      ' </tile>',
    ]);
    let result = run(document, ANIMATION_ON_TILE_0);

    expect(formatTsx(document)).not.toContain('<animation>');
    expect(result.warnings.join(' ')).toMatch(/frames are deleted/i);
  });
});

describe('reconcile: hard errors and warnings', () => {
  test('throws on duplicate object ids within a group', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="0" y="0" width="1" height="1"/>',
      '   <object id="1" x="2" y="2" width="1" height="1"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    expect(() => run(document)).toThrow(/duplicate object id/i);
  });

  test('throws on tile data left out of range by a shrunken image', () => {
    let document = documentWith([' <tile id="9"/>']);

    expect(() => run(document)).toThrow(/out of range/i);
  });

  test('throws on a negative box left behind by a manual edit', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <objectgroup draworder="index" id="2">',
      '   <object id="1" x="0" y="0" width="-4" height="1"/>',
      '  </objectgroup>',
      ' </tile>',
    ]);

    expect(() => run(document)).toThrow(/negative/i);
  });

  test('throws when the recomputed grid contradicts the tileset attributes', () => {
    let document = documentWith([]);

    document.root.attributes.tilewidth = '5';

    expect(() => run(document)).toThrow(/does not divide/);
  });

  test('warns about a flag that can never apply', () => {
    let document = documentWith([
      ' <tile id="0">',
      '  <properties>',
      '   <property name="autoAnimation" type="bool" value="true"/>',
      '  </properties>',
      ' </tile>',
    ]);
    let result = run(document);

    expect(result.warnings.join(' ')).toMatch(/autoAnimation/);
  });

  test('recomputes the grid metadata from the image', () => {
    let document = documentWith([]);

    document.root.attributes.tilecount = '999';
    document.root.attributes.columns = '999';

    run(document);

    expect(document.root.attributes.tilecount).toBe('4');
    expect(document.root.attributes.columns).toBe('2');
  });

  test('leaves wangsets and unknown elements alone', () => {
    let document = documentWith([
      ' <wangsets>',
      '  <wangset name="terrain" type="corner" tile="-1">',
      '   <wangcolor name="grass" color="#ff0000" tile="-1" probability="1"/>',
      '  </wangset>',
      ' </wangsets>',
    ]);

    run(document, AUTO_ON_TILE_0);

    expect(formatTsx(document)).toContain('<wangcolor name="grass" color="#ff0000"');
  });
});
