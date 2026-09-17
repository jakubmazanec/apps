import {Component} from '../../engine/ecs/Component.js';
import {type Vector} from '../../engine/utilities/Vector.js';

// Hardcoded by design: stroll timing has no authoring surface.
const MIN_WAIT_MS = 3000;
const MAX_WAIT_MS = 8000;

// The degenerate case of NPC behavior ("dumb AI"): a discriminated union with
// a single variant today, so future behaviors slot in as new variants without
// renames.
export type StrollBehavior = {
  type: 'stroll';
  home: Vector; // spawn position (world px, entity position space)
  destination: Vector; // home + authored offset × 16
  goal: 'destination' | 'home'; // where the next/current walk heads
  phase: 'paused' | 'waiting' | 'walking';
  waitRemaining: number; // ms left in the current wait
};

export type Behavior = StrollBehavior;

export type BehaviorComponentOptions = {
  behavior: Behavior;
};

// Shared by the npc factory (the initial linger at spawn) and behaviorSystem
// (each arrival), so the two rolls cannot drift apart.
export function randomStrollWait(): number {
  return MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
}

export class BehaviorComponent extends Component {
  behavior: Behavior;

  constructor({behavior}: BehaviorComponentOptions) {
    super();

    this.behavior = behavior;
  }
}
