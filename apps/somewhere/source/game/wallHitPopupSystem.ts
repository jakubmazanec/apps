import * as pixi from 'pixi.js';

import {PlaySound} from '../engine/audio/PlaySound.js';
import {Entity} from '../engine/ecs/Entity.js';
import {System} from '../engine/ecs/System.js';
import {easeOutQuad} from '../engine/scheduler/easing.js';
import {Timer} from '../engine/scheduler/Timer.js';
import {TimerComponent} from '../engine/scheduler/TimerComponent.js';
import {Tween} from '../engine/scheduler/Tween.js';
import {TweenComponent} from '../engine/scheduler/TweenComponent.js';
import {Vector} from '../engine/utilities/Vector.js';
import {playSoundChannel} from './audio.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {PopupExpired} from './PopupExpired.js';
import {popupExpiredChannel} from './popupExpiredChannel.js';
import {wallHitChannel} from './wallHitChannel.js';

// The popup is a single non-directional sprite; its lifetime stays on a
// Timer because the spark is one frame (a one-shot would complete on the
// first update). Possible future work: pool the popup entities (mind the
// deferred world.removeEntity: release to the pool only once removal has
// actually flushed, and re-push fresh tween/timer entries on reset so stale
// PopupExpired events cannot target a re-acquired popup).

// The spark spritesheet frame is 4x4 (see public/spark.json).
const SPARK_SIZE = 4;

export const wallHitPopupSystem = new System({
  components: [],
  displayName: 'Wall-hit popup spawner',
  onUpdate: (ticker, system, world) => {
    // `WallHit` carries `{entity, tile, box}`: the map-space box that clipped the movement and the entity (the player) that hit it.
    for (let {entity, box} of wallHitChannel.events) {
      // Gameplay SFX for the wall hit, alongside the popup this system already
      // spawns — no separate audio-bridge system. audioSystem plays it on `sfx`.
      playSoundChannel.push(new PlaySound({name: 'bump'}));

      // Spawn the spark where the player actually makes contact: the point on the hit collision
      // box nearest the player's center (the player entity that hit the wall carries both components).
      let playerMotion = entity.getComponent(MotionComponent);
      let playerBox = entity.getComponent(GraphicsComponent).boundingBox;
      let playerCenterX = playerMotion.position.x + playerBox.x + playerBox.width / 2;
      let playerCenterY = playerMotion.position.y + playerBox.y + playerBox.height / 2;
      let contactX = Math.max(box.x, Math.min(playerCenterX, box.x + box.width));
      let contactY = Math.max(box.y, Math.min(playerCenterY, box.y + box.height));
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
            spriteOptions: {assetName: 'spark', spriteNames: ['spark']},
            boundingBox: new pixi.Rectangle(0, 0, SPARK_SIZE, SPARK_SIZE),
            overlay: true, // render above the hut's overhead ("air") tiles
            directional: false, // one spark animation; no walking/standing variants
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
          to: {y: y - 6},
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
