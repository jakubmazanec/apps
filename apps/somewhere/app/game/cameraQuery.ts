import {CameraComponent} from '../engine/CameraComponent.js';
import {EntityQuery} from '../engine/EntityQuery.js';
import {world} from './world.js';

export const cameraQuery = new EntityQuery({
  world,
  components: [CameraComponent],
});
