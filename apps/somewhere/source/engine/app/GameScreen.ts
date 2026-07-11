import {type EventEmitter} from 'eventemitter3';
import * as pixi from 'pixi.js';

import {Scheduler} from '../scheduler/Scheduler.js';
import {type FocusRingOptions, UiRoot} from '../ui/UiRoot.js';
import {type Game} from './Game.js';

export type Renderable = {
  view: pixi.Container;
  update: (ticker: pixi.Ticker) => void;
};

export type GameScreenOptions<T, E extends EventEmitter.ValidEventTypes = Record<never, never>> = {
  assetBundles?: string[] | undefined;
  events?: EventEmitter<E> | undefined;
  focusRing?: FocusRingOptions | undefined;
  onShow?: ((screen: GameScreen<T, E>, game: Game) => Promise<void> | void) | undefined;
  onHide?: ((screen: GameScreen<T, E>, game: Game) => Promise<void> | void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, screen: GameScreen<T, E>, game: Game) => void) | undefined;
  onResize?: ((screen: GameScreen<T, E>, game: Game) => void) | undefined;
} & (undefined extends T ? {onAdd?: ((screen: GameScreen<T, E>, game: Game) => T) | undefined}
: {onAdd: (screen: GameScreen<T, E>, game: Game) => T});

export class GameScreen<
  T = undefined,
  Events extends EventEmitter.ValidEventTypes = Record<never, never>,
> {
  #game: Game | null = null;
  // Created eagerly in `setGame` (when the screen is wired into a game); present for the whole active lifetime.
  #ui!: UiRoot;
  readonly #events?: EventEmitter<Events>;
  readonly #focusRing?: FocusRingOptions;
  // Engine teardown idiom (DisposableStack + defer), like Game/Button/UiRoot. Unlike those
  // one-shot stacks it is reset on each hide so the screen can re-subscribe on the next show;
  // a DisposableStack cannot be reused after disposal.
  #disposables = new DisposableStack();
  // Makes hide() idempotent: onHide side effects (e.g. world.stop()) must not
  // run twice when an already-hidden screen is hidden again.
  #isShown = false;

  readonly assetBundles: string[];
  readonly view: pixi.Container = new pixi.Container();
  readonly scheduler = new Scheduler();
  state!: T; // TODO: maybe model this like in @jakubmazanec/carson's Workspace.packageJson, which can be null based on a type parameter

  readonly #onAdd?: (screen: GameScreen<T, Events>, game: Game) => T;
  readonly #onShow?: (screen: GameScreen<T, Events>, game: Game) => Promise<void> | void;
  readonly #onHide?: (screen: GameScreen<T, Events>, game: Game) => Promise<void> | void;
  readonly #onUpdate?: (ticker: pixi.Ticker, screen: GameScreen<T, Events>, game: Game) => void;
  readonly #onResize?: (screen: GameScreen<T, Events>, game: Game) => void;

  constructor({
    assetBundles = [],
    events,
    focusRing,
    onAdd,
    onShow,
    onHide,
    onUpdate,
    onResize,
  }: GameScreenOptions<T, Events>) {
    this.assetBundles = assetBundles;

    if (events !== undefined) {
      this.#events = events;
    }

    if (focusRing !== undefined) {
      this.#focusRing = focusRing;
    }

    if (onAdd !== undefined) {
      this.#onAdd = onAdd;
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
  }

  get game(): Game {
    if (!this.#game) {
      throw new Error('Game is not set on the screen!');
    }

    return this.#game;
  }

  setGame(game: Game) {
    if (this.#game) {
      throw new Error('Game is already set on the screen!');
    }

    this.#game = game;
    this.#ui = new UiRoot(this.#focusRing === undefined ? {} : {focusRing: this.#focusRing});
    this.view.addChild(this.#ui.view);
    // `as T` is sound: `onAdd` is required whenever `T` is not `undefined`.
    this.state = this.#onAdd?.(this, game) as T;
  }

  get ui(): UiRoot {
    return this.#ui;
  }

  update(ticker: pixi.Ticker) {
    this.scheduler.update(ticker); // added: Pixi drives this every frame
    this.#onUpdate?.(ticker, this, this.game);
    this.#ui.update();
  }

  async show() {
    this.#isShown = true;

    // Register scheduler teardown on the (per-hide) disposables stack; re-armed each show because
    // hide() disposes and replaces the stack. A single dispose() then cancels in-flight tweens/timers.
    this.#disposables.defer(() => this.scheduler.clear());
    await this.#onShow?.(this, this.game);
  }

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

  async hide() {
    // No-op unless shown: a double hide (or a hide before any show) must not
    // dispose anything or re-run onHide side effects.
    if (!this.#isShown) {
      return;
    }

    this.#isShown = false;

    this.#ui.clearFocus();

    this.#disposables.dispose();
    this.#disposables = new DisposableStack();

    await this.#onHide?.(this, this.game);
  }

  resize() {
    this.#onResize?.(this, this.game);
  }

  destroy() {
    this.#disposables.dispose();
    this.#ui.destroy();
    this.view.destroy({children: true});
  }

  addToView(renderable: Renderable) {
    this.view.addChild(renderable.view);
    this.view.setChildIndex(this.#ui.view, this.view.children.length - 1);
    this.game.app.ticker.add(renderable.update, renderable);
  }

  removeFromView(renderable: Renderable) {
    this.view.removeChild(renderable.view);
    this.game.app.ticker.remove(renderable.update, renderable);
  }
}
