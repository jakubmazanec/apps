import {World} from '../engine/World.js';

declare global {
  interface Window {
    world: World;
  }
}

export const world = new World();

if (typeof window !== 'undefined') {
  window.world = world;
}
