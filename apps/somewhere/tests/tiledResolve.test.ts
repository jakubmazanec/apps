import {describe, expect, test} from 'vitest';

import {tilesetsConfigSchema} from '../tools/tiled-pipeline/config.js';
import {
  getBooleanProperty,
  getObjectClass,
  getTileClass,
  isAutoObject,
  resolveCollisionMode,
} from '../tools/tiled-pipeline/resolve.js';
import {findChildren, parseTsx, type XmlElement} from '../tools/tiled-pipeline/tsx.js';

function tilesetWith(tiles: string[]): XmlElement[] {
  let document = parseTsx(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tileset version="1.10" tiledversion="1.10.2" name="t" tilewidth="16" tileheight="16" tilecount="4" columns="2">',
      ' <image source="t.png" width="32" height="32"/>',
      ...tiles,
      '</tileset>',
      '',
    ].join('\n'),
  );

  return findChildren(document.root, 'tile');
}

function collisionConfig(overrides: Record<string, unknown> = {}) {
  return tilesetsConfigSchema.parse({
    tilesets: [
      {
        name: 't',
        source: 'assets/t.tsx',
        image: 'assets/t.png',
        output: 'public/t.json',
        outputImage: 'public/t.png',
        collision: overrides,
      },
    ],
  }).tilesets[0]!.collision;
}

describe('object ownership', () => {
  test('reads class in preference to type, and treats "auto" as owned', () => {
    let [withType, withClass, manual] = tilesetWith([
      ' <tile id="0"><objectgroup id="2"><object id="1" type="auto" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
      ' <tile id="1"><objectgroup id="2"><object id="1" class="auto" type="stale" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
      ' <tile id="2"><objectgroup id="2"><object id="1" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]).map((tile) => findChildren(tile.children[0]!, 'object')[0]!);

    expect(getObjectClass(withClass!)).toBe('auto');
    expect(isAutoObject(withType!)).toBe(true);
    expect(isAutoObject(withClass!)).toBe(true);
    expect(isAutoObject(manual!)).toBe(false);
  });
});

describe('tile properties', () => {
  test('reads a bool property and reports an absent one as undefined', () => {
    let [flagged, bare] = tilesetWith([
      ' <tile id="0"><properties><property name="autoCollision" type="bool" value="false"/></properties></tile>',
      ' <tile id="1"/>',
    ]);

    expect(getBooleanProperty(flagged, 'autoCollision')).toBe(false);
    expect(getBooleanProperty(bare, 'autoCollision')).toBeUndefined();
    expect(getBooleanProperty(undefined, 'autoCollision')).toBeUndefined();
  });

  test('throws when the flag carries a non-boolean type', () => {
    let [tile] = tilesetWith([
      ' <tile id="0"><properties><property name="autoCollision" value="true"/></properties></tile>',
    ]);

    expect(() => getBooleanProperty(tile, 'autoCollision')).toThrow(/bool/);
  });

  test('reads the tile class from class or type', () => {
    let [withType, withClass, bare] = tilesetWith([
      ' <tile id="0" type="wall"/>',
      ' <tile id="1" class="prop"/>',
      ' <tile id="2"/>',
    ]);

    expect(getTileClass(withType)).toBe('wall');
    expect(getTileClass(withClass)).toBe('prop');
    expect(getTileClass(bare)).toBeUndefined();
  });
});

describe(resolveCollisionMode, () => {
  test('falls through to the default when nothing speaks for the tile', () => {
    expect(resolveCollisionMode({tileId: 0, tile: undefined, collision: collisionConfig()})).toBe(
      'none',
    );
    expect(
      resolveCollisionMode({
        tileId: 0,
        tile: undefined,
        collision: collisionConfig({default: 'bbox'}),
      }),
    ).toBe('bbox');
  });

  test('a tile class beats the default', () => {
    let [tile] = tilesetWith([' <tile id="0" type="wall"/>']);

    expect(
      resolveCollisionMode({
        tileId: 0,
        tile,
        collision: collisionConfig({default: 'none', tileClasses: {wall: 'bbox'}}),
      }),
    ).toBe('bbox');
  });

  test('a region beats a tile class', () => {
    let [tile] = tilesetWith([' <tile id="5" type="wall"/>']);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({
          tileClasses: {wall: 'bbox'},
          regions: [{range: [4, 6], mode: 'footprint'}],
        }),
      }),
    ).toBe('footprint');
  });

  test('the last matching region wins, so a later entry can narrow an earlier one', () => {
    expect(
      resolveCollisionMode({
        tileId: 5,
        tile: undefined,
        collision: collisionConfig({
          regions: [
            {range: [0, 9], mode: 'bbox'},
            {range: [5, 5], mode: 'full'},
          ],
        }),
      }),
    ).toBe('full');
  });

  test('a non-auto object on the tile beats a region', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><objectgroup id="2"><object id="1" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'bbox'}]}),
      }),
    ).toBe('none');
  });

  test('an auto object on the tile does not suppress anything', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><objectgroup id="2"><object id="1" type="auto" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'bbox'}]}),
      }),
    ).toBe('bbox');
  });

  test('autoCollision false beats everything below it', () => {
    let [tile] = tilesetWith([
      ' <tile id="5" type="wall"><properties><property name="autoCollision" type="bool" value="false"/></properties></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({
          tileClasses: {wall: 'bbox'},
          regions: [{range: [4, 6], mode: 'full'}],
        }),
      }),
    ).toBe('none');
  });

  test('autoCollision true opts in at bbox when nothing below chose a mode', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><properties><property name="autoCollision" type="bool" value="true"/></properties></tile>',
    ]);

    expect(resolveCollisionMode({tileId: 5, tile, collision: collisionConfig()})).toBe('bbox');
  });

  test('autoCollision true keeps the mode a lower rule already chose', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><properties><property name="autoCollision" type="bool" value="true"/></properties></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'footprint'}]}),
      }),
    ).toBe('footprint');
  });

  test('autoCollision true overrides a manual object, which suppression alone would not', () => {
    let [tile] = tilesetWith([
      ' <tile id="5"><properties><property name="autoCollision" type="bool" value="true"/></properties><objectgroup id="2"><object id="1" x="0" y="0" width="1" height="1"/></objectgroup></tile>',
    ]);

    expect(
      resolveCollisionMode({
        tileId: 5,
        tile,
        collision: collisionConfig({regions: [{range: [4, 6], mode: 'bbox'}]}),
      }),
    ).toBe('bbox');
  });
});
