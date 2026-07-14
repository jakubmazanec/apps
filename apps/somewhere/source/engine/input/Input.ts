import type * as pixi from 'pixi.js';

import {isTextEntryTarget} from '../ui/isTextEntryTarget.js';
import {Vector} from '../utilities/Vector.js';

export type InputBinding = {
  /** `KeyboardEvent.code` values; no modifier syntax (Shift itself can be an action). */
  keys?: string[];
  /** Bound to pixi `pointertap` on the attached view. */
  pointerTap?: boolean;
};

export type InputOptions = {
  bindings: Record<string, InputBinding>;
};

/**
 * Action map from devices to per-frame polled state. Listeners accumulate raw
 * device state between frames; `update()` is the step boundary that snapshots
 * it (the same double-buffer flip as `EventChannel.swap()`). Reads diff the
 * snapshots, so they are stable for the whole step.
 */
export class Input {
  readonly #bindings: ReadonlyMap<string, InputBinding>;
  readonly #boundCodes: ReadonlySet<string>;

  /** Live set mutated by listeners; may change at any moment between steps. */
  readonly #downCodes = new Set<string>();

  // Double-buffered snapshots, flipped once per step by `update()`; reads diff
  // these, never `#downCodes`.
  #currentCodes = new Set<string>();
  #previousCodes = new Set<string>();

  // Tap buffer (written by the listener, position stored by copy) and the
  // per-step latch `update()` drains it into. The latch never enters the
  // down-set: a tap is pressed+released on its step and never held.
  #hasBufferedTap = false;
  readonly #bufferedTapPosition = new Vector(0, 0);
  #isTapLatched = false;
  readonly #tapPosition = new Vector(0, 0);

  #view: pixi.Container | null = null;
  #disposables = new DisposableStack();

  constructor({bindings}: InputOptions) {
    let boundCodes = new Set<string>();

    for (let [action, binding] of Object.entries(bindings)) {
      for (let code of binding.keys ?? []) {
        if (code.includes('+')) {
          throw new Error(
            `Invalid key code "${code}" for action "${action}": bindings take bare KeyboardEvent.code values, not the focusKeys "Shift+" grammar — bind the modifier's own code (e.g. "ShiftLeft") instead!`,
          );
        }

        boundCodes.add(code);
      }
    }

    this.#bindings = new Map(Object.entries(bindings));
    this.#boundCodes = boundCodes;
  }

  /**
   * Position of the last latched tap, in view coordinates (device px). Changes
   * only at the step boundary, so a pointer move between the tap and the next
   * `update()` cannot retarget it.
   */
  get tapPosition(): Vector {
    return this.#tapPosition;
  }

  attach(view: pixi.Container): void {
    if (this.#view) {
      throw new Error('Input is already attached!');
    }

    this.#view = view;
    this.#disposables = new DisposableStack();

    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event)) {
        return;
      }

      if (!this.#boundCodes.has(event.code)) {
        return;
      }

      // Shared convention with the focus layer: only bound codes are consumed.
      event.preventDefault();
      this.#downCodes.add(event.code);
    };

    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleKeyUp = (event: KeyboardEvent) => {
      // No text-entry guard here: an unconditional delete is strictly safer (a
      // delete of an absent code is a no-op) and prevents a stuck key when focus
      // moves to a text-entry element between a key's keydown and keyup — an
      // intra-window focus change fires no window `blur` to clear the down-set.
      this.#downCodes.delete(event.code);
    };

    // Keys released while the window is unfocused never send a keyup; clearing
    // here turns them into released edges on the next step instead of stuck keys.
    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleBlur = () => {
      this.#downCodes.clear();
    };

    let handlePointerTap = (event: pixi.FederatedPointerEvent) => {
      // Multiple taps in one frame collapse to one, last position wins. Copy
      // the position: pixi reuses federated event objects after handlers return.
      this.#hasBufferedTap = true;
      this.#bufferedTapPosition.set(event.global.x, event.global.y);
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('keyup', handleKeyUp);
    globalThis.addEventListener('blur', handleBlur);
    view.on('pointertap', handlePointerTap);

    this.#disposables.defer(() => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('keyup', handleKeyUp);
      globalThis.removeEventListener('blur', handleBlur);
      view.off('pointertap', handlePointerTap);
    });
  }

  detach(): void {
    if (!this.#view) {
      throw new Error('Input is not attached!');
    }

    this.#disposables.dispose();
    this.#view = null;

    // The next attach starts clean: nothing carries over between sessions.
    this.#downCodes.clear();
    this.#currentCodes.clear();
    this.#previousCodes.clear();
    this.#hasBufferedTap = false;
    this.#isTapLatched = false;
  }

  /** @internal Called by `inputSystem` once per world update; one call = one sim step. */
  update(): void {
    // Flip the double buffer, reusing the retired set — no per-step allocation.
    let recycled = this.#previousCodes;

    this.#previousCodes = this.#currentCodes;
    recycled.clear();

    for (let code of this.#downCodes) {
      recycled.add(code);
    }

    this.#currentCodes = recycled;

    // Drain the tap buffer into the per-step latch.
    this.#isTapLatched = this.#hasBufferedTap;

    if (this.#hasBufferedTap) {
      this.#tapPosition.set(this.#bufferedTapPosition.x, this.#bufferedTapPosition.y);
      this.#hasBufferedTap = false;
    }
  }

  /** Whether the action went down this step. A tap counts on the step it latches. */
  pressed(action: string): boolean {
    let binding = this.#getBinding(action);

    return (
      (this.#isDown(binding, this.#currentCodes) && !this.#isDown(binding, this.#previousCodes)) ||
      this.#isTapped(binding)
    );
  }

  /** Whether the action is down now. */
  held(action: string): boolean {
    return this.#isDown(this.#getBinding(action), this.#currentCodes);
  }

  /** Whether the action went up this step. A tap counts on the step it latches. */
  released(action: string): boolean {
    let binding = this.#getBinding(action);

    return (
      (!this.#isDown(binding, this.#currentCodes) && this.#isDown(binding, this.#previousCodes)) ||
      this.#isTapped(binding)
    );
  }

  #getBinding(action: string): InputBinding {
    let binding = this.#bindings.get(action);

    if (!binding) {
      throw new Error(`Unknown action "${action}"!`);
    }

    return binding;
  }

  #isDown(binding: InputBinding, codes: ReadonlySet<string>): boolean {
    return (binding.keys ?? []).some((code) => codes.has(code));
  }

  #isTapped(binding: InputBinding): boolean {
    return binding.pointerTap === true && this.#isTapLatched;
  }
}
