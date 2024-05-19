import {Component} from './Component.js';
import {type Vector} from './Vector.js';

export type CameraComponentOptions = {
  position: Vector;
};

export class CameraComponent extends Component {
  position: Vector;

  constructor({position}: CameraComponentOptions) {
    super();

    this.position = position;
  }
}
