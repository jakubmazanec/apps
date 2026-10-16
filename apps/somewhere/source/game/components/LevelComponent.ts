import {Component, Map, type MapOptions} from 'tellurion';

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
