import {makeAutoObservable} from 'mobx';

export type MapOptions = {
  name: string;
};

export class Map {
  name: string;

  /** Strength of the wind; 0 for calm, 1 for breeze, 2 for gale, 3 for storm. */
  windStrength = 0;
  windDirection = 0;

  constructor({name}: MapOptions) {
    makeAutoObservable(this);

    this.name = name;

    this.windStrength = 1;
    this.windDirection = 240;
  }
}
