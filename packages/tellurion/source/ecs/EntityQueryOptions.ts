import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';

export type EntityQueryOptions<
  T extends readonly [...rest: ReadonlyArray<Constructor<Component>>],
> = {
  components: T;

  displayName?: string | undefined;
};
