import {animatedTileIds, buildAnimationFrames, validateAnimationRegions} from './animation.js';
import {computeCollisionBox} from './collision.js';
import {type TilesetConfig} from './config.js';
import {type TilesetImage} from './pixels.js';
import {
  AUTO_OBJECT_CLASS,
  getBooleanProperty,
  isAutoObject,
  resolveCollisionMode,
} from './resolve.js';
import {
  COMMENT_NAME,
  createElement,
  findChild,
  findChildren,
  getAttribute,
  getNumericAttribute,
  removeAttribute,
  setAttribute,
  type XmlDocument,
  type XmlElement,
} from './tsx.js';

export const AUTO_ANIMATION_PROPERTY = 'autoAnimation';
export const AUTO_COLLISION_PROPERTY = 'autoCollision';

export type ReconcileOptions = {
  tileset: TilesetConfig;
  image: TilesetImage;
};

export type ReconcileResult = {
  warnings: string[];
};

export function getOrCreateTile(root: XmlElement, tileId: number): XmlElement {
  let existing = findChildren(root, 'tile').find(
    (tile) => getNumericAttribute(tile, 'id') === tileId,
  );

  if (existing) {
    return existing;
  }

  let tile = createElement('tile', {id: String(tileId)});
  // At the end of the tile run, not the end of the file: a comment written below the last tile
  // annotates the file, and appending past it would make it this tile's leading comment and
  // carry it off to wherever the tile sorts.
  let lastTile = root.children.findLastIndex((child) => child.name === 'tile');

  root.children.splice(lastTile < 0 ? root.children.length : lastTile + 1, 0, tile);

  return tile;
}

export function setBooleanProperty(tile: XmlElement, name: string, value: boolean): void {
  let properties = findChild(tile, 'properties');

  if (!properties) {
    properties = createElement('properties', {});
    tile.children.unshift(properties);
  }

  let property = findChildren(properties, 'property').find(
    (entry) => getAttribute(entry, 'name') === name,
  );

  if (!property) {
    // Tiled keeps properties in a QVariantMap and writes them in UTF-16
    // code-unit order, which `<` reproduces and `localeCompare` does not:
    // ICU collation is locale-sensitive, so the same input would serialize to
    // different bytes on two machines. Splicing the new property into place
    // rather than re-sorting also leaves hand-authored properties exactly where
    // their author left them.
    let successor = properties.children.findIndex(
      (entry) => (getAttribute(entry, 'name') ?? '') > name,
    );

    property = createElement('property', {name, type: 'bool', value: String(value)});
    properties.children.splice(successor < 0 ? properties.children.length : successor, 0, property);

    return;
  }

  setAttribute(property, 'type', 'bool');
  setAttribute(property, 'value', String(value));
}

type ChildBlock = {name: string; tileId: number; nodes: XmlElement[]};

// A comment annotates whatever was written under it, so it has to travel with that element
// rather than hold its index: a note that survives a sort but ends up over a different tile
// asserts something its author never wrote, which is worse than losing it.
function toChildBlocks(children: XmlElement[]): ChildBlock[] {
  let blocks: ChildBlock[] = [];
  let nodes: XmlElement[] = [];

  for (let child of children) {
    nodes.push(child);

    if (child.name !== COMMENT_NAME) {
      blocks.push({name: child.name, tileId: getNumericAttribute(child, 'id') ?? 0, nodes});
      nodes = [];
    }
  }

  // A comment run with nothing under it annotates the end of the file, so it stays there.
  if (nodes.length > 0) {
    blocks.push({name: COMMENT_NAME, tileId: 0, nodes});
  }

  return blocks;
}

// Tiled's child order: the tileset's own elements, then the tiles by id, then <wangsets>.
// Sorting the children array in one pass only worked while <image> was the only non-tile child:
// a comparator answering 0 for every pair involving a non-tile is not a strict weak ordering, so
// an interleaved comment or a <wangsets> left the whole list in an arbitrary order.
export function sortTilesById(root: XmlElement): void {
  let blocks = toChildBlocks(root.children);
  let tiles = blocks.filter((block) => block.name === 'tile');

  tiles.sort((a, b) => a.tileId - b.tileId);

  root.children = [
    ...blocks.filter(
      (block) => block.name !== 'tile' && block.name !== 'wangsets' && block.name !== COMMENT_NAME,
    ),
    ...tiles,
    ...blocks.filter((block) => block.name === 'wangsets'),
    ...blocks.filter((block) => block.name === COMMENT_NAME),
  ].flatMap((block) => block.nodes);
}

function removeProperty(tile: XmlElement, name: string): void {
  let properties = findChild(tile, 'properties');

  if (!properties) {
    return;
  }

  properties.children = properties.children.filter(
    (property) => getAttribute(property, 'name') !== name,
  );
}

function assertObjectIdsUnique(tile: XmlElement, group: XmlElement): void {
  let seen = new Set<number>();

  for (let object of findChildren(group, 'object')) {
    let id = getNumericAttribute(object, 'id') ?? 0;

    if (seen.has(id)) {
      throw new Error(
        `Tile ${getAttribute(tile, 'id')} has a duplicate object id ${id} in its objectgroup! Object ids are unique per group; renumber the duplicate in Tiled.`,
      );
    }

    seen.add(id);
  }
}

function assertBoxesValid(tile: XmlElement, group: XmlElement): void {
  for (let object of findChildren(group, 'object')) {
    let width = getNumericAttribute(object, 'width') ?? 0;
    let height = getNumericAttribute(object, 'height') ?? 0;

    if (width < 0 || height < 0) {
      throw new Error(
        `Tile ${getAttribute(tile, 'id')} object ${getAttribute(object, 'id')} has a negative size (${width}x${height})!`,
      );
    }
  }
}

// Auto collision: exactly one box per tile, refreshed in place. Delete-then-
// insert is forbidden — it reallocates ids every run and the file never
// converges.
function reconcileCollision(tile: XmlElement, box: ReturnType<typeof computeCollisionBox>): void {
  let group = findChild(tile, 'objectgroup');
  let autoObjects =
    group ? findChildren(group, 'object').filter((object) => isAutoObject(object)) : [];

  if (!box) {
    if (group) {
      group.children = group.children.filter((object) => !isAutoObject(object));
    }

    return;
  }

  if (!group) {
    group = createElement('objectgroup', {draworder: 'index', id: '2'});
    tile.children.push(group);
  }

  let survivor = autoObjects.sort(
    (a, b) => (getNumericAttribute(a, 'id') ?? 0) - (getNumericAttribute(b, 'id') ?? 0),
  )[0];

  if (survivor) {
    group.children = group.children.filter(
      (object) => object === survivor || !isAutoObject(object),
    );
  } else {
    let maxId = Math.max(
      0,
      ...findChildren(group, 'object').map((object) => getNumericAttribute(object, 'id') ?? 0),
    );

    survivor = createElement('object', {id: String(maxId + 1), type: AUTO_OBJECT_CLASS});
    group.children.push(survivor);
  }

  setAttribute(survivor, 'type', AUTO_OBJECT_CLASS);
  // Tiled 1.9 spells the same thing `class`. Leaving it beside the `type` this writer sets would
  // pin the object as auto forever: resolve.ts reads `class ?? type`, so clearing either one in
  // Tiled leaves the other still claiming it.
  removeAttribute(survivor, 'class');
  setAttribute(survivor, 'x', String(box.x));
  setAttribute(survivor, 'y', String(box.y));
  setAttribute(survivor, 'width', String(box.width));
  setAttribute(survivor, 'height', String(box.height));
}

// A container the pipeline has emptied is gone whether or not a comment is left inside it: the
// alternative is an empty <objectgroup> living on in the .tsx and an "objects": [] in the JSON.
// The comment goes with it, because what it annotated no longer exists.
function holdsNoElements(element: XmlElement | undefined): boolean {
  return element?.children.every((child) => child.name === COMMENT_NAME) ?? false;
}

function prune(root: XmlElement): void {
  for (let tile of findChildren(root, 'tile')) {
    let group = findChild(tile, 'objectgroup');
    let properties = findChild(tile, 'properties');
    let animation = findChild(tile, 'animation');

    if (holdsNoElements(group)) {
      tile.children = tile.children.filter((child) => child !== group);
    }

    if (holdsNoElements(properties)) {
      tile.children = tile.children.filter((child) => child !== properties);
    }

    if (holdsNoElements(animation)) {
      tile.children = tile.children.filter((child) => child !== animation);
    }
  }

  root.children = root.children.filter(
    (child) =>
      child.name !== 'tile' ||
      child.children.length > 0 ||
      Object.keys(child.attributes).length > 1,
  );
}

export function reconcile(document: XmlDocument, options: ReconcileOptions): ReconcileResult {
  let {tileset, image} = options;
  let {root} = document;
  let warnings: string[] = [];
  let tileWidth = getNumericAttribute(root, 'tilewidth') ?? 0;
  let tileHeight = getNumericAttribute(root, 'tileheight') ?? 0;

  if (tileWidth !== image.width / image.columns || tileHeight !== image.height / image.rows) {
    throw new Error(
      `The tileset declares ${tileWidth}x${tileHeight} tiles, which does not divide the ${image.width}x${image.height} image!`,
    );
  }

  for (let tile of findChildren(root, 'tile')) {
    let tileId = getNumericAttribute(tile, 'id') ?? 0;

    if (tileId < 0 || tileId >= image.tileCount) {
      throw new Error(
        `Tile ${tileId} is out of range for an image holding ${image.tileCount} tiles! The image shrank; remove the stale tile data in Tiled.`,
      );
    }

    let group = findChild(tile, 'objectgroup');

    if (group) {
      assertObjectIdsUnique(tile, group);
      assertBoxesValid(tile, group);
    }
  }

  let animationMessages = validateAnimationRegions(tileset.animations.regions, image.tileCount);

  if (animationMessages.length > 0) {
    throw new Error(animationMessages.join('\n'));
  }

  let carriers = animatedTileIds(tileset.animations.regions);
  let touched = new Set<number>([
    ...carriers,
    ...findChildren(root, 'tile').map((tile) => getNumericAttribute(tile, 'id') ?? 0),
  ]);

  for (let region of tileset.collision.regions) {
    for (
      let tileId = region.range[0];
      tileId <= Math.min(region.range[1], image.tileCount - 1);
      tileId++
    ) {
      touched.add(tileId);
    }
  }

  if (
    tileset.collision.default !== 'none' ||
    Object.keys(tileset.collision.tileClasses).length > 0
  ) {
    for (let tileId = 0; tileId < image.tileCount; tileId++) {
      touched.add(tileId);
    }
  }

  for (let tileId of [...touched].sort((a, b) => a - b)) {
    let existing = findChildren(root, 'tile').find(
      (tile) => getNumericAttribute(tile, 'id') === tileId,
    );
    let mode = resolveCollisionMode({tileId, tile: existing, collision: tileset.collision});
    let box = computeCollisionBox(
      image.getTileMask(tileId),
      mode,
      tileset.collision.footprintMaxHeight,
    );
    let animationFlag = getBooleanProperty(existing, AUTO_ANIMATION_PROPERTY);
    let region = tileset.animations.regions.find((entry) => entry.start === tileId);
    // An array is manual only when no flag claims it. A present flag marks it as
    // ours whichever way it points, so `false` means "delete it and stop
    // regenerating", not "leave it alone" — which is what makes the flag differ
    // from an absent property.
    let hasManualAnimation =
      existing !== undefined &&
      findChild(existing, 'animation') !== undefined &&
      animationFlag === undefined;
    let wantsAnimation = region !== undefined && animationFlag !== false && !hasManualAnimation;

    if (region && hasManualAnimation) {
      warnings.push(
        `Tile ${tileId} carries a manual animation inside a configured region; it is kept and the region is skipped for this tile.`,
      );
    }

    if (!region && animationFlag !== undefined && !carriers.has(tileId)) {
      warnings.push(
        `Tile ${tileId} carries "${AUTO_ANIMATION_PROPERTY}" but no animation region covers it, so the flag can never apply.`,
      );
    }

    if (!existing && !box && !wantsAnimation) {
      continue;
    }

    let tile = existing ?? getOrCreateTile(root, tileId);

    reconcileCollision(tile, box);

    if (wantsAnimation && region) {
      let animation = findChild(tile, 'animation') ?? createElement('animation', {});

      animation.children = buildAnimationFrames(region).map((frame) =>
        createElement('frame', {tileid: String(frame.tileid), duration: String(frame.duration)}),
      );

      if (!findChild(tile, 'animation')) {
        tile.children.push(animation);
      }

      setBooleanProperty(tile, AUTO_ANIMATION_PROPERTY, true);
    } else if (animationFlag === true || (animationFlag === false && !hasManualAnimation)) {
      // The flag marks the array as ours, so a region that moved away deletes
      // it. Without the flag, ownership would be positional and deletion would
      // be inexpressible.
      if (!animationFlag && findChild(tile, 'animation')) {
        warnings.push(
          `Tile ${tileId} sets "${AUTO_ANIMATION_PROPERTY}" to false while carrying animation frames, so the frames are deleted; remove the property instead to keep hand-drawn frames.`,
        );
      }

      tile.children = tile.children.filter((child) => child.name !== 'animation');

      if (animationFlag) {
        removeProperty(tile, AUTO_ANIMATION_PROPERTY);
      }
    }
  }

  prune(root);
  sortTilesById(root);
  setAttribute(root, 'columns', String(image.columns));
  setAttribute(root, 'tilecount', String(image.tileCount));

  let imageElement = findChild(root, 'image');

  if (imageElement) {
    setAttribute(imageElement, 'width', String(image.width));
    setAttribute(imageElement, 'height', String(image.height));
  }

  return {warnings};
}
