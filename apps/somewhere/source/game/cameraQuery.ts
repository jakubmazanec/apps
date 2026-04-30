import {EntityQuery} from '../engine/EntityQuery.js';
import {CameraComponent} from './CameraComponent.js';

export const cameraQuery = new EntityQuery({
  components: [CameraComponent],
});
