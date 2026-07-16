import type * as pixi from 'pixi.js';
import {afterEach, describe, expect, test} from 'vitest';

import {Input} from '../source/engine/input/Input.js';

// Input's pixi surface is `view.on`/`view.off` plus per-event
// `getLocalPosition`, so a recording fake stands in for a real container.
// `scale` mimics the pixelScale root transform that getLocalPosition inverts.
function createView() {
  let handlers: Record<string, Array<(event: unknown) => void>> = {};

  return {
    handlers,
    scale: 2,
    on(event: string, handler: (event: unknown) => void) {
      (handlers[event] ??= []).push(handler);

      return this;
    },
    off(event: string, handler: (event: unknown) => void) {
      handlers[event] = (handlers[event] ?? []).filter((existing) => existing !== handler);

      return this;
    },
    // Simulates pixi dispatching 'pointertap' and returns the event object so
    // tests can mutate it afterwards (pixi reuses federated events).
    tap(x: number, y: number) {
      let event = {
        global: {x, y},
        // Mirrors pixi: view-local is derived from the live `global` at call
        // time by inverting the view's world transform.
        getLocalPosition(view: {scale: number}) {
          return {x: this.global.x / view.scale, y: this.global.y / view.scale};
        },
      };

      for (let handler of handlers.pointertap ?? []) {
        handler(event);
      }

      return event;
    },
  };
}

const DEFAULT_BINDINGS = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
  'move-up': {keys: ['KeyW', 'ArrowUp']},
  // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
  'move-left': {keys: ['KeyA']},
};

// Attached inputs hold window listeners; every test must detach or keydowns
// leak into the next test. The helper tracks them for afterEach; tests that
// exercise detach themselves must not use the helper.
// eslint-disable-next-line vitest/require-hook -- tracking for afterEach in describe block
let attachedInputs: Input[] = [];

function createAttachedInput(
  bindings: ConstructorParameters<typeof Input>[0]['bindings'] = DEFAULT_BINDINGS,
) {
  let view = createView();
  let input = new Input({bindings});

  input.attach(view as unknown as pixi.Container);
  attachedInputs.push(input);

  return {input, view};
}

function press(code: string) {
  let event = new KeyboardEvent('keydown', {code, cancelable: true});

  globalThis.dispatchEvent(event);

  return event;
}

function release(code: string) {
  let event = new KeyboardEvent('keyup', {code, cancelable: true});

  globalThis.dispatchEvent(event);

  return event;
}

describe('Input keyboard edges', () => {
  afterEach(() => {
    for (let input of attachedInputs) {
      input.detach();
    }

    attachedInputs = [];
  });

  test('pressed → held → released sequencing across steps', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBeTruthy();
    expect(input.held('move-up')).toBeTruthy();
    expect(input.released('move-up')).toBeFalsy();

    input.update();

    expect(input.pressed('move-up')).toBeFalsy();
    expect(input.held('move-up')).toBeTruthy();
    expect(input.released('move-up')).toBeFalsy();

    release('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBeFalsy();
    expect(input.held('move-up')).toBeFalsy();
    expect(input.released('move-up')).toBeTruthy();

    input.update();

    expect(input.released('move-up')).toBeFalsy();
  });

  test('two keys on one action: releasing one keeps it held with no released edge', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    press('ArrowUp');
    input.update();

    expect(input.pressed('move-up')).toBeTruthy();

    release('KeyW');
    input.update();

    expect(input.held('move-up')).toBeTruthy();
    expect(input.released('move-up')).toBeFalsy();
    expect(input.pressed('move-up')).toBeFalsy();

    release('ArrowUp');
    input.update();

    expect(input.released('move-up')).toBeTruthy();
  });

  test('window blur clears the down-set: released edge on the next step', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBeTruthy();

    globalThis.dispatchEvent(new Event('blur'));
    input.update();

    expect(input.held('move-up')).toBeFalsy();
    expect(input.released('move-up')).toBeTruthy();
  });

  test('keyboard events targeting a text-entry element are ignored', () => {
    let {input} = createAttachedInput();
    let field = document.createElement('input');

    document.body.append(field);
    field.dispatchEvent(
      new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true, cancelable: true}),
    );
    input.update();

    expect(input.held('move-up')).toBeFalsy();

    field.remove();
  });

  test('a key released on a text-entry element still clears: no stuck key', () => {
    let {input} = createAttachedInput();
    let field = document.createElement('input');

    document.body.append(field);

    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBeTruthy();

    // Release targets the <input> (focus moved after keydown). The keyup guard
    // used to skip this delete, stranding the key as permanently held.
    field.dispatchEvent(
      new KeyboardEvent('keyup', {code: 'KeyW', bubbles: true, cancelable: true}),
    );
    input.update();

    expect(input.held('move-up')).toBeFalsy();

    field.remove();
  });

  test('preventDefault fires only for bound codes', () => {
    createAttachedInput();

    expect(press('KeyW').defaultPrevented).toBeTruthy();
    expect(press('KeyQ').defaultPrevented).toBeFalsy();
  });

  test('an unknown action name throws', () => {
    let {input} = createAttachedInput();

    expect(() => input.pressed('warp')).toThrow('Unknown action "warp"!');
    expect(() => input.held('warp')).toThrow('Unknown action "warp"!');
    expect(() => input.released('warp')).toThrow('Unknown action "warp"!');
  });

  test('a binding code containing "+" throws at construction', () => {
    expect(() => new Input({bindings: {jump: {keys: ['Shift+KeyW']}}})).toThrow(
      'Invalid key code "Shift+KeyW" for action "jump"',
    );
  });

  test('strict attach/detach lifecycle and listener removal', () => {
    // Not via the helper: this test manages its own detach.
    let view = createView();
    let input = new Input({bindings: DEFAULT_BINDINGS});

    expect(() => input.detach()).toThrow('Input is not attached!');

    input.attach(view as unknown as pixi.Container);

    expect(() => input.attach(view as unknown as pixi.Container)).toThrow(
      'Input is already attached!',
    );

    input.detach();

    // Listeners are gone and state was cleared: a press after detach never lands.
    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBeFalsy();

    // A detached input can be re-attached cleanly.
    input.attach(view as unknown as pixi.Container);
    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBeTruthy();

    input.detach();
  });
});

const TAP_BINDINGS = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
  'move-up': {keys: ['KeyW']},
  // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
  'move-to': {pointerTap: true},
  interact: {keys: ['KeyE'], pointerTap: true},
};

describe('Input taps', () => {
  afterEach(() => {
    for (let input of attachedInputs) {
      input.detach();
    }

    attachedInputs = [];
  });

  test('a tap is instantaneous: pressed and released on its step, never held', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(10, 20);
    input.update();

    expect(input.pressed('move-to')).toBeTruthy();
    expect(input.released('move-to')).toBeTruthy();
    expect(input.held('move-to')).toBeFalsy();
    expect(input.tapPosition.x).toBe(5);
    expect(input.tapPosition.y).toBe(10);

    input.update();

    expect(input.pressed('move-to')).toBeFalsy();
    expect(input.released('move-to')).toBeFalsy();
  });

  test('tapPosition is view-local: the root scale is divided out at latch time', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(10, 20);
    input.update();

    expect(input.tapPosition.x).toBe(10 / view.scale);
    expect(input.tapPosition.y).toBe(20 / view.scale);
  });

  test('multiple taps in one step collapse to one edge, last position wins', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(1, 2);
    view.tap(3, 4);
    input.update();

    expect(input.pressed('move-to')).toBeTruthy();
    expect(input.tapPosition.x).toBe(1.5);
    expect(input.tapPosition.y).toBe(2);

    input.update();

    expect(input.pressed('move-to')).toBeFalsy();
  });

  test('tapPosition is the tap-time position: later event mutation cannot retarget it', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    // pixi reuses federated event objects; a pointer move before the next
    // update() mutates `global`. The buffered copy must not follow it.
    let event = view.tap(10, 20);

    event.global.x = 999;
    event.global.y = 999;
    input.update();

    expect(input.tapPosition.x).toBe(5);
    expect(input.tapPosition.y).toBe(10);
  });

  test('taps do not leak into key-only actions; a dual-bound action unions both sources', () => {
    let {input, view} = createAttachedInput(TAP_BINDINGS);

    view.tap(5, 5);
    input.update();

    expect(input.pressed('move-up')).toBeFalsy();
    expect(input.pressed('interact')).toBeTruthy();
    expect(input.held('interact')).toBeFalsy();

    press('KeyE');
    input.update();

    expect(input.pressed('interact')).toBeTruthy();
    expect(input.held('interact')).toBeTruthy();
    expect(input.released('interact')).toBeFalsy();
  });

  test('attach registers pointertap and nothing else on the view', () => {
    let {view} = createAttachedInput(TAP_BINDINGS);

    expect(Object.keys(view.handlers)).toEqual(['pointertap']);
    expect(view.handlers.pointertap).toHaveLength(1);
  });
});
