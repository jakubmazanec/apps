import {System} from '../engine/System.js';
import {CameraComponent} from './CameraComponent.js';
import {game} from './game.js';
import {LevelComponent} from './LevelComponent.js';
import {levelQuery} from './levelQuery.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';
import {world} from './world.js';

export const cameraSystem = new System({
  displayName: 'Camera system',
  components: [CameraComponent],
  onUpdate: (delta, system) => {
    let {position: cameraPosition} = system.getFirst().getComponent(CameraComponent);
    let {map} = levelQuery.getFirst().getComponent(LevelComponent);
    let {position: playerPosition} = playersQuery.getFirst().getComponent(MotionComponent);

    let x = Math.floor(playerPosition.x - game.app.canvas.width / 2);
    let y = Math.floor(playerPosition.y - game.app.canvas.height / 2);

    cameraPosition.set(
      Math.max(map.position.x, Math.min(map.position.x + map.width - game.app.canvas.width, x)),
      Math.max(map.position.y, Math.min(map.position.y + map.height - game.app.canvas.height, y)),
    );
  },
});

world.addSystem(cameraSystem);
