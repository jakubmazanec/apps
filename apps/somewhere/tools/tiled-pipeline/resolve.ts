import {type CollisionMode, type TilesetConfig} from './config.js';
import {findChild, findChildren, getAttribute, type XmlElement} from './tsx.js';

export const AUTO_OBJECT_CLASS = 'auto';

// Tiled's own reader prefers `class` (its 1.9 compatibility mode writes it),
// but this pipeline always writes `type`: TiledObject.ts models only `type`,
// and Zod would silently strip a `class` key, so the post-mutation validation
// gate would not catch the mistake.
export function getObjectClass(object: XmlElement): string {
  return getAttribute(object, 'class') ?? getAttribute(object, 'type') ?? '';
}

export function isAutoObject(object: XmlElement): boolean {
  return getObjectClass(object) === AUTO_OBJECT_CLASS;
}

export function getTileClass(tile: XmlElement | undefined): string | undefined {
  if (!tile) {
    return undefined;
  }

  let value = getAttribute(tile, 'class') ?? getAttribute(tile, 'type');

  return value === '' ? undefined : value;
}

export function getBooleanProperty(
  tile: XmlElement | undefined,
  name: string,
): boolean | undefined {
  if (!tile) {
    return undefined;
  }

  let properties = findChild(tile, 'properties');
  let property =
    properties ?
      findChildren(properties, 'property').find((entry) => getAttribute(entry, 'name') === name)
    : undefined;

  if (!property) {
    return undefined;
  }

  // The property schema is a discriminated union on `type`, so a string "true"
  // would be ignored silently rather than misread. Fail loudly instead.
  if (getAttribute(property, 'type') !== 'bool') {
    throw new Error(
      `Tile property "${name}" on tile ${getAttribute(tile, 'id')} must have type "bool", found "${getAttribute(property, 'type') ?? 'string'}"!`,
    );
  }

  return getAttribute(property, 'value') === 'true';
}

function hasManualObject(tile: XmlElement | undefined): boolean {
  if (!tile) {
    return false;
  }

  let objectGroup = findChild(tile, 'objectgroup');

  return objectGroup ?
      findChildren(objectGroup, 'object').some((object) => !isAutoObject(object))
    : false;
}

export function resolveCollisionMode({
  tileId,
  tile,
  collision,
}: {
  tileId: number;
  tile: XmlElement | undefined;
  collision: TilesetConfig['collision'];
}): CollisionMode {
  let flag = getBooleanProperty(tile, 'autoCollision');

  if (flag === false) {
    return 'none';
  }

  // Rules 3-5, lowest first; the last matching region wins so a later entry can
  // narrow an earlier one.
  let mode = collision.default;
  let tileClass = getTileClass(tile);

  if (tileClass !== undefined && collision.tileClasses[tileClass] !== undefined) {
    mode = collision.tileClasses[tileClass];
  }

  for (let region of collision.regions) {
    if (tileId >= region.range[0] && tileId <= region.range[1]) {
      mode = region.mode;
    }
  }

  if (flag === true) {
    // The property carries no mode: it means "automate this tile", and bbox is
    // what the hand-authored evidence says the author draws.
    return mode === 'none' ? 'bbox' : mode;
  }

  return hasManualObject(tile) ? 'none' : mode;
}
