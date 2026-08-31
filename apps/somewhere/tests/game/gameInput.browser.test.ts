import type * as pixi from 'pixi.js';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {input} from '../../source/game/core/input.js';

// The game's own control table, tested through the same reads Game and the
// world systems use. A mapping typo (arrows swapped, a gameplay key landing in
// the focus half) is invisible to every other suite: they all build their own
// bindings.
function createView() {
  return {
    on() {
      return this;
    },
    off() {
      return this;
    },
  };
}

function press(code: string) {
  globalThis.dispatchEvent(new KeyboardEvent('keydown', {code, cancelable: true}));
}

const DIRECTIONS = [
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
] as const;
const MOVES = [
  ['KeyW', 'move-up'],
  ['KeyS', 'move-down'],
  ['KeyA', 'move-left'],
  ['KeyD', 'move-right'],
] as const;

describe('the game control table', () => {
  beforeEach(() => {
    input.attach(createView() as unknown as pixi.Container);
  });

  afterEach(() => {
    input.detach();
  });

  test.each(DIRECTIONS)('%s drives focus %s and no other direction', (code, command) => {
    press(code);
    input.update();

    for (let [, other] of DIRECTIONS) {
      expect(input.focusPressed(other)).toBe(other === command);
    }
  });

  test.each(MOVES)('%s drives %s and no other move', (code, action) => {
    press(code);
    input.update();

    for (let [, other] of MOVES) {
      expect(input.pressed(other)).toBe(other === action);
    }
  });

  test.each([['Enter'], ['Space']])('%s activates the focused element', (code) => {
    press(code);
    input.update();

    expect(input.focusPressed('activate')).toBe(true);
  });

  test('Escape cancels', () => {
    press('Escape');
    input.update();

    expect(input.focusPressed('cancel')).toBe(true);
  });

  test('Shift+Tab moves focus back, and never forward too', () => {
    press('ShiftLeft');
    press('Tab');
    input.update();

    expect(input.focusPressed('previous')).toBe(true);
    expect(input.focusPressed('next')).toBe(false);
  });

  test('the halves stay apart: an arrow is no gameplay action, E is no focus command', () => {
    press('ArrowUp');
    press('KeyE');
    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.pressed('interact')).toBe(true);
    expect(input.focusPressed('activate')).toBe(false);
  });
});
