import {LayoutContainer} from '@pixi/layout/components';
import type * as pixi from 'pixi.js';

import {type Disposables} from '../utilities/Disposables.js';
import {type Focusable} from './Focusable.js';
import {adoptDetachedBackgrounds} from './internals/adoptDetachedBackgrounds.js';
import {attachWidgetInteraction} from './internals/attachWidgetInteraction.js';
import {resolveThemedBackgrounds} from './internals/resolveThemedBackgrounds.js';
import {setInteractionEnabled} from './internals/setInteractionEnabled.js';
import {swapBackground} from './internals/swapBackground.js';
import {type SliderConfig} from './SliderConfig.js';
import {type SliderOptions} from './SliderOptions.js';
import {type SliderParts} from './SliderParts.js';
import {type SliderRuntime} from './SliderRuntime.js';
import {type SliderState} from './SliderState.js';

export class Slider implements Focusable {
  /** View. */
  readonly view: LayoutContainer;

  /** Object for storing config. */
  readonly #config: SliderConfig;

  /** Stacks to register disposers that cleanup resources when needed. */
  readonly #disposables: Disposables<'instance'> = {instance: new DisposableStack()};

  /** Lifecycle hook called when the slider's value changes. */
  readonly #onChange?: (slider: Slider) => void;

  /** Object for keeping references to display objects or DOM elements. */
  readonly #parts: SliderParts;

  /** Object for internal values that may change. */
  readonly #runtime: SliderRuntime;

  /** State; which part of its life cycle the instance is currently in. */
  #state: SliderState = 'normal';

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

    // The track's size is part of the config, and it only exists once the
    // backgrounds are resolved, so this widget resolves them first.
    let resolved = resolveThemedBackgrounds(
      ['track', 'fill', 'hovered', 'disabled'],
      theme?.slider,
      backgrounds,
    );

    this.#config = {
      min,
      max,
      step,
      theme,
      trackWidth: resolved.track.width,
      trackHeight: resolved.track.height,
    };
    this.#parts = {
      fill: resolved.fill,
      trackBackgrounds: {
        normal: resolved.track,
        hovered: resolved.hovered,
        disabled: resolved.disabled,
      },
    };

    adoptDetachedBackgrounds(
      this.#disposables.instance,
      Object.values(this.#parts.trackBackgrounds),
    );

    this.view = new LayoutContainer({background: this.#parts.trackBackgrounds.normal});
    this.view.layout = {width: this.#config.trackWidth, height: this.#config.trackHeight};

    attachWidgetInteraction(this.view, {
      cursor: 'pointer',
      getState: () => this.#state,
      setState: (state) => {
        this.#state = state;

        swapBackground(this.view, this.#parts.trackBackgrounds[state]);
      },
    });

    // Deliberately NOT given a `layout` style: the fill is sized via setSize()
    // whenever the value changes, and a yoga node would double-apply that size. @pixi/layout
    // treats any ViewContainer as a leaf styled `{width: 'intrinsic'}`, resolves
    // 'intrinsic' as getLocalBounds().width * scale.x (so yoga's width becomes
    // the already-scaled visual width), then re-derives an offsetScale of
    // computedLayout.width / getLocalBounds().width against the *unscaled*
    // texture and composes the two multiplicatively — a 32 art-px fill would
    // render at 256. Positioning it directly (no yoga node) is the same shape
    // swapBackground/LayoutContainer use for a view's background child.
    this.#parts.fill.position.set(0, 0);
    this.view.addChild(this.#parts.fill);

    this.#runtime = {
      isDragging: false,
      value: snap(value, this.#config),
    };
    this.#parts.fill.setSize(
      fillWidth(this.#config.trackWidth, this.#runtime.value, this.#config),
      this.#config.trackHeight,
    );

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
      this.#runtime.isDragging = true;
      this.value = valueFromEvent(event, this.view, this.#config);
      this.#onChange?.(this);
    });

    this.view.on('globalpointermove', (event) => {
      if (!this.#runtime.isDragging) {
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
        this.#runtime.isDragging = false;

        return;
      }

      let next = valueFromEvent(event, this.view, this.#config);

      if (next === this.#runtime.value) {
        return;
      }

      this.value = next;
      this.#onChange?.(this);
    });

    // Registered as thin wrappers (rather than one shared local closure) so
    // each stays a direct call argument — the same shape as the handlers
    // above — since a named local reused across listeners loses that and
    // gets flagged by unicorn/consistent-function-scoping. pointercancel is
    // included defensively even though Pixi does not currently dispatch it
    // (see the globalpointermove comment above) — cheap insurance in case
    // that ever changes.
    this.view.on('pointerup', () => {
      this.#runtime.isDragging = false;
    });
    this.view.on('pointerupoutside', () => {
      this.#runtime.isDragging = false;
    });
    this.view.on('pointercancel', () => {
      this.#runtime.isDragging = false;
    });

    this.#disposables.instance.defer(() => this.view.destroy({children: true}));
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
    return this.#runtime.value;
  }

  set value(value: number) {
    this.#runtime.value = snap(value, this.#config);
    this.#parts.fill.setSize(
      fillWidth(this.#config.trackWidth, this.#runtime.value, this.#config),
      this.#config.trackHeight,
    );
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

    this.value = this.#runtime.value - this.#config.step;
    this.#onChange?.(this);
  }

  /** Destroys the instance. */
  destroy() {
    this.#disposables.instance.dispose();
  }

  /** TBD */
  disable() {
    if (this.#state === 'disabled') {
      return;
    }

    this.#runtime.isDragging = false;
    this.#state = 'disabled';

    swapBackground(this.view, this.#parts.trackBackgrounds.disabled);

    setInteractionEnabled(this.view, false);
  }

  /** TBD */
  enable() {
    if (this.#state !== 'disabled') {
      return;
    }

    this.#state = 'normal';

    swapBackground(this.view, this.#parts.trackBackgrounds.normal);

    setInteractionEnabled(this.view, true, 'pointer');
  }

  /** TBD */
  increase() {
    if (this.#state === 'disabled') {
      return;
    }

    this.value = this.#runtime.value + this.#config.step;
    this.#onChange?.(this);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fillWidth(
  trackWidth: number,
  value: number,
  {min, max}: {min: number; max: number},
): number {
  return trackWidth * (max === min ? 0 : (value - min) / (max - min));
}

function snap(value: number, {min, max, step}: {min: number; max: number; step: number}): number {
  let steps = Math.round((value - min) / step);

  return clamp(min + steps * step, min, max);
}

function valueFromEvent(
  event: pixi.FederatedPointerEvent,
  view: LayoutContainer,
  {trackWidth, min, max, step}: {trackWidth: number; min: number; max: number; step: number},
): number {
  let local = event.getLocalPosition(view);
  let ratio = trackWidth === 0 ? 0 : local.x / trackWidth;

  return snap(min + ratio * (max - min), {min, max, step});
}
