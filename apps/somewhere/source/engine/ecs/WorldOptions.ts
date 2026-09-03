import {type World} from './World';

export type WorldOptions = {
  onStart?: ((world: World) => void) | undefined;
  onStop?: ((world: World) => void) | undefined;
};
