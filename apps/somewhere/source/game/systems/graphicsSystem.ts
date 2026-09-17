import {System} from '../../engine/ecs/System.js';
import {type Vector} from '../../engine/utilities/Vector.js';
import {CameraComponent} from '../components/CameraComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {LevelComponent} from '../components/LevelComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {cameraQuery} from '../queries/cameraQuery.js';
import {levelQuery} from '../queries/levelQuery.js';

export type DirectionalSpriteName = `${'standing' | 'walking'}-${'down' | 'left' | 'right' | 'up'}`;

// Extracted pure so the eight-way mapping is testable without a world. A zero
// vector keeps its stored angle (Vector preserves it), which is 0 for
// freshly-constructed velocities — hence standing-right at rest.
export function pickDirectionalSpriteName(velocity: Vector): DirectionalSpriteName {
  let angle = velocity.angle < 0 ? velocity.angle + 360 : velocity.angle;
  let prefix: 'standing' | 'walking' = velocity.length > 0 ? 'walking' : 'standing';

  if (angle < 45 || angle >= 315) {
    return `${prefix}-right`;
  }

  if (angle < 135) {
    return `${prefix}-down`;
  }

  if (angle < 225) {
    return `${prefix}-left`;
  }

  return `${prefix}-up`;
}

export const graphicsSystem = new System({
  components: [MotionComponent, GraphicsComponent],
  onUpdate: (ticker, system) => {
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let {position: cameraPosition} = cameraQuery.getFirst().getComponent(CameraComponent);

    for (let entity of system.entities) {
      let motion = entity.getComponent(MotionComponent);
      let {sprite, boundingBox, directional, spriteNamePrefix} =
        entity.getComponent(GraphicsComponent);

      if (directional) {
        sprite.show(spriteNamePrefix + pickDirectionalSpriteName(motion.velocity));
      }

      // we add the sprite to the map view, and positions are relative to a parent container;
      // fractional art positions pass through raw — the renderer's roundPixels snaps them to
      // whole device px at render time, keeping today's 1-device-px movement granularity
      sprite.view.position.x = motion.position.x - cameraPosition.x - map.view.x;
      sprite.view.position.y = motion.position.y - cameraPosition.y - map.view.y;
      sprite.view.zIndex = sprite.view.position.y + boundingBox.y + boundingBox.height;

      // Advance the current sprite's animation on world time (sprites are
      // constructed with autoUpdate: false); a paused world freezes it because
      // this system simply doesn't run.
      sprite.view.update(ticker);
    }
  },
  onAddEntity: (entity, system) => {
    let graphics = entity.getComponent(GraphicsComponent);
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let layerIndex = graphics.overlay ? map.topLayerIndex : map.entityLayerIndex;

    for (let sprite of Object.values(graphics.sprite.sprites)) {
      map.addToLayer(sprite, layerIndex);
    }

    graphics.sprite.view.play();
  },
  onRemoveEntity: (entity) => {
    let graphics = entity.getComponent(GraphicsComponent);

    for (let sprite of Object.values(graphics.sprite.sprites)) {
      // Detach from the layer onAddEntity actually parented into, not from
      // whichever map is current now: an entity can outlive its map (a
      // wall-hit popup still floating when the player travels), and looking
      // the layer up again would remove it from the destination map, leaving
      // the sprite parented in the outgoing map's pooled view for the next
      // visit to render again.
      sprite.removeFromParent();
    }

    graphics.sprite.view.stop();
  },
});
