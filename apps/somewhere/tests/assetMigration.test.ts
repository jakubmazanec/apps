import {describe, expect, test} from 'vitest';

import {
  assertUniformBlocks,
  divideExact,
  downscaleNearest,
  scaleCharacterJson,
  scaleFntContent,
  scaleMapJson,
  scaleTilesetJson,
} from '../scripts/asset-migration.mjs';

// A 4×2 RGBA image made of two 2×2 blocks: left block all-10s, right all-20s.
function uniformImage() {
  let data = new Uint8Array(4 * 2 * 4);

  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 4; x++) {
      data.fill(x < 2 ? 10 : 20, (y * 4 + x) * 4, (y * 4 + x) * 4 + 4);
    }
  }

  return {width: 4, height: 2, channels: 4, data};
}

describe('asset migration guards', () => {
  test('assertUniformBlocks accepts exact block-uniform images', () => {
    expect(() => {
      assertUniformBlocks(uniformImage(), 2, 'test.png');
    }).not.toThrow();
  });

  test('assertUniformBlocks rejects a block broken only in the alpha channel', () => {
    let image = uniformImage();

    image.data[3] = 99; // alpha of the top-left texel only

    expect(() => {
      assertUniformBlocks(image, 2, 'test.png');
    }).toThrow('test.png: block at (0, 0) is not uniform in channel 3!');
  });

  test('assertUniformBlocks rejects dimensions that are not block multiples', () => {
    expect(() => {
      assertUniformBlocks(
        {width: 3, height: 2, channels: 4, data: new Uint8Array(24)},
        2,
        'test.png',
      );
    }).toThrow('test.png: 3x2 is not a multiple of 2!');
  });

  test('downscaleNearest keeps one texel per block', () => {
    let small = downscaleNearest(uniformImage(), 2);

    expect(small.width).toBe(2);
    expect(small.height).toBe(1);
    expect([...small.data]).toEqual([10, 10, 10, 10, 20, 20, 20, 20]);
  });

  test('downscaleNearest rejects dimensions that are not block multiples', () => {
    expect(() =>
      downscaleNearest({width: 3, height: 2, channels: 4, data: new Uint8Array(24)}, 2),
    ).toThrow('downscaleNearest width: 3 is not a multiple of 2!');
  });

  test('divideExact divides multiples and aborts on anything else', () => {
    expect(divideExact(64, 4, 'x')).toBe(16);
    expect(() => divideExact(10, 4, 'map.json tilewidth')).toThrow(
      'map.json tilewidth: 10 is not a multiple of 4!',
    );
  });

  test('scaleTilesetJson divides pixel fields and collision rects, leaves counts and ids alone', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- library intentionally works with any JSON
    let tileset = scaleTilesetJson(
      {
        columns: 64,
        tilewidth: 64,
        tileheight: 64,
        imagewidth: 4096,
        imageheight: 4096,
        margin: 0,
        spacing: 0,
        tilecount: 4096,
        tiles: [{id: 64, objectgroup: {objects: [{x: 8, y: 32, width: 48, height: 32}]}}],
      },
      4,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(tileset.tilewidth).toBe(16);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(tileset.imagewidth).toBe(1024);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(tileset.columns).toBe(64);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(tileset.tilecount).toBe(4096);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(tileset.tiles[0].id).toBe(64);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(tileset.tiles[0].objectgroup.objects[0]).toEqual({x: 2, y: 8, width: 12, height: 8});
  });

  test('scaleMapJson divides the tile pixel size, keeps tile counts and GID data', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- library intentionally works with any JSON
    let map = scaleMapJson(
      {tilewidth: 64, tileheight: 64, width: 40, height: 40, layers: [{data: [1414]}]},
      4,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(map.tilewidth).toBe(16);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(map.tileheight).toBe(16);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(map.width).toBe(40);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(map.layers[0].data).toEqual([1414]);
  });

  test('scaleCharacterJson divides frame rects', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- library intentionally works with any JSON
    let sheet = scaleCharacterJson({frames: {1: {frame: {x: 64, y: 80, w: 64, h: 80}}}}, 4);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- library intentionally works with any JSON
    expect(sheet.frames[1].frame).toEqual({x: 16, y: 20, w: 16, h: 20});
  });

  test('scaleFntContent scales metrics (csv values included) and leaves other attributes alone', () => {
    let content = [
      '<info face="monogram" size="48" spacing="4,4" padding="0,0,0,0" outline="0"/>',
      '<common lineHeight="48" base="40" scaleW="1024" scaleH="1024"/>',
      '<char id="97" x="8" y="16" width="20" height="24" xoffset="0" yoffset="4" xadvance="24" page="0"/>',
    ].join('\n');

    let scaled = scaleFntContent(content, 0.25);

    expect(scaled).toContain('size="12"');
    expect(scaled).toContain('spacing="1,1"');
    expect(scaled).toContain('lineHeight="12"');
    expect(scaled).toContain('x="2" y="4" width="5" height="6"');
    expect(scaled).toContain('xadvance="6"');
    expect(scaled).toContain('id="97"');
    expect(scaled).toContain('page="0"');
  });

  test('scaleFntContent guards non-integer results', () => {
    expect(() => scaleFntContent('<char x="10"/>', 0.25)).toThrow(
      'char x: 10 × 0.25 is not an integer!',
    );
  });
});
