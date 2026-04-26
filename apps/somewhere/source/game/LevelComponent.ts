import {Component} from '../engine/Component.js';
import {Map, type MapOptions} from '../engine/Map.js';

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
