import {afterEach, describe, expect, test} from 'vitest';

import {type Game} from '../../source/engine/app/Game.js';
import {GameInput} from '../../source/engine/input/GameInput.js';

// GameInput's pixi surface is `view.on`/`view.off` plus per-event
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
  actions: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-up': {keys: ['KeyW', 'ArrowUp']},
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-left': {keys: ['KeyA']},
  },
};
// Attached inputs hold window listeners; every test must detach or keydowns
// leak into the next test. The helper tracks them for afterEach; tests that
// exercise detach themselves must not use the helper.
// eslint-disable-next-line vitest/require-hook -- tracking for afterEach in describe block
let attachedInputs: GameInput[] = [];

function createAttachedInput(
  bindings: ConstructorParameters<typeof GameInput>[0] = DEFAULT_BINDINGS,
) {
  let view = createView();
  let input = new GameInput(bindings);

  input.attach({view} as unknown as Game);
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

describe('GameInput keyboard edges', () => {
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

    expect(input.pressed('move-up')).toBe(true);
    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);

    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);

    release('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(true);

    input.update();

    expect(input.released('move-up')).toBe(false);
  });

  test('two keys on one action: releasing one keeps it held with no released edge', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    press('ArrowUp');
    input.update();

    expect(input.pressed('move-up')).toBe(true);

    release('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);
    expect(input.pressed('move-up')).toBe(false);

    release('ArrowUp');
    input.update();

    expect(input.released('move-up')).toBe(true);
  });

  test('window blur clears the down-set: released edge on the next step', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);

    globalThis.dispatchEvent(new Event('blur'));
    input.update();

    expect(input.held('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(true);
  });

  test('keyboard events targeting a text-entry element are ignored', () => {
    let {input} = createAttachedInput();
    let field = document.createElement('input');

    document.body.append(field);
    field.dispatchEvent(
      new KeyboardEvent('keydown', {code: 'KeyW', bubbles: true, cancelable: true}),
    );
    input.update();

    expect(input.held('move-up')).toBe(false);

    field.remove();
  });

  test('a key released on a text-entry element still clears: no stuck key', () => {
    let {input} = createAttachedInput();
    let field = document.createElement('input');

    document.body.append(field);

    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);

    // Release targets the <input> (focus moved after keydown). The keyup guard
    // used to skip this delete, stranding the key as permanently held.
    field.dispatchEvent(
      new KeyboardEvent('keyup', {code: 'KeyW', bubbles: true, cancelable: true}),
    );
    input.update();

    expect(input.held('move-up')).toBe(false);

    field.remove();
  });

  test('preventDefault fires for every key outside text entry', () => {
    // The canvas owns the keyboard: no browser default competes with a
    // binding, and a code no action names today may be bound tomorrow.
    createAttachedInput();

    expect(press('KeyW').defaultPrevented).toBe(true);
    expect(press('KeyQ').defaultPrevented).toBe(true);
    expect(press('ShiftLeft').defaultPrevented).toBe(true);
  });

  test('a prefixed key matches only while its modifiers are held', () => {
    let {input} = createAttachedInput({actions: {save: {keys: ['Ctrl+KeyS']}}});

    press('KeyS');
    input.update();

    expect(input.pressed('save')).toBe(false);

    press('ControlLeft');
    press('KeyS');
    input.update();

    expect(input.pressed('save')).toBe(true);
  });

  test('a bare key is suppressed while a prefixed binding for the same code matches', () => {
    // The Tab / Shift+Tab case the focus layer relies on: one physical press
    // must drive exactly one of them.
    let {input} = createAttachedInput({
      actions: {
        next: {keys: ['Tab']},
        previous: {keys: ['Shift+Tab']},
      },
    });

    press('ShiftLeft');
    press('Tab');
    input.update();

    expect(input.pressed('previous')).toBe(true);
    expect(input.pressed('next')).toBe(false);

    release('ShiftLeft');
    release('Tab');
    input.update();
    press('Tab');
    input.update();

    expect(input.pressed('next')).toBe(true);
    expect(input.pressed('previous')).toBe(false);
  });

  test('a bare key with no prefixed sibling ignores modifiers', () => {
    // Gameplay keys must keep working with anything held: binding Shift later
    // (sprint, a debug key) cannot be allowed to break walking.
    let {input} = createAttachedInput();

    press('ShiftLeft');
    press('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(true);
    expect(input.held('move-up')).toBe(true);
  });

  test('an unknown action name throws', () => {
    let {input} = createAttachedInput();

    expect(() => input.pressed('warp')).toThrow('Unknown action "warp"!');
    expect(() => input.held('warp')).toThrow('Unknown action "warp"!');
    expect(() => input.released('warp')).toThrow('Unknown action "warp"!');
  });

  test('an unknown modifier prefix throws at construction', () => {
    expect(() => new GameInput({actions: {jump: {keys: ['Shft+KeyW']}}})).toThrow(
      'Invalid modifier "Shft" in key "Shft+KeyW" for action "jump"',
    );
  });

  test('the same key in two actions throws at construction, naming both', () => {
    expect(
      () =>
        new GameInput({
          focus: {activate: {keys: ['Enter', 'Space']}},
          actions: {advance: {keys: ['Space']}},
        }),
    ).toThrow('Key "Space" is bound to both "activate" and "advance"');
  });

  test('canonical order makes reordered modifiers the same binding', () => {
    expect(
      () =>
        new GameInput({
          actions: {save: {keys: ['Ctrl+Shift+KeyS']}, quickSave: {keys: ['Shift+Ctrl+KeyS']}},
        }),
    ).toThrow('is bound to both');
  });

  test('focusPressed reads the focus half and ignores unbound commands', () => {
    let {input} = createAttachedInput({
      focus: {activate: {keys: ['Enter']}},
      actions: {interact: {keys: ['KeyE']}},
    });

    press('Enter');
    input.update();

    expect(input.focusPressed('activate')).toBe(true);
    expect(input.focusPressed('next')).toBe(false);
    expect(() => input.pressed('activate')).toThrow('Unknown action "activate"!');
  });

  test('a key pressed and released between two steps still fires an edge', () => {
    // The engine admits 100 ms frames (minFPS = 10), so a quick tap can begin
    // and end inside one gap. Without a latch it lands in neither snapshot.
    let {input} = createAttachedInput();

    input.update();
    press('KeyW');
    release('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(true);
    expect(input.held('move-up')).toBe(false);

    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(false);
  });

  test('a key still held is not treated as a sub-frame tap', () => {
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);
    expect(input.released('move-up')).toBe(false);
  });

  test('an OS key repeat does not latch a phantom edge on release', () => {
    // Auto-repeat sends a fresh keydown every few dozen ms, so the last repeat
    // and the keyup routinely land in one frame gap. Only a code that was not
    // already down has gone down since the last step.
    let {input} = createAttachedInput();

    press('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(true);

    press('KeyW');
    release('KeyW');
    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.released('move-up')).toBe(true);
  });

  test('a key pressed in the gap a blur lands in does not latch', () => {
    // Blur clears the down-set, so the buffer must go with it: otherwise the
    // press fires an edge on the next step, with the window unfocused.
    let {input} = createAttachedInput();

    press('KeyW');
    globalThis.dispatchEvent(new Event('blur'));
    input.update();

    expect(input.pressed('move-up')).toBe(false);
    expect(input.held('move-up')).toBe(false);
  });

  test('a sub-frame tap obeys specificity, so Shift+Tab never also fires next', () => {
    // The latch reads a code that is no longer down, so it must apply the same
    // one-key-one-action rule an ordinary read does.
    let {input} = createAttachedInput({
      actions: {next: {keys: ['Tab']}, previous: {keys: ['Shift+Tab']}},
    });

    press('ShiftLeft');
    input.update();

    press('Tab');
    release('Tab');
    input.update();

    expect(input.pressed('previous')).toBe(true);
    expect(input.pressed('next')).toBe(false);
  });

  test('focusPressed fires for a key tapped inside one frame', () => {
    let {input} = createAttachedInput({focus: {activate: {keys: ['Enter']}}});

    input.update();
    press('Enter');
    release('Enter');
    input.update();

    expect(input.focusPressed('activate')).toBe(true);
  });

  test('strict attach/detach lifecycle and listener removal', () => {
    // Not via the helper: this test manages its own detach.
    let view = createView();
    let game = {view} as unknown as Game;
    let input = new GameInput(DEFAULT_BINDINGS);

    expect(() => input.detach()).toThrow('GameInput is not attached!');

    input.attach(game);

    expect(() => input.attach(game)).toThrow('GameInput is already attached!');

    input.detach();

    // Listeners are gone and state was cleared: a press after detach never lands.
    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(false);

    // A detached input can be re-attached cleanly.
    input.attach(game);
    press('KeyW');
    input.update();

    expect(input.held('move-up')).toBe(true);

    input.detach();
  });
});

const TAP_BINDINGS = {
  actions: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-up': {keys: ['KeyW']},
    // eslint-disable-next-line @typescript-eslint/naming-convention -- action names use kebab-case per game spec
    'move-to': {pointerTap: true},
    interact: {keys: ['KeyE'], pointerTap: true},
  },
};

describe('GameInput taps', () => {
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

    expect(input.pressed('move-to')).toBe(true);
    expect(input.released('move-to')).toBe(true);
    expect(input.held('move-to')).toBe(false);
    expect(input.tapPosition.x).toBe(5);
    expect(input.tapPosition.y).toBe(10);

    input.update();

    expect(input.pressed('move-to')).toBe(false);
    expect(input.released('move-to')).toBe(false);
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

    expect(input.pressed('move-to')).toBe(true);
    expect(input.tapPosition.x).toBe(1.5);
    expect(input.tapPosition.y).toBe(2);

    input.update();

    expect(input.pressed('move-to')).toBe(false);
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

    expect(input.pressed('move-up')).toBe(false);
    expect(input.pressed('interact')).toBe(true);
    expect(input.held('interact')).toBe(false);

    press('KeyE');
    input.update();

    expect(input.pressed('interact')).toBe(true);
    expect(input.held('interact')).toBe(true);
    expect(input.released('interact')).toBe(false);
  });

  test('attach registers pointertap and nothing else on the view', () => {
    let {view} = createAttachedInput(TAP_BINDINGS);

    expect(Object.keys(view.handlers)).toEqual(['pointertap']);
    expect(view.handlers.pointertap).toHaveLength(1);
  });
});
