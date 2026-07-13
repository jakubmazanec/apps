import * as pixi from 'pixi.js';
import {describe, expect, test, vi} from 'vitest';

import {type Component} from '../source/engine/ecs/Component.js';
import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {Vector} from '../source/engine/utilities/Vector.js';
import {CameraComponent} from '../source/game/CameraComponent.js';
import {cameraQuery} from '../source/game/cameraQuery.js';
import {LevelComponent} from '../source/game/LevelComponent.js';
import {mapSystem} from '../source/game/mapSystem.js';
import {type Constructor} from '../source/utilities/Constructor.js';

// LevelComponent builds a real Map from an asset name in its constructor;
// bypass it and assign stub fields onto the real prototype instead (same
// pattern as graphicsSystem.test.ts).
function stubComponent<T extends Component>(ComponentClass: Constructor<T>, fields: object): T {
  return Object.assign(Object.create(ComponentClass.prototype as object) as T, fields);
}

describe('mapSystem', () => {
  test('onUpdate advances the map animations on the world update path', () => {
    let map = {view: new pixi.Container(), position: new Vector(0, 0), update: vi.fn()};
    let level = new Entity({components: [stubComponent(LevelComponent, {map})]});
    let cameraEntity = new Entity({
      components: [new CameraComponent({position: new Vector(0, 0)})],
    });
    let world = new World({
      onStart: (w) => {
        w.addEntityQuery(cameraQuery).addSystem(mapSystem).addEntity(cameraEntity).addEntity(level);
      },
    });

    world.start();

    let ticker = {deltaTime: 1} as unknown as pixi.Ticker;

    world.update(ticker);

    expect(map.update).toHaveBeenCalledTimes(1);
    expect(map.update).toHaveBeenCalledWith(ticker);

    world.stop();
  });
});
