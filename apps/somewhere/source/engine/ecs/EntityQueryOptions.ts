import {type Constructor} from '../utilities/Constructor';
import {type Component} from './Component';

export type EntityQueryOptions<
  T extends readonly [...rest: ReadonlyArray<Constructor<Component>>],
> = {
  components: T;

  displayName?: string | undefined;
};
