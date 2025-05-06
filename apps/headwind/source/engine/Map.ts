/* eslint-disable max-classes-per-file */
import {makeAutoObservable} from 'mobx';

import {
  defineHex,
  Grid,
  Orientation,
  rectangle,
  type TupleCoordinates,
} from '../honeycomb/index.js';
import {type Game} from './Game.js';

class MapHex extends defineHex({
  orientation: Orientation.FLAT,
  dimensions: {xRadius: 20, yRadius: 20},
}) {
  isEscapable = false;
  isLand = false;
}

export type MapObjective = 'capture' | 'destroy' | 'escape';

export type MapOptions = {
  game: Game;
  name: string;
  objectives: Record<string, MapObjective>;
  landHexes: TupleCoordinates[];
  escapeHexes: TupleCoordinates[];
};

export class Map {
  game: Game;

  name: string;
  objectives: Record<string, MapObjective>;

  grid: Grid<MapHex>;

  /** Strength of the wind; 0 for calm, 1 for breeze, 2 for gale, 3 for storm. */
  windStrength = 0;
  windDirection = 0;

  constructor({game, name, objectives, landHexes, escapeHexes}: MapOptions) {
    makeAutoObservable(this);

    this.game = game;
    this.name = name;
    this.objectives = objectives;

    this.windStrength = Math.floor(Math.random() * 3);
    this.windDirection = Math.floor(Math.random() * 6) * 60;

    this.grid = new Grid(MapHex, rectangle({width: 20, height: 20}));

    for (let coordinates of landHexes) {
      let hex = this.grid.getHex(coordinates);

      if (hex) {
        hex.isLand = true;
      }
    }

    for (let coordinates of escapeHexes) {
      let hex = this.grid.getHex(coordinates);

      if (hex) {
        hex.isEscapable = true;
      }
    }
  }

  static getTemplate(templateId: string): Omit<MapOptions, 'game'> {
    let templates: Array<Omit<MapOptions, 'game'> & {id: string}> = [
      {
        id: 'map-1',
        name: 'Map #1',
        objectives: {
          UK: 'escape',
          France: 'capture',
        },
        landHexes: [],
        escapeHexes: [[8, 1]],
      },
    ];

    let template = templates.find((template) => template.id === templateId);

    if (!template) {
      throw new Error(`Map template "${templateId}" not found!`);
    }

    let {id, ...map} = template;

    return {...map};
  }

  startBattle() {}

  startRound() {
    if (Math.random() <= 0.5) {
      this.windStrength = Math.floor(Math.random() * 3);
      this.windDirection = Math.floor(Math.random() * 6) * 60;
    }
  }
}
