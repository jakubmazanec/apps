import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {Entity} from '../source/engine/ecs/Entity.js';
import {World} from '../source/engine/ecs/World.js';
import {popupCleanupSystem} from '../source/game/popupCleanupSystem.js';
import {PopupExpired} from '../source/game/PopupExpired.js';
import {popupExpiredChannel} from '../source/game/popupExpiredChannel.js';

function tick(deltaMS: number): pixi.Ticker {
  return {deltaMS} as unknown as pixi.Ticker;
}

describe('popupCleanupSystem', () => {
  test('removes an entity the frame after its PopupExpired surfaces', () => {
    let popup = new Entity({components: []});
    let world = new World({
      onStart: (w) => {
        w.addEventChannel(popupExpiredChannel).addSystem(popupCleanupSystem).addEntity(popup);
      },
    });

    world.start();

    expect(world.entities).toContain(popup);

    popupExpiredChannel.push(new PopupExpired({entity: popup}));

    world.update(tick(16)); // event still buffered this frame; cleanup sees nothing yet

    expect(world.entities).toContain(popup);

    world.update(tick(16)); // event surfaced; cleanup removes the entity

    expect(world.entities).not.toContain(popup);

    world.stop();
  });
});
