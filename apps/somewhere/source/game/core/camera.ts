import {Entity, Vector} from 'tellurion';

import {CameraComponent} from '../components/CameraComponent.js';

export const camera = new Entity({
  components: [new CameraComponent({position: new Vector(0, 0)})],
});
