// Regression tests for the keep-out sign on the real exported map: the sign
// zone must be reachable (a player pushing up against its wall face gets the
// auto-shown dialogue) without being a trap on the normal walking routes.
// The real public/map.json and public/tileset.json drive the world; only the
// render/audio edges are stubbed so the simulation runs headless.
import fs from 'node:fs';
import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {InputComponent} from '../source/engine/input/InputComponent.js';
import {toTileId} from '../source/engine/tiled/TileId.js';
import {Tilemap} from '../source/engine/tiled/Tilemap.js';
import {Tileset} from '../source/engine/tiled/Tileset.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {audio} from '../source/game/audio.js';
import {dialogueEntity} from '../source/game/dialogue.js';
import {dialogueBoxSystem} from '../source/game/dialogueBoxSystem.js';
import {DialogueComponent} from '../source/game/DialogueComponent.js';
import {game} from '../source/game/game.js';
import {inputQuery} from '../source/game/inputQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {playersQuery} from '../source/game/playersQuery.js';
import {world} from '../source/game/world.js';

// The real DialogueBox runs; only the primitives that need an installed
// bitmap font or the layout runtime are mocked (the DialogueBox.test setup).
vi.mock('@pixi/layout/components', async () => {
  let {Container} = await import('pixi.js');

  class LayoutContainer extends Container {
    background: unknown;
    // @ts-ignore - mock layout property override
    layout: unknown;

    constructor(options?: {background?: unknown}) {
      super();
      this.background = options?.background;
    }
  }

  return {LayoutContainer};
});

vi.mock('../source/engine/ui/Text.js', async () => {
  let {Container} = await import('pixi.js');

  class Text {
    view = new Container();
    text: string;

    constructor({text}: {text: string}) {
      this.text = text;
    }

    setText(value: string) {
      this.text = value;

      return this;
    }

    setAnchor() {
      return this;
    }

    destroy() {
      this.view.destroy();
    }
  }

  return {Text};
});

vi.mock('../source/game/assets.js', async () => {
  let {Texture} = await import('pixi.js');

  return {
    assets: {
      texture: () => Texture.WHITE,
      sound: () => ({}),
      font: () => ({fontFamily: 'monogram', fontSize: 12, fill: 0xffffff}),
    },
  };
});

vi.mock('../source/game/game.js', async () => {
  let pixiModule = await import('pixi.js');

  // Headless pixi containers lack the federated addEventListener mixin;
  // UiRoot only uses it for pointer plumbing, irrelevant to focus logic.
  let prototype = pixiModule.Container.prototype as unknown as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };

  prototype.addEventListener ??= () => {};
  prototype.removeEventListener ??= () => {};

  let {UiRoot} = await import('../source/engine/ui/UiRoot.js');

  return {
    game: {
      app: {screen: {width: 1280, height: 720}, canvas: {width: 1280, height: 720}},
      pixelScale: 4,
      currentScreen: {ui: new UiRoot()},
    },
  };
});

vi.mock('../source/game/widgets.js', async () => {
  let {Container} = await import('pixi.js');

  return {nineSlice: () => new Container(), createButton: () => new Container()};
});

const SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
];

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS, deltaTime: deltaMS / (1000 / 60)} as unknown as pixi.Ticker;
}

async function startWorldOnRealMap() {
  let mapJson = JSON.parse(fs.readFileSync('public/map.json', 'utf8')) as unknown;
  let tilesetJson = JSON.parse(fs.readFileSync('public/tileset.json', 'utf8')) as {
    tilecount: number;
    columns: number;
    tiles?: Array<{
      id: number;
      objectgroup?: {objects: Array<{x: number; y: number; width: number; height: number}>};
    }>;
  };

  let tilemap = await Tilemap.from(mapJson);
  let tiles = Array.from({length: tilesetJson.tilecount}, (unused, index) => ({
    id: toTileId(index),
    textures: [pixi.Texture.WHITE],
    collisionBoxes: [] as pixi.Rectangle[],
  }));

  for (let tilesetTile of tilesetJson.tiles ?? []) {
    for (let object of tilesetTile.objectgroup?.objects ?? []) {
      tiles[tilesetTile.id]!.collisionBoxes.push(
        new pixi.Rectangle(object.x, object.y, object.width, object.height),
      );
    }
  }

  let tileset = new Tileset({
    tileWidth: 16,
    tileHeight: 16,
    columnCount: tilesetJson.columns,
    rowCount: Math.ceil(tilesetJson.tilecount / tilesetJson.columns),
    tiles,
  });

  let spriteBag = {
    animations: Object.fromEntries(SPRITE_NAMES.map((name) => [name, [pixi.Texture.WHITE]])),
  };

  // The real DialogueBox measures through the bitmap-font manager, which has
  // no installed font headless; 1 art px per character mirrors the unit tests.
  vi.spyOn(pixi.BitmapFontManager, 'measureText').mockImplementation(((text: string) => ({
    width: text.length,
    height: 12,
    scale: 1,
  })) as never);
  vi.spyOn(audio, 'play').mockImplementation((() => {}) as never);
  vi.spyOn(pixi.Assets.cache, 'has').mockReturnValue(true);
  vi.spyOn(pixi.Assets, 'get').mockImplementation(((name: string) =>
    name === 'map' ? tilemap
    : name === 'tileset.json' ? tileset
    : name === 'character' || name === 'npc' || name === 'spark' ? spriteBag
    : name === 'prompt-bubble' ? {textures: {bubble: pixi.Texture.WHITE}}
    : name === 'ui' ? {textures: {'advance-marker': pixi.Texture.WHITE}}
    : name === 'blip' || name === 'chime' || name === 'bump' ? {}
    : undefined) as never);

  world.start();
}

// The real keyboard path: window keydown/keyup through Input's listeners,
// exactly as the browser delivers them. Two updates: the edge lands in the
// command channel, then dialogueSystem consumes it.
function pressKey(code: string) {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', {code}));
  world.update(tick(16.667));
  globalThis.dispatchEvent(new KeyboardEvent('keyup', {code}));
  world.update(tick(16.667));
}

function walkUntil(target: Vector, frames: number, stop: () => boolean) {
  let motion = playersQuery.getFirst().getComponent(MotionComponent);

  motion.target = target;

  for (let frame = 0; frame < frames; frame++) {
    world.update(tick(16.667));

    if (stop()) {
      return;
    }
  }
}

describe('the keep-out sign on the exported map', () => {
  afterEach(() => {
    if (world.isRunning) {
      world.stop();
    }

    vi.restoreAllMocks();
  });

  test('pushing up against the sign wall face auto-shows the sign dialogue', async () => {
    await startWorldOnRealMap();

    let motion = playersQuery.getFirst().getComponent(MotionComponent);
    let component = dialogueEntity.getComponent(DialogueComponent);

    // Open ground below the hut's right wall column; push straight up until
    // the wall stops the feet box inside the sign zone's apron.
    motion.position.set(196, 185);
    walkUntil(new Vector(196, 130), 300, () => component.active !== null);

    expect(component.active).not.toBeNull();
    expect(component.active?.pageText).toBe('KEEP OUT.');
  });

  test('the interact key alone dismisses the auto-shown sign dialogue', async () => {
    await startWorldOnRealMap();

    let motion = playersQuery.getFirst().getComponent(MotionComponent);
    let component = dialogueEntity.getComponent(DialogueComponent);

    let {input} = inputQuery.getFirst().getComponent(InputComponent);

    input.attach(new pixi.Container());

    motion.position.set(196, 185);
    walkUntil(new Vector(196, 130), 300, () => component.active !== null);

    expect(component.active).not.toBeNull();

    pressKey('KeyE'); // skip the reveal: the page completes

    expect(component.active?.phase).toBe('idle');

    pressKey('Space'); // no next, no choices: Space also ends and clears it

    expect(component.active).toBeNull();

    input.detach();
  });

  test('the prompt bubble shows in the approach band and the interact key starts the sign', async () => {
    await startWorldOnRealMap();

    let motion = playersQuery.getFirst().getComponent(MotionComponent);
    let component = dialogueEntity.getComponent(DialogueComponent);
    let {input} = inputQuery.getFirst().getComponent(InputComponent);

    input.attach(new pixi.Container());

    // Near the sign but clear of the zone: feet (196..212, 185..195) against
    // the zone's bottom edge at 174.
    motion.position.set(196, 175);
    world.update(tick(16.667));
    world.update(tick(16.667));

    expect(component.active).toBeNull(); // no auto-show out here

    // system.view is the shared world view; the dialogue layer is added last
    // (above the map), so the current run's layer is the last child.
    let layer = dialogueBoxSystem.view.children.at(-1) as pixi.Container;
    let bubble = layer.children.find((child) => child instanceof pixi.Sprite && child.visible);

    expect(bubble).toBeDefined();

    pressKey('KeyE');

    expect(component.active?.pageText).toBe('KEEP OUT.');

    input.detach();
  });

  test('focus commands drive the choice selection in the Mira dialogue', async () => {
    await startWorldOnRealMap();

    let motion = playersQuery.getFirst().getComponent(MotionComponent);
    let component = dialogueEntity.getComponent(DialogueComponent);
    let {input} = inputQuery.getFirst().getComponent(InputComponent);
    let {ui} = game.currentScreen!;

    input.attach(new pixi.Container());

    // Stand inside Mira's interaction rect (240,176,24x28) and talk to her.
    motion.position.set(244, 180);
    world.update(tick(16.667));
    world.update(tick(16.667));
    pressKey('KeyE'); // start the greeting
    pressKey('KeyE'); // skip the reveal; the greeting has choices

    expect(component.active?.phase).toBe('choosing');
    expect(component.active?.selectedIndex).toBe(0);

    // The box holds the focus scope, so focus commands (what the arrow keys
    // route to) land on its choice buttons and sync the runner's selection.
    ui.focusNext();
    world.update(tick(16.667)); // the focused choice becomes a select command
    world.update(tick(16.667)); // dialogueSystem applies it

    expect(component.active?.selectedIndex).toBe(1);

    ui.activate(); // Enter/Space: the focused choice confirms
    world.update(tick(16.667));
    world.update(tick(16.667));

    expect(component.active?.pageText).toBe('Suit yourself.');

    input.detach();
  });

  test('the walk from spawn to the door never brushes the sign zone', async () => {
    await startWorldOnRealMap();

    let motion = playersQuery.getFirst().getComponent(MotionComponent);
    let component = dialogueEntity.getComponent(DialogueComponent);

    // The natural first trip: spawn toward the hut door below the sign wall.
    // The door teleports on enter; the sign dialogue must never fire on the way.
    walkUntil(new Vector(184, 186), 600, () => motion.position.x > 400);

    expect(motion.position.x).toBeGreaterThan(400); // the door did its job
    expect(component.active).toBeNull(); // the sign stayed quiet
  });
});
