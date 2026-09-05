import {System} from '../../engine/ecs/System.js';
import {CameraComponent} from '../components/CameraComponent.js';
import {LevelComponent} from '../components/LevelComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {game} from '../core/game.js';
import {levelQuery} from '../queries/levelQuery.js';
import {playersQuery} from '../queries/playersQuery.js';
import {getClampedCameraPosition} from '../utilities/getClampedCameraPosition.js';

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
