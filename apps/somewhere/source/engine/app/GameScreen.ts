import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

import {Scheduler} from '../scheduler/Scheduler.js';
import {type UiFocusEvent, UiRoot, type UiRootOptions} from '../ui/UiRoot.js';
import {type AnyGameScreen} from './AnyGameScreen.js';
import {type Game} from './Game.js';
import {type GameScreenOptions} from './GameScreenOptions.js';
import {type GameScreenState} from './GameScreenState.js';
import {type Renderable} from './Renderable.js';

export class GameScreen<
  T = undefined,
  Events extends EventEmitter.ValidEventTypes = Record<never, never>,
> {
  /** TBD */
  readonly assetBundles: string[];

  // Whatever `onAttach` built and the screen keeps for its lifetime: retained widget handles,
  // mutable slots, disposables. Not the pixi display list — `view` is that — and not a state
  // machine tag; `state` below is.
  /** TBD */
  contents!: T;

  /** TBD */
  readonly scheduler = new Scheduler();

  /** TBD */
  readonly view: pixi.Container = new pixi.Container();

  // Engine teardown idiom (DisposableStack + defer), like Game/Button/UiRoot. Unlike those
  // one-shot stacks it is reset on each hide so the screen can re-subscribe on the next show;
  // a DisposableStack cannot be reused after disposal.
  /** TBD */
  #disposables = new DisposableStack();

  /** TBD */
  readonly #events?: EventEmitter<Events>;

  /** TBD */
  #game: Game | null = null;

  /** TBD */
  readonly #onAttach?: (screen: AnyGameScreen, game: Game) => T;

  /** TBD */
  readonly #onCancel?: (screen: AnyGameScreen, game: Game) => void;

  /** TBD */
  readonly #onFocusEvent?: (event: UiFocusEvent) => void;

  /** TBD */
  readonly #onHide?: (screen: AnyGameScreen, game: Game) => Promise<void> | void;

  /** TBD */
  readonly #onResize?: (screen: AnyGameScreen, game: Game) => void;

  /** TBD */
  readonly #onShow?: (screen: AnyGameScreen, game: Game) => Promise<void> | void;

  /** TBD */
  readonly #onUpdate?: (ticker: pixi.Ticker, screen: AnyGameScreen, game: Game) => void;

  // Lifecycle tag, the same idiom as Game/World/Modal. Also what makes hide() idempotent:
  // onHide side effects (e.g. world.stop()) must not run twice when an already-hidden screen
  // is hidden again.
  /** TBD */
  #state: GameScreenState = 'created';

  /** TBD */
  #ui: UiRoot | null = null;

  constructor({
    assetBundles = [],
    events,
    onAttach,
    onFocusEvent,
    onShow,
    onHide,
    onUpdate,
    onResize,
    onCancel,
  }: GameScreenOptions<T, Events>) {
    this.assetBundles = assetBundles;

    if (events !== undefined) {
      this.#events = events;
    }

    if (onFocusEvent !== undefined) {
      this.#onFocusEvent = onFocusEvent;
    }

    if (onAttach !== undefined) {
      this.#onAttach = onAttach;
    }

    if (onShow !== undefined) {
      this.#onShow = onShow;
    }

    if (onHide !== undefined) {
      this.#onHide = onHide;
    }

    if (onUpdate !== undefined) {
      this.#onUpdate = onUpdate;
    }

    if (onResize !== undefined) {
      this.#onResize = onResize;
    }

    if (onCancel !== undefined) {
      this.#onCancel = onCancel;
    }
  }

  /** TBD */
  get game(): Game {
    if (!this.#game) {
      throw new Error('Screen is not attached to a game!');
    }

    return this.#game;
  }

  /** TBD */
  get state(): GameScreenState {
    return this.#state;
  }

  /** TBD */
  get ui(): UiRoot {
    if (!this.#ui) {
      throw new Error('UI is not created on the screen!');
    }

    return this.#ui;
  }

  /** TBD */
  addToView(renderable: Renderable) {
    this.view.addChild(renderable.view);
    this.view.setChildIndex(this.ui.view, this.view.children.length - 1);
    this.game.app.ticker.add(renderable.update, renderable);
  }

  /** TBD */
  attach(game: Game) {
    if (this.#state !== 'created') {
      throw new Error('Screen is already attached to a game!');
    }

    this.#game = game;
    this.#state = 'attached';

    let uiRootOptions: UiRootOptions = {theme: game.theme};

    if (this.#onFocusEvent !== undefined) {
      uiRootOptions.onFocusEvent = this.#onFocusEvent;
    }

    this.#ui = new UiRoot(uiRootOptions);
    this.view.addChild(this.#ui.view);
    this.contents = this.#onAttach?.(this, game) as T;
  }

  /** TBD */
  cancel() {
    this.#onCancel?.(this, this.game);
  }

  /** TBD */
  destroy() {
    this.#disposables.dispose();
    this.ui.destroy();
    this.view.destroy({children: true});
  }

  /** TBD */
  async hide() {
    // No-op unless shown: a double hide (or a hide before any show) must not
    // dispose anything or re-run onHide side effects.
    if (this.#state !== 'shown') {
      return;
    }

    this.#state = 'attached';

    this.ui.clearFocus();

    this.#disposables.dispose();
    this.#disposables = new DisposableStack();

    await this.#onHide?.(this, this.game);
  }

  /** TBD */
  removeFromView(renderable: Renderable) {
    this.view.removeChild(renderable.view);
    this.game.app.ticker.remove(renderable.update, renderable);
  }

  /** TBD */
  resize() {
    this.#onResize?.(this, this.game);
  }

  /** TBD */
  async show() {
    if (this.#state !== 'attached') {
      throw new Error(
        `Screen can't be shown, it must be in "attached" state (currently state is "${this.#state}")!`,
      );
    }

    this.#state = 'shown';

    // Register scheduler teardown on the (per-hide) disposables stack; re-armed each show because
    // hide() disposes and replaces the stack. A single dispose() then cancels in-flight tweens/timers.
    this.#disposables.defer(() => this.scheduler.clear());
    await this.#onShow?.(this, this.game);
  }

  /** TBD */
  subscribe<E extends EventEmitter.EventNames<Events>>(
    event: E,
    handler: EventEmitter.EventListener<Events, E>,
  ): this {
    this.#events?.on(event, handler);
    this.#disposables.defer(() => {
      this.#events?.off(event, handler);
    });

    return this;
  }

  /** TBD */
  update(ticker: pixi.Ticker) {
    this.scheduler.update(ticker);
    this.ui.update();
    this.#onUpdate?.(ticker, this, this.game);
  }
}
