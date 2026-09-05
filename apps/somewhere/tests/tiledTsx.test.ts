import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

import {
  createElement,
  findChild,
  findChildren,
  formatTsx,
  getAttribute,
  parseTsx,
  setAttribute,
} from '../tools/tiled-pipeline/tsx.js';

function readTsx(): string {
  return readFileSync(new URL('../assets/tileset.tsx', import.meta.url), 'utf8');
}

describe('parseTsx / formatTsx', () => {
  test('round-trips assets/tileset.tsx byte-identically', () => {
    let text = readTsx();

    expect(formatTsx(parseTsx(text))).toBe(text);
  });

  test('keeps the source newline, CRLF or LF', () => {
    let crlf = readTsx();
    let lf = crlf.replaceAll('\r\n', '\n');

    expect(parseTsx(crlf).newline).toBe('\r\n');
    expect(parseTsx(lf).newline).toBe('\n');
    expect(formatTsx(parseTsx(lf))).toBe(lf);
  });

  test('exposes the tree the pipeline mutates', () => {
    let document = parseTsx(readTsx());
    let tiles = findChildren(document.root, 'tile');
    let tile192 = tiles.find((tile) => getAttribute(tile, 'id') === '192')!;

    expect(getAttribute(document.root, 'tilecount')).toBe('4096');
    // 992 auto boxes plus the 10 tiles opted out via autoCollision: false. Adopting another
    // region moves this number; that is the point of pinning it, so re-measure rather than
    // loosening it.
    expect(tiles).toHaveLength(1002);
    expect(findChildren(findChild(tile192, 'objectgroup')!, 'object')).toHaveLength(1);
  });

  test('writes an empty element self-closing and indents one space per level', () => {
    let document = parseTsx(readTsx());
    let tile = findChildren(document.root, 'tile')[0]!;
    let animation = createElement('animation', {});

    animation.children.push(createElement('frame', {tileid: '64', duration: '150'}));
    tile.children.push(animation);

    expect(formatTsx(document)).toContain(
      '  <animation>\r\n   <frame tileid="64" duration="150"/>\r\n  </animation>\r\n',
    );
  });

  test('inserts a new attribute at its canonical position, not at the end', () => {
    let object = createElement('object', {id: '1', x: '2', y: '8', width: '12', height: '8'});

    setAttribute(object, 'type', 'auto');

    expect(Object.keys(object.attributes)).toStrictEqual([
      'id',
      'type',
      'x',
      'y',
      'width',
      'height',
    ]);
  });

  test('assigning an existing attribute leaves the parsed order alone', () => {
    let document = parseTsx(readTsx());
    let objectGroup = findChild(findChildren(document.root, 'tile')[0]!, 'objectgroup')!;

    setAttribute(objectGroup, 'id', '7');

    expect(Object.keys(objectGroup.attributes)).toStrictEqual(['draworder', 'id']);
  });

  test('escapes the XML-significant characters in attribute values', () => {
    let document = parseTsx(readTsx());

    setAttribute(document.root, 'name', 'a&b<c>d"e');

    expect(formatTsx(document)).toContain('name="a&amp;b&lt;c&gt;d&quot;e"');
    expect(parseTsx(formatTsx(document)).root.attributes.name).toBe('a&b<c>d"e');
  });

  test('round-trips a hand-authored comment instead of deleting it', () => {
    let text = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<tileset version="1.10" name="t">',
      ' <!-- the shadow row is hand-authored; leave it alone -->',
      ' <tile id="0">',
      '  <!-- and this box is deliberate -->',
      '  <objectgroup draworder="index" id="2"/>',
      ' </tile>',
      '</tileset>',
      '',
    ].join('\n');

    expect(formatTsx(parseTsx(text))).toBe(text);
  });

  test('refuses a comment outside the root element rather than dropping it', () => {
    expect(() => parseTsx('<?xml version="1.0"?>\n<!-- note -->\n<tileset name="t"/>\n')).toThrow(
      /comment/iu,
    );
  });

  test('rejects a document whose root is not a tileset', () => {
    expect(() => parseTsx('<?xml version="1.0"?>\n<map version="1.10"/>\n')).toThrow(/tileset/);
  });
});
