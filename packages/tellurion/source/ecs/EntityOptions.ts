import {type Component} from './Component.js';

export type EntityOptions<T extends readonly [...rest: readonly Component[]]> = {
  components: T;
};
