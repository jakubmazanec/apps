import {EntityQuery} from 'tellurion';

import {CameraComponent} from '../components/CameraComponent.js';

export const cameraQuery = new EntityQuery({
  components: [CameraComponent],
});
