import {Component} from './Component.js';

export type PlayerComponentOptions = {
  name: string;
};

export class PlayerComponent extends Component {
  name: string;

  constructor({name}: PlayerComponentOptions) {
    super();

    this.name = name;
  }
}
