import {
  findChild,
  findChildren,
  getAttribute,
  getNumericAttribute,
  type XmlDocument,
  type XmlElement,
} from './tsx.js';

export type JsonValue = JsonValue[] | {[key: string]: JsonValue} | boolean | number | string;

// Tiled omits type="string" in XML but always writes it in JSON.
function toProperty(element: XmlElement): Record<string, JsonValue> {
  let type = getAttribute(element, 'type') ?? 'string';
  let raw = getAttribute(element, 'value') ?? element.text ?? '';
  let value: JsonValue;

  switch (type) {
    case 'bool': {
      value = raw === 'true';

      break;
    }

    case 'float':
    case 'int': {
      value = Number(raw);

      break;
    }

    default: {
      value = raw;
    }
  }

  return {name: getAttribute(element, 'name') ?? '', type, value};
}

function toObject(element: XmlElement): Record<string, JsonValue> {
  return {
    height: getNumericAttribute(element, 'height') ?? 0,
    id: getNumericAttribute(element, 'id') ?? 0,
    name: getAttribute(element, 'name') ?? '',
    rotation: getNumericAttribute(element, 'rotation') ?? 0,
    type: getAttribute(element, 'class') ?? getAttribute(element, 'type') ?? '',
    visible: getAttribute(element, 'visible') !== '0',
    width: getNumericAttribute(element, 'width') ?? 0,
    x: getNumericAttribute(element, 'x') ?? 0,
    y: getNumericAttribute(element, 'y') ?? 0,
  };
}

function toObjectGroup(element: XmlElement): Record<string, JsonValue> {
  return {
    draworder: getAttribute(element, 'draworder') ?? 'topdown',
    id: getNumericAttribute(element, 'id') ?? 0,
    name: getAttribute(element, 'name') ?? '',
    objects: findChildren(element, 'object').map((object) => toObject(object)),
    opacity: getNumericAttribute(element, 'opacity') ?? 1,
    type: 'objectgroup',
    visible: getAttribute(element, 'visible') !== '0',
    x: 0,
    y: 0,
  };
}

function toTile(element: XmlElement): Record<string, JsonValue> {
  let tile: Record<string, JsonValue> = {id: getNumericAttribute(element, 'id') ?? 0};
  let type = getAttribute(element, 'class') ?? getAttribute(element, 'type');
  let objectGroup = findChild(element, 'objectgroup');
  let animation = findChild(element, 'animation');
  let properties = findChild(element, 'properties');

  if (type !== undefined && type !== '') {
    tile.type = type;
  }

  if (objectGroup) {
    tile.objectgroup = toObjectGroup(objectGroup);
  }

  if (animation) {
    tile.animation = findChildren(animation, 'frame').map((frame) => ({
      duration: getNumericAttribute(frame, 'duration') ?? 0,
      tileid: getNumericAttribute(frame, 'tileid') ?? 0,
    }));
  }

  if (properties) {
    tile.properties = findChildren(properties, 'property')
      .map((property) => toProperty(property))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  return tile;
}

// `outputImageName` is the shipped filename (e.g. "exterior-tileset.png"), not the
// authoring path in the tileset's own <image source>: that attribute points at wherever the
// artist's source image actually lives (which for an extracted asset pack is nowhere near
// public/), so Tiled can still open the .tsx. When the caller omits it, the <image source>
// attribute is used as-is (tests exercising the raw XML-to-JSON mapping rely on this fallback).
export function toTilesetJson(
  document: XmlDocument,
  outputImageName?: string,
): Record<string, JsonValue> {
  let {root} = document;
  let image = findChild(root, 'image');

  if (!image) {
    throw new Error(
      'The tileset has no <image> element! Collection-of-images tilesets are not supported.',
    );
  }

  let transparent = getAttribute(image, 'trans');
  let tiles = findChildren(root, 'tile').map((tile) => toTile(tile));
  let json: Record<string, JsonValue> = {
    columns: getNumericAttribute(root, 'columns') ?? 0,
    image: outputImageName ?? getAttribute(image, 'source') ?? '',
    imageheight: getNumericAttribute(image, 'height') ?? 0,
    imagewidth: getNumericAttribute(image, 'width') ?? 0,
    margin: getNumericAttribute(root, 'margin') ?? 0,
    name: getAttribute(root, 'name') ?? '',
    spacing: getNumericAttribute(root, 'spacing') ?? 0,
    tilecount: getNumericAttribute(root, 'tilecount') ?? 0,
    tiledversion: getAttribute(root, 'tiledversion') ?? '',
    tileheight: getNumericAttribute(root, 'tileheight') ?? 0,
    tilewidth: getNumericAttribute(root, 'tilewidth') ?? 0,
    type: 'tileset',
    version: getAttribute(root, 'version') ?? '',
  };

  if (tiles.length > 0) {
    json.tiles = tiles;
  }

  if (transparent !== undefined) {
    json.transparentcolor = transparent.startsWith('#') ? transparent : `#${transparent}`;
  }

  return json;
}

// Lexicographic keys at every level. Arrays keep their order: `objects` is
// semantic under draworder "index", `animation` is a frame sequence, and
// `properties` was already sorted by name upstream.
function sortKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry));
  }

  if (typeof value !== 'object') {
    return value;
  }

  let sorted: {[key: string]: JsonValue} = {};

  for (let key of Object.keys(value).sort()) {
    sorted[key] = sortKeys(value[key] as JsonValue);
  }

  return sorted;
}

export function formatJson(document: XmlDocument, outputImageName?: string): string {
  return `${JSON.stringify(sortKeys(toTilesetJson(document, outputImageName)), null, 2)}\n`;
}
