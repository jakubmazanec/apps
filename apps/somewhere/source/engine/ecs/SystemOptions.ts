import type * as pixi from 'pixi.js';

import {type Constructor} from '../../utilities/Constructor';
import {type Component} from './Component';
import {type Entity} from './Entity';
import {type System} from './System';
import {type World} from './World';

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
