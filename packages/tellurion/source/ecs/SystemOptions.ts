import type * as pixi from 'pixi.js';

import {type Constructor} from '../utilities/Constructor.js';
import {type Component} from './Component.js';
import {type Entity} from './Entity.js';
import {type System} from './System.js';
import {type World} from './World.js';

export type SystemOptions<T extends readonly [...rest: ReadonlyArray<Constructor<Component>>]> = {
  components: T;
  onAttach?: ((system: System<T>, world: World) => void) | undefined;
  onDetach?: ((system: System<T>, world: World) => void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, system: System<T>, world: World) => void) | undefined;
  onAddEntity?:
    | ((
        entity: Entity<readonly [InstanceType<T[number]>]>,
        system: System<T>,
        world: World,
      ) => void)
    | undefined;
  onRemoveEntity?:
    | ((
        entity: Entity<readonly [InstanceType<T[number]>]>,
        system: System<T>,
        world: World,
      ) => void)
    | undefined;

  displayName?: string | undefined;
};
