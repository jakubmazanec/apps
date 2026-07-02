import {describe, expect, test, vi} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {GraphicsComponent} from '../source/game/GraphicsComponent.js';
import {graphicsSystem} from '../source/game/graphicsSystem.js';
import {LevelComponent} from '../source/game/LevelComponent.js';
import {levelQuery} from '../source/game/levelQuery.js';
import {MotionComponent} from '../source/game/MotionComponent.js';
import {type Constructor} from '../source/utilities/Constructor.js';

function createSpriteStub() {
  let view = {playing: true, play: vi.fn(), stop: vi.fn()};

  // eslint-disable-next-line @typescript-eslint/naming-convention -- kebab-case animation name from the spritesheet
  return {view, sprites: {'standing-down': view}, currentSpriteName: 'standing-down'};
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
      addToLayer: vi.fn(),
      removeFromLayer: vi.fn(),
      topLayerIndex: 2,
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
});
