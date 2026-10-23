import {Component, type Vector} from 'tellurion';

export type MotionComponentOptions = {
  position: Vector;
  velocity: Vector;
};

export class MotionComponent extends Component {
  isTouchingWall: boolean;
  position: Vector;
  target: Vector | undefined;
  velocity: Vector;

  constructor({position, velocity}: MotionComponentOptions) {
    super();

    this.position = position;
    this.velocity = velocity;
    this.target = undefined;
    this.isTouchingWall = false;
  }
}
