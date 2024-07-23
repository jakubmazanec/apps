import {Component} from './Component.js';
import {type Vector} from './Vector.js';

export type MotionComponentOptions = {
  position: Vector;
  velocity: Vector;
};

export class MotionComponent extends Component {
  position: Vector;
  velocity: Vector;
  target: Vector | undefined;

  constructor({position, velocity}: MotionComponentOptions) {
    super();

    this.position = position;
    this.velocity = velocity;
    this.target = undefined;
  }
}
