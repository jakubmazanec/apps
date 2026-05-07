import {Component} from '../engine/ecs/Component.js';
import {Map, type MapOptions} from '../engine/tiled/Map.js';

export type LevelComponentOptions = {
  mapOptions: MapOptions;
};

export class LevelComponent extends Component {
  map: Map;

  constructor({mapOptions}: LevelComponentOptions) {
    super();

    this.map = new Map(mapOptions);
  }
}
