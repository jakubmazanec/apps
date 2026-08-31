import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {adoptDetachedBackgrounds} from './adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './attachWidgetInteraction.js';
import {type Focusable} from './Focusable.js';
import {resolveBackgrounds} from './resolveBackgrounds.js';
import {resolveThemedBackgrounds} from './resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './setInteractionEnabled.js';
import {swapBackground} from './swapBackground.js';
import {type ThemedOptions} from './UiTheme.js';

export type SliderState = 'disabled' | 'hovered' | 'normal';

export type SliderBackgrounds = {
  track: pixi.Container;
  fill: pixi.Container;
  hovered?: pixi.Container;
  disabled?: pixi.Container;
};

export type SliderOptions = ThemedOptions<SliderBackgrounds> & {
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  // Fires on every value change, including each pointermove tick of a drag
  // and each keyboard increase()/decrease() step. Slider has no notion of a
  // separate "finalized" change to report — a consumer that only cares about
  // the settled value (e.g. debouncing a slow write) owns that distinction
  // itself, by debouncing onChange in userland.
  onChange?: (slider: Slider) => void;
};

export class Slider implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Stack to register disposers that cleanup resources when needed. */
  readonly #disposables = new DisposableStack();

  /** TBD */
  readonly #fill: pixi.Container;

  /** TBD */
  #isDragging = false;

  /** TBD */
  readonly #max: number;

  /** TBD */
  readonly #min: number;

  /** Lifecycle hook called when the slider's value changes. */
  readonly #onChange?: (slider: Slider) => void;

  /** State; which part of its life cycle the instance is currently in. */
  #state: SliderState = 'normal';

  /** TBD */
  readonly #step: number;

  /** TBD */
  readonly #trackBackgrounds: Record<SliderState, pixi.Container>;

  /** TBD */
  readonly #trackHeight: number;

  /** TBD */
  readonly #trackWidth: number;

  /** TBD */
  #value: number;

  constructor({
    backgrounds,
    theme,
    min = 0,
    max = 1,
    step = 0.1,
    value = min,
    onChange,
  }: SliderOptions) {
    if (onChange !== undefined) {
      this.#onChange = onChange;
    }

    this.#min = min;
    this.#max = max;
    this.#step = step;

    let resolved = resolveThemedBackgrounds(
      ['track', 'fill', 'hovered', 'disabled'],
      theme?.slider,
      backgrounds,
    );

    if (resolved.track === undefined || resolved.fill === undefined) {
      // Unreachable through ThemedOptions, which requires one source or the other.
      throw new Error('Slider needs a theme or track and fill backgrounds!');
    }

    this.#trackBackgrounds = resolveBackgrounds(['normal', 'hovered', 'disabled'], resolved.track, {
      hovered: resolved.hovered,
      disabled: resolved.disabled,
    });

    adoptDetachedBackgrounds(this.#disposables, Object.values(this.#trackBackgrounds));

    this.#trackWidth = resolved.track.width;
    this.#trackHeight = resolved.track.height;

    this.view = new LayoutContainer({background: this.#trackBackgrounds.normal});
    this.view.layout = {width: this.#trackWidth, height: this.#trackHeight};

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => this.#setState(state),
    });

    this.#fill = resolved.fill;
    // Deliberately NOT given a `layout` style: the fill is sized by #updateFill
    // via setSize(), and a yoga node would double-apply that size. @pixi/layout
    // treats any ViewContainer as a leaf styled `{width: 'intrinsic'}`, resolves
    // 'intrinsic' as getLocalBounds().width * scale.x (so yoga's width becomes
    // the already-scaled visual width), then re-derives an offsetScale of
    // computedLayout.width / getLocalBounds().width against the *unscaled*
    // texture and composes the two multiplicatively — a 32 art-px fill would
    // render at 256. Positioning it directly (no yoga node) is the same shape
    // swapBackground/LayoutContainer use for a view's background child.
    this.#fill.position.set(0, 0);
    this.view.addChild(this.#fill);

    this.#value = this.#snap(value);
    this.#updateFill();

    this.view.on('pointerdown', (event) => {
      if (this.#state === 'disabled') {
        return;
      }

      // `button` (which button caused this event) rather than `buttons` (the
      // bitmask of those currently held, which the untracked-drag guard below
      // needs instead): only a primary press may start a drag, so a secondary
      // press — and the right-drag that would otherwise follow it, since
      // `buttons === 2` passes that guard's `!== 0` check — leaves the value
      // alone and stays available for a context menu.
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      this.#isDragging = true;
      this.#setValue(this.#valueFromEvent(event));
      this.#onChange?.(this);
    });

    this.view.on('globalpointermove', (event) => {
      if (!this.#isDragging) {
        return;
      }

      // Pixi has no pointercancel mapping and no DOM pointercancel/touchcancel
      // listener (EventBoundary only wires up down/move/out/leave/over/up/
      // upoutside/wheel), so a button release outside the window/tab (or a
      // touch the browser takes over for scrolling) never reaches pointerup
      // or pointerupoutside. globalpointermove still fires for any later
      // pointer movement anywhere on the page, so without this check the
      // drag would stay latched and keep setting the value with no button
      // held. `buttons === 0` catches that: no button is down, so the drag
      // must already be over even though we never got an end event for it.
      if (event.buttons === 0) {
        this.#endDrag();

        return;
      }

      let next = this.#valueFromEvent(event);

      if (next === this.#value) {
        return;
      }

      this.#setValue(next);
      this.#onChange?.(this);
    });

    // Registered as thin wrappers (rather than one shared local closure) so
    // each stays a direct call argument — the same shape as the handlers
    // above — since a named local reused across listeners loses that and
    // gets flagged by unicorn/consistent-function-scoping. pointercancel is
    // included defensively even though Pixi does not currently dispatch it
    // (see the globalpointermove comment above) — cheap insurance in case
    // that ever changes.
    this.view.on('pointerup', () => this.#endDrag());
    this.view.on('pointerupoutside', () => this.#endDrag());
    this.view.on('pointercancel', () => this.#endDrag());

    this.#disposables.defer(() => this.view.destroy({children: true}));
  }

  /** TBD */
  get isDisabled(): boolean {
    return this.#state === 'disabled';
  }

  /** TBD */
  get isFocusable(): boolean {
    return this.#state !== 'disabled';
  }

  /** TBD */
  get state(): SliderState {
    return this.#state;
  }

  /** TBD */
  get value(): number {
    return this.#value;
  }

  // No single equivalent action for a continuously-variable value —
  // increase()/decrease() own the discrete steps instead.
  /** TBD */
  activate() {}

  /** TBD */
  decrease() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setValue(this.#snap(this.#value - this.#step));
    this.#onChange?.(this);
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#endDrag();
    this.#setState('disabled');

    setInteractionEnabled(this.view, false);
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#setState('normal');

    setInteractionEnabled(this.view, true, 'pointer');
  }

  /** TBD */
  increase() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#setValue(this.#snap(this.#value + this.#step));
    this.#onChange?.(this);
  }

  /** TBD */
  #clamp(value: number): number {
    return Math.min(this.#max, Math.max(this.#min, value));
  }

  // Only clears the latch. Kept as its own method (rather than inlined at each
  // call site) because every way a drag can end routes through it: the
  // pointerup and pointerupoutside listeners, the defensive pointercancel
  // listener, the buttons-check inside globalpointermove, and disable().
  /** TBD */
  #endDrag() {
    this.#isDragging = false;
  }

  /** TBD */
  #setState(state: SliderState) {
    if (this.#state === state) {
      return;
    }

    this.#state = state;

    swapBackground(this.view, this.#trackBackgrounds[state]);
  }

  /** TBD */
  #setValue(value: number) {
    this.#value = value;
    this.#updateFill();
  }

  /** TBD */
  #snap(value: number): number {
    let steps = Math.round((value - this.#min) / this.#step);

    return this.#clamp(this.#min + steps * this.#step);
  }

  /** TBD */
  #updateFill() {
    let ratio = this.#max === this.#min ? 0 : (this.#value - this.#min) / (this.#max - this.#min);

    this.#fill.setSize(this.#trackWidth * ratio, this.#trackHeight);
  }

  /** TBD */
  #valueFromEvent(event: pixi.FederatedPointerEvent): number {
    let local = event.getLocalPosition(this.view);
    let ratio = this.#trackWidth === 0 ? 0 : local.x / this.#trackWidth;

    return this.#snap(this.#min + ratio * (this.#max - this.#min));
  }
}
