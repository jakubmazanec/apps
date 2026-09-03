import {type Component} from './Component';

export type EntityOptions<T extends readonly [...rest: readonly Component[]]> = {
  components: T;
};
