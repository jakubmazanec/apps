import {CameraComponent} from '../engine/CameraComponent.js';
import {EntityQuery} from '../engine/EntityQuery.js';
import {LevelComponent} from '../engine/LevelComponent.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {PlayerComponent} from '../engine/PlayerComponent.js';
import {System} from '../engine/System.js';
import {game} from './game.js';
import {levelQuery} from './levelQuery.js';
import {world} from './world.js';

export const cameraSystem = new System({
  displayName: 'Camera system',
  world,
  components: [CameraComponent],
  entityQueries: {
    players: new EntityQuery({
      world,
      components: [PlayerComponent, MotionComponent],
    }),
    levels: levelQuery,
  },
  onUpdate: (delta, system) => {
    let {position: cameraPosition} = system.getFirst().getComponent(CameraComponent);
    let {map} = system.entityQueries.levels.getFirst().getComponent(LevelComponent);
    let {position: playerPosition} = system.entityQueries.players
      .getFirst()
      .getComponent(MotionComponent);

    let x = Math.floor(playerPosition.x - game.app.view.width / 2);
    let y = Math.floor(playerPosition.y - game.app.view.height / 2);

    cameraPosition.set(
      Math.max(map.position.x, Math.min(map.position.x + map.width - game.app.view.width, x)),
      Math.max(map.position.y, Math.min(map.position.y + map.height - game.app.view.height, y)),
    );
  },
});

world.addSystem(cameraSystem);
