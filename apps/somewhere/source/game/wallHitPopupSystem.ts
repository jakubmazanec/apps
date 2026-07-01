import * as pixi from 'pixi.js';

import {Entity} from '../engine/ecs/Entity.js';
import {System} from '../engine/ecs/System.js';
import {easeOutQuad} from '../engine/scheduler/easing.js';
import {Timer} from '../engine/scheduler/Timer.js';
import {TimerComponent} from '../engine/scheduler/TimerComponent.js';
import {Tween} from '../engine/scheduler/Tween.js';
import {TweenComponent} from '../engine/scheduler/TweenComponent.js';
import {Vector} from '../engine/utilities/Vector.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {PopupExpired} from './PopupExpired.js';
import {popupExpiredChannel} from './popupExpiredChannel.js';
import {wallHitChannel} from './wallHitChannel.js';

// All eight names so graphicsSystem's hardcoded sprite.show('standing-right' | ...) always resolves;
// a zero-velocity popup renders as 'standing-right'.
const SPARK_SPRITE_NAMES = [
  'standing-down',
  'walking-down',
  'standing-left',
  'walking-left',
  'standing-up',
  'walking-up',
  'standing-right',
  'walking-right',
] as const;

// The spark spritesheet frame is 16x16 (see public/spark.json).
const SPARK_SIZE = 16;

export const wallHitPopupSystem = new System({
  components: [],
  displayName: 'Wall-hit popup spawner',
  onUpdate: (ticker, system, world) => {
    // `WallHit` carries `{entity, tile}`: the tile that was hit and the entity (the player) that hit it.
    for (let {entity, tile} of wallHitChannel.events) {
      let box = tile.boundingBox;
      let tileX = tile.view.x + (box?.x ?? 0);
      let tileY = tile.view.y + (box?.y ?? 0);
      let tileWidth = box?.width ?? 0;
      let tileHeight = box?.height ?? 0;

      // Spawn the spark where the player actually makes contact: the point on the tile's collision
      // box nearest the player's center (the player entity that hit the wall carries both components).
      let playerMotion = entity.getComponent(MotionComponent);
      let playerBox = entity.getComponent(GraphicsComponent).boundingBox;
      let playerCenterX = playerMotion.position.x + playerBox.x + playerBox.width / 2;
      let playerCenterY = playerMotion.position.y + playerBox.y + playerBox.height / 2;
      let contactX = Math.max(tileX, Math.min(playerCenterX, tileX + tileWidth));
      let contactY = Math.max(tileY, Math.min(playerCenterY, tileY + tileHeight));

      // `graphicsSystem` pins the sprite's top-left to `motion.position`, so offset by half the
      // spark's own size to center it on the contact point.
      let x = contactX - SPARK_SIZE / 2;
      let y = contactY - SPARK_SIZE / 2;

      // Reuses graphicsSystem's render path (MotionComponent + GraphicsComponent); the empty
      // Tween/Timer containers are filled in below because an entity's component set is fixed at
      // construction.
      let popup = new Entity({
        components: [
          new MotionComponent({position: new Vector(x, y), velocity: new Vector(0, 0)}),
          new GraphicsComponent({
            spriteOptions: {assetName: 'spark', spriteNames: [...SPARK_SPRITE_NAMES]},
            boundingBox: new pixi.Rectangle(0, 0, SPARK_SIZE, SPARK_SIZE),
            overlay: true, // render above the hut's overhead ("air") tiles
          }),
          new TweenComponent({tweens: []}),
          new TimerComponent({timers: []}),
        ],
      });

      let motion = popup.getComponent(MotionComponent);

      // float up over 400ms; tweenSystem runs late, so it is the last writer of `position`
      popup.getComponent(TweenComponent).tweens.push({
        tween: new Tween({
          target: motion.position,
          to: {y: y - 24},
          duration: 400,
          easing: easeOutQuad,
        }),
      });

      // lifetime: after 400ms announce expiry so the cleanup system removes the entity next frame
      popup.getComponent(TimerComponent).timers.push({
        timer: new Timer({duration: 400}),
        emit: {channel: popupExpiredChannel, event: new PopupExpired({entity: popup})},
      });

      world.addEntity(popup); // deferred to the end of update; safe to call mid-update
    }
  },
});
