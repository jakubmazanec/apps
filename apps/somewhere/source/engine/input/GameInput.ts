import type * as pixi from 'pixi.js';

import {type FocusCommand} from '../app/FocusCommand.js';
import {isTextEntryTarget} from '../ui/isTextEntryTarget.js';
import {Vector} from '../utilities/Vector.js';
import {type GameInputOptions} from './GameInputOptions.js';

// Modifier name to the pair of KeyboardEvent.code values that produce it.
// Modifier state is read from the down-set itself, so no separate tracking
// exists: these codes are recorded even when nothing binds them.
const MODIFIER_CODES = {
  Shift: ['ShiftLeft', 'ShiftRight'],
  Ctrl: ['ControlLeft', 'ControlRight'],
  Alt: ['AltLeft', 'AltRight'],
  Meta: ['MetaLeft', 'MetaRight'],
} as const;
// Canonical prefix order, so 'Ctrl+Shift+KeyS' and 'Shift+Ctrl+KeyS' are one
// binding and cannot be bound twice.
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

type Modifier = keyof typeof MODIFIER_CODES;

type ParsedKey = {
  canonical: string;
  code: string;
  modifiers: Modifier[];
};

function parseKey(key: string, action: string): ParsedKey {
  let parts = key.split('+');
  let code = parts.pop() ?? '';

  if (code === '') {
    throw new Error(`Invalid key "${key}" for action "${action}": no key code!`);
  }

  let modifiers: Modifier[] = [];

  for (let part of parts) {
    if (!(part in MODIFIER_CODES)) {
      throw new Error(
        `Invalid modifier "${part}" in key "${key}" for action "${action}": bindings take Shift, Ctrl, Alt or Meta!`,
      );
    }

    if (!modifiers.includes(part as Modifier)) {
      modifiers.push(part as Modifier);
    }
  }

  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));

  return {canonical: [...modifiers, code].join('+'), code, modifiers};
}

function isModifierDown(modifier: Modifier, codes: ReadonlySet<string>): boolean {
  return MODIFIER_CODES[modifier].some((code) => codes.has(code));
}

export type InputBinding = {
  /**
   * `KeyboardEvent.code` values, each optionally prefixed with `Shift+`, `Ctrl+`, `Alt+` or
   * `Meta+`.
   */
  keys?: string[];

  /** Bound to pixi `pointertap` on the attached view. */
  pointerTap?: boolean;
};

/**
 * Action map from devices to per-frame polled state. Listeners accumulate raw
 * device state between frames; `update()` is the step boundary that snapshots
 * it (the same double-buffer flip as `EventChannel.swap()`). Reads diff the
 * snapshots, so they are stable for the whole step.
 */
export class GameInput {
  /** TBD */
  readonly #bindings: ReadonlyMap<string, ParsedKey[]>;

  // Key equivalent of the tap buffer: codes seen down since the last step, and
  // the per-step latch for those that were already released by the time the
  // step arrived. Like a tap, such a key is pressed and released on its step
  // and never held.
  /** TBD */
  readonly #bufferedDownCodes = new Set<string>();

  /** TBD */
  readonly #bufferedTapPosition = new Vector(0, 0);

  // Double-buffered snapshots, flipped once per step by `update()`; reads diff
  // these, never `#downCodes`.
  /** TBD */
  #currentCodes = new Set<string>();

  /** Stack to register disposers that cleanup resources when needed. */
  #disposables = new DisposableStack();

  /** Live set mutated by listeners; may change at any moment between steps. */
  readonly #downCodes = new Set<string>();

  /** TBD */
  readonly #focus: ReadonlyMap<FocusCommand, ParsedKey[]>;

  // Tap buffer (written by the listener, position stored by copy) and the
  // per-step latch `update()` drains it into. The latch never enters the
  // down-set: a tap is pressed+released on its step and never held.
  /** TBD */
  #hasBufferedTap = false;

  /** TBD */
  #isTapLatched = false;

  // Prefixed variants bound anywhere in the table, keyed by base code: a bare
  // key is suppressed for a frame while one of its siblings matches.
  /** TBD */
  readonly #prefixedByCode: ReadonlyMap<string, Modifier[][]>;

  /** TBD */
  #previousCodes = new Set<string>();

  /** TBD */
  readonly #tapActions: ReadonlySet<string>;

  /** TBD */
  readonly #tappedCodes = new Set<string>();

  /** TBD */
  readonly #tapPosition = new Vector(0, 0);

  /** TBD */
  #view: pixi.Container | null = null;

  constructor({focus = {}, actions = {}}: GameInputOptions) {
    let parsedFocus = new Map<FocusCommand, ParsedKey[]>();
    let parsed = new Map<string, ParsedKey[]>();
    let tapActions = new Set<string>();
    let prefixedByCode = new Map<string, Modifier[][]>();
    let owners = new Map<string, string>();
    let register = (name: string, binding: InputBinding): ParsedKey[] => {
      let keys = (binding.keys ?? []).map((key) => parseKey(key, name));

      for (let key of keys) {
        let owner = owners.get(key.canonical);

        if (owner !== undefined) {
          throw new Error(
            `Key "${key.canonical}" is bound to both "${owner}" and "${name}": each key drives exactly one action!`,
          );
        }

        owners.set(key.canonical, name);

        if (key.modifiers.length > 0) {
          prefixedByCode.set(key.code, [...(prefixedByCode.get(key.code) ?? []), key.modifiers]);
        }
      }

      return keys;
    };

    for (let [command, binding] of Object.entries(focus) as Array<[FocusCommand, InputBinding]>) {
      parsedFocus.set(command, register(command, binding));
    }

    for (let [action, binding] of Object.entries(actions)) {
      parsed.set(action, register(action, binding));

      if (binding.pointerTap === true) {
        tapActions.add(action);
      }
    }

    this.#focus = parsedFocus;
    this.#bindings = parsed;
    this.#tapActions = tapActions;
    this.#prefixedByCode = prefixedByCode;
  }

  /**
   * Position of the last latched tap, in view-local coordinates (art px — the
   * root pixelScale transform is already divided out). Changes only at the
   * step boundary, so a pointer move between the tap and the next `update()`
   * cannot retarget it.
   */
  get tapPosition(): Vector {
    return this.#tapPosition;
  }

  /** TBD */
  attach(view: pixi.Container): void {
    if (this.#view) {
      throw new Error('GameInput is already attached!');
    }

    this.#view = view;
    this.#disposables.dispose();

    this.#disposables = new DisposableStack();

    // eslint-disable-next-line unicorn/consistent-function-scoping -- false positive
    let handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEntryTarget(event)) {
        return;
      }

      // The canvas owns the keyboard: every key outside text entry is the
      // game's, so no browser default competes with a binding and modifier
      // codes are recorded without a special case (they are the modifier
      // state the matcher reads).
      event.preventDefault();

      // A code already down is an OS auto-repeat, not a new press: buffering it
      // would latch a sub-frame tap when the last repeat and the keyup share a
      // frame gap, firing a second edge as the key comes up.
      if (!this.#downCodes.has(event.code)) {
        this.#bufferedDownCodes.add(event.code);
      }

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
      // The buffer goes with it, as in detach: a key pressed in the gap the
      // blur lands in must not latch an edge for an unfocused window.
      this.#bufferedDownCodes.clear();
    };
    let handlePointerTap = (event: pixi.FederatedPointerEvent) => {
      // Multiple taps in one frame collapse to one, last position wins. Copy
      // the position: pixi reuses federated event objects after handlers return.
      let local = event.getLocalPosition(view);

      this.#hasBufferedTap = true;
      this.#bufferedTapPosition.set(local.x, local.y);
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

  /** TBD */
  detach(): void {
    if (!this.#view) {
      throw new Error('GameInput is not attached!');
    }

    this.#disposables.dispose();
    this.#view = null;

    // The next attach starts clean: nothing carries over between sessions.
    this.#downCodes.clear();
    this.#currentCodes.clear();
    this.#previousCodes.clear();
    this.#hasBufferedTap = false;
    this.#isTapLatched = false;
    this.#bufferedDownCodes.clear();
    this.#tappedCodes.clear();
  }

  /**
   * Whether a focus command went down this step, a key latched inside one
   * frame included. Unbound commands read false, so a game may omit any of
   * them; `Game` is the only caller.
   */
  focusPressed(command: FocusCommand): boolean {
    let keys = this.#focus.get(command) ?? [];

    return (
      (keys.some((key) => this.#matches(key, this.#currentCodes)) &&
        !keys.some((key) => this.#matches(key, this.#previousCodes))) ||
      this.#isKeyTapped(keys)
    );
  }

  /** Whether the action is down now. */
  held(action: string): boolean {
    return this.#isDown(action, this.#currentCodes);
  }

  /**
   * Whether the action went down this step. A pointer tap, and a key pressed
   * and released inside one frame, both count on the step they latch.
   */
  pressed(action: string): boolean {
    return (
      (this.#isDown(action, this.#currentCodes) && !this.#isDown(action, this.#previousCodes)) ||
      this.#isTapped(action) ||
      this.#isKeyTapped(this.#getKeys(action))
    );
  }

  /**
   * Whether the action went up this step. A pointer tap, and a key pressed and
   * released inside one frame, both count on the step they latch.
   */
  released(action: string): boolean {
    return (
      (!this.#isDown(action, this.#currentCodes) && this.#isDown(action, this.#previousCodes)) ||
      this.#isTapped(action) ||
      this.#isKeyTapped(this.#getKeys(action))
    );
  }

  /** @internal Called by `Game` once per render frame; one call = one latch step. */
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

    // Drain the key buffer: a code that is no longer down was pressed and
    // released inside one frame, so its edge exists only here.
    this.#tappedCodes.clear();

    for (let code of this.#bufferedDownCodes) {
      if (!this.#downCodes.has(code)) {
        this.#tappedCodes.add(code);
      }
    }

    this.#bufferedDownCodes.clear();
  }

  /** TBD */
  #getKeys(action: string): ParsedKey[] {
    let keys = this.#bindings.get(action);

    if (!keys) {
      throw new Error(`Unknown action "${action}"!`);
    }

    return keys;
  }

  /** TBD */
  #isDown(action: string, codes: ReadonlySet<string>): boolean {
    return this.#getKeys(action).some((key) => this.#matches(key, codes));
  }

  /** TBD */
  #isKeyTapped(keys: ParsedKey[]): boolean {
    if (this.#tappedCodes.size === 0) {
      return false;
    }

    // A tapped code is absent from the snapshot (it was released before the
    // step arrived), so the matcher reads the union of the two. That way the
    // specificity rule applies here exactly as it does to an ordinary read,
    // and one physical tap still drives one action.
    let codes = new Set([...this.#currentCodes, ...this.#tappedCodes]);

    return keys.some((key) => this.#tappedCodes.has(key.code) && this.#matches(key, codes));
  }

  /** TBD */
  #isTapped(action: string): boolean {
    // Reads validate the action name even when only a tap is bound.
    this.#getKeys(action);

    return this.#tapActions.has(action) && this.#isTapLatched;
  }

  /** TBD */
  #matches(key: ParsedKey, codes: ReadonlySet<string>): boolean {
    if (!codes.has(key.code)) {
      return false;
    }

    if (!key.modifiers.every((modifier) => isModifierDown(modifier, codes))) {
      return false;
    }

    // Specificity: while a prefixed sibling matches, the bare key stands down,
    // so Shift+Tab fires `previous` without also firing `next`.
    return (
      key.modifiers.length > 0 ||
      !(this.#prefixedByCode.get(key.code) ?? []).some((modifiers) =>
        modifiers.every((modifier) => isModifierDown(modifier, codes)),
      )
    );
  }
}
