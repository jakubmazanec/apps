import {System} from '../engine/ecs/System.js';
import {CameraComponent} from './CameraComponent.js';
import {game} from './game.js';
import {getClampedCameraPosition} from './getClampedCameraPosition.js';
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
    let clamped = getClampedCameraPosition({
      map,
      playerX: playerPosition.x,
      playerY: playerPosition.y,
      viewportWidth: app.canvas.width / pixelScale,
      viewportHeight: app.canvas.height / pixelScale,
      pixelScale,
    });

    cameraPosition.set(clamped.x, clamped.y);
  },
});
