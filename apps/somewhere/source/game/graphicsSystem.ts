import {CameraComponent} from '../engine/CameraComponent.js';
import {GraphicsComponent} from '../engine/GraphicsComponent.js';
import {LevelComponent} from '../engine/LevelComponent.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {System} from '../engine/System.js';
import {cameraQuery} from './cameraQuery.js';
import {levelQuery} from './levelQuery.js';
import {world} from './world.js';

export const graphicsSystem = new System({
  world,
  components: [MotionComponent, GraphicsComponent],
  entityQueries: {
    cameras: cameraQuery,
    level: levelQuery,
  },
  onUpdate: (ticker, system) => {
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let {position: cameraPosition} = system.entityQueries.cameras
      .getFirst()
      .getComponent(CameraComponent);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);
      let {sprite, boundingBox} = entity.getComponent(GraphicsComponent);
      let angle = motion.velocity.angle < 0 ? motion.velocity.angle + 360 : motion.velocity.angle;

      if (motion.velocity.length > 0) {
        if (angle < 45 || angle >= 315) {
          sprite.show('walking-right');
        } else if (angle >= 45 && angle < 135) {
          sprite.show('walking-down');
        } else if (angle >= 135 && angle < 225) {
          sprite.show('walking-left');
        } else if (angle >= 225 && angle < 315) {
          sprite.show('walking-up');
        }
      } else if (angle < 45 || angle >= 315) {
        sprite.show('standing-right');
      } else if (angle >= 45 && angle < 135) {
        sprite.show('standing-down');
      } else if (angle >= 135 && angle < 225) {
        sprite.show('standing-left');
      } else if (angle >= 225 && angle < 315) {
        sprite.show('standing-up');
      }

      // we add the sprite to the map view, and positions are relative to a parent container
      sprite.view.position.x = Math.round(motion.position.x - cameraPosition.x - map.view.x);
      sprite.view.position.y = Math.round(motion.position.y - cameraPosition.y - map.view.y);
      sprite.view.zIndex = sprite.view.position.y + boundingBox.y + boundingBox.height;
    }
  },
  onAddEntity: (entity, system) => {
    let graphics = entity.getComponent(GraphicsComponent);
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);

    for (let sprite of Object.values(graphics.sprite.sprites)) {
      map.addToLayer(sprite);
    }
  },
});

world.addSystem(graphicsSystem);
