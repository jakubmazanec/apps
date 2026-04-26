import {EntityQuery} from '../engine/EntityQuery.js';
import {CameraComponent} from './CameraComponent.js';
import {world} from './world.js';

export const cameraQuery = new EntityQuery({
  world,
  components: [CameraComponent],
});
