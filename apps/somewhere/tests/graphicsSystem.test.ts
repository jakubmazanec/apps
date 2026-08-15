import * as pixi from 'pixi.js';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {type Map} from '../source/engine/tiled/Map.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {assets} from '../source/game/assets.js';
import {camera} from '../source/game/camera.js';
import {CameraComponent} from '../source/game/CameraComponent.js';
import {cameraQuery} from '../source/game/cameraQuery.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {graphicsSystem, pickDirectionalSpriteName} from '../source/game/graphicsSystem.js';
import {LevelComponent} from '../source/game/LevelComponent.js';
import {levelQuery} from '../source/game/levelQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function tick(deltaTime: number): pixi.Ticker {
  return {deltaTime} as unknown as pixi.Ticker;
}

function createSpriteStub() {
  let view = {
    playing: true,
    play: vitest.fn<() => void>(),
    stop: vitest.fn<() => void>(),
    update: vitest.fn<(ticker: pixi.Ticker) => void>(),
    position: {x: 0, y: 0},
    zIndex: 0,
  };

  return {
    view,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
    sprites: {'standing-down': view},
    currentSpriteName: 'standing-down',
    show: vitest.fn<() => void>(),
  };
}

// GraphicsComponent/LevelComponent build a real Sprite/Map from an asset name in their
// constructors, which needs pixi.Assets to already have a loaded spritesheet/tilemap. Bypass
// the constructor and assign the stub fields onto the real prototype instead, so
// `entity.getComponent` (keyed by `.constructor`) still resolves it as the real component class.
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

describe('graphicsSystem sprite lifecycle', () => {
  test('removing an entity stops its playing sprite; re-adding resumes it', () => {
    let sprite = createSpriteStub();
    let map = {
      addToLayer: vitest.fn<(view: pixi.Container, layerIndex?: number) => void>(),
      removeFromLayer: vitest.fn<(view: pixi.Container, layerIndex?: number) => void>(),
      topLayerIndex: 2,
      entityLayerIndex: 1,
    };
    let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
    let popup = new Entity({
      components: [
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        stubComponent(GraphicsComponent, {sprite, boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(levelQuery).addSystem(graphicsSystem).addEntity(level).addEntity(popup);
      },
    });

    world.start(); // the wiring above already adds popup once, so its sprite is already playing

    world.removeEntity(popup);

    expect(sprite.view.stop).toHaveBeenCalledTimes(1);

    world.addEntity(popup);

    expect(sprite.view.play).toHaveBeenCalledTimes(2); // once from start(), once from this resume

    world.stop();
  });

  test('onUpdate advances the current sprite animation on the world update path', () => {
    let sprite = createSpriteStub();
    let map = {
      addToLayer: vitest.fn<(view: pixi.Container, layerIndex?: number) => void>(),
      removeFromLayer: vitest.fn<(view: pixi.Container, layerIndex?: number) => void>(),
      topLayerIndex: 2,
      view: {x: 0, y: 0},
      entityLayerIndex: 1,
    };
    let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
    let cameraEntity = new Entity({
      components: [new CameraComponent({position: new Vector(0, 0)})],
    });
    let player = new Entity({
      components: [
        new MotionComponent({position: new Vector(0, 0), velocity: new Vector(0, 0)}),
        stubComponent(GraphicsComponent, {sprite, boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(levelQuery)
          .addEntityQuery(cameraQuery)
          .addSystem(graphicsSystem)
          .addEntity(level)
          .addEntity(cameraEntity)
          .addEntity(player);
      },
    });

    world.start();

    let ticker = {deltaTime: 1} as unknown as pixi.Ticker;

    world.update(ticker);

    expect(sprite.view.update).toHaveBeenCalledTimes(1);
    expect(sprite.view.update).toHaveBeenCalledWith(ticker);

    world.stop();
  });

  test('sprite positions pass through unrounded: roundPixels owns device-px snapping', () => {
    let sprite = createSpriteStub();
    let map = {
      addToLayer: vitest.fn<(view: pixi.Container, layerIndex?: number) => void>(),
      removeFromLayer: vitest.fn<(view: pixi.Container, layerIndex?: number) => void>(),
      topLayerIndex: 2,
      view: {x: 0, y: 0},
      entityLayerIndex: 1,
    };
    let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
    let cameraEntity = new Entity({
      components: [new CameraComponent({position: new Vector(0.75, 0)})],
    });
    let player = new Entity({
      components: [
        new MotionComponent({position: new Vector(1.25, 2.5), velocity: new Vector(0, 0)}),
        stubComponent(GraphicsComponent, {sprite, boundingBox: {x: 0, y: 0, width: 8, height: 8}}),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(levelQuery)
          .addEntityQuery(cameraQuery)
          .addSystem(graphicsSystem)
          .addEntity(level)
          .addEntity(cameraEntity)
          .addEntity(player);
      },
    });

    world.start();
    world.update({deltaTime: 1} as unknown as pixi.Ticker);

    expect(sprite.view.position.x).toBe(0.5);
    expect(sprite.view.position.y).toBe(2.5);

    world.stop();
  });
});

describe(pickDirectionalSpriteName, () => {
  test('picks walking names by velocity angle', () => {
    expect(pickDirectionalSpriteName(new Vector(1, 0))).toBe('walking-right');
    expect(pickDirectionalSpriteName(new Vector(0, 1))).toBe('walking-down');
    expect(pickDirectionalSpriteName(new Vector(-1, 0))).toBe('walking-left');
    expect(pickDirectionalSpriteName(new Vector(0, -1))).toBe('walking-up');
  });

  test('picks standing names at zero velocity', () => {
    expect(pickDirectionalSpriteName(new Vector(0, 0))).toBe('standing-right');
  });
});

describe('graphicsSystem directional flag', () => {
  afterEach(() => {
    vitest.restoreAllMocks();
  });

  test('directional: false skips name selection but still positions the sprite', () => {
    let t = () => pixi.Texture.WHITE;
    let characterSpriteset = new Spriteset({
      textures: {},
      animations: Object.fromEntries(
        [
          'standing-down',
          'walking-down',
          'standing-left',
          'walking-left',
          'standing-up',
          'walking-up',
          'standing-right',
          'walking-right',
        ].map((name) => [name, {textures: [t()], speed: 0.15, loop: true}]),
      ),
    });
    let sparkSpriteset = new Spriteset({
      textures: {},
      animations: {spark: {textures: [t()], speed: 0.15, loop: true}},
    });

    vitest.spyOn(assets, 'spriteset').mockImplementation((name: string) => {
      if (name === 'character') {
        return characterSpriteset;
      }

      if (name === 'spark') {
        return sparkSpriteset;
      }

      throw new Error(`Unknown spriteset: ${name}`);
    });

    let fakeMap = {
      view: {x: 0, y: 0},
      addToLayer: () => {},
      removeFromLayer: () => {},
      entityLayerIndex: 0,
      topLayerIndex: 1,
    } as unknown as Map;
    let level = new Entity({
      components: [
        Object.assign(Object.create(LevelComponent.prototype) as LevelComponent, {map: fakeMap}),
      ],
    });
    let walker = new Entity({
      components: [
        new MotionComponent({position: new Vector(10, 20), velocity: new Vector(1, 0)}),
        new GraphicsComponent({
          spriteOptions: {
            assetName: 'character',
            spriteNames: [
              'standing-down',
              'walking-down',
              'standing-left',
              'walking-left',
              'standing-up',
              'walking-up',
              'standing-right',
              'walking-right',
            ],
          },
          boundingBox: new pixi.Rectangle(0, 0, 16, 20),
        }),
      ],
    });
    let popup = new Entity({
      components: [
        new MotionComponent({position: new Vector(5, 6), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {assetName: 'spark', spriteNames: ['spark']},
          boundingBox: new pixi.Rectangle(0, 0, 4, 4),
          directional: false,
        }),
      ],
    });
    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(levelQuery)
          .addEntityQuery(cameraQuery)
          .addSystem(graphicsSystem)
          .addEntity(camera)
          .addEntity(level)
          .addEntity(walker)
          .addEntity(popup);
      },
    });

    world.start();

    // In DEV, a skipped selection is proven by the absence of a throw: if
    // graphicsSystem called show('standing-right') on the spark sprite, the
    // unknown-name guard would crash this update.
    world.update(tick(16));

    let walkerSprite = walker.getComponent(GraphicsComponent).sprite;
    let popupSprite = popup.getComponent(GraphicsComponent).sprite;

    expect(walkerSprite.currentSpriteName).toBe('walking-right');
    expect(popupSprite.currentSpriteName).toBe('spark');
    expect(popupSprite.view.position.x).toBe(5);
    expect(popupSprite.view.position.y).toBe(6);

    world.stop();
  });
});
