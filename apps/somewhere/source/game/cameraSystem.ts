import {System} from '../engine/ecs/System.js';
import {CameraComponent} from './CameraComponent.js';
import {game} from './game.js';
import {LevelComponent} from './LevelComponent.js';
import {levelQuery} from './levelQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';

export const cameraSystem = new System({
  displayName: 'Camera system',
  components: [CameraComponent],
  onUpdate: (delta, system) => {
    let {position: cameraPosition} = system.getFirst().getComponent(CameraComponent);
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let {position: playerPosition} = playersQuery.getFirst().getComponent(MotionComponent);

    // The canvas is device px; the world is art px.
    let {app, pixelScale} = game;
    let viewportWidth = app.canvas.width / pixelScale;
    let viewportHeight = app.canvas.height / pixelScale;

    // Snap to whole device px (1/pixelScale art px), not whole art px —
    // art-px snapping would make scrolling visibly steppier at scale > 1 than
    // today's 1-device-px granularity.
    let x = Math.floor((playerPosition.x - viewportWidth / 2) * pixelScale) / pixelScale;
    let y = Math.floor((playerPosition.y - viewportHeight / 2) * pixelScale) / pixelScale;

    cameraPosition.set(
      Math.max(map.position.x, Math.min(map.position.x + map.width - viewportWidth, x)),
      Math.max(map.position.y, Math.min(map.position.y + map.height - viewportHeight, y)),
    );
  },
});
