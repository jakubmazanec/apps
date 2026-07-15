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

// All eight names so graphicsSystem's hardcoded sprite.show('standing-right' | ...) always resolves;
// a zero-velocity popup renders as 'standing-right'.
//
// TODO: This is load-bearing waste. Every wall hit constructs 8 AnimatedSprites
// (public/spark.json duplicates the same 16x16 frame under all 8 directional
// keys) because the render path has no escape hatch for non-character visuals:
// the Sprite constructor throws on any name missing from the spritesheet, and
// graphicsSystem picks a name purely from velocity direction and crashes in
// Sprite.show() on an unregistered one. Only 'standing-right' is ever shown
// here (velocity is always zero); the other 7 sprites are constructed, added
// to the layer, never displayed, and discarded ~400ms later. The intended fix:
// add a missing-animation fallback (or opt-in directional mode) to
// graphicsSystem plus a guard in Sprite.show(), then shrink this popup to a
// single sprite name and spark.json to a single animation key. Optionally pool
// the popup entities afterward (mind the deferred world.removeEntity: release
// to the pool only once removal has actually flushed, and re-push fresh
// tween/timer entries on reset so stale PopupExpired events cannot target a
// re-acquired popup). Perf impact today is negligible (WallHit is
// edge-triggered, one event per contact episode) — the trap for future
// non-character visuals is the real defect.
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
      // Gameplay SFX for the wall hit, alongside the popup this system already
      // spawns — no separate audio-bridge system. audioSystem plays it on `sfx`.
      playSoundChannel.push(new PlaySound({name: 'bump'}));

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
