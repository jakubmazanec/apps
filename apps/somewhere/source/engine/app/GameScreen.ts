import * as pixi from 'pixi.js';

import {type Game} from './Game.js';

export type Renderable = {
  view: pixi.Container;
  update: (ticker: pixi.Ticker) => void;
};

export type GameScreenOptions<T> = {
  assetBundles?: string[] | undefined;
  onAdd?: ((screen: GameScreen<T>, game: Game) => T) | undefined;
  onShow?: ((screen: GameScreen<T>, game: Game) => Promise<void> | void) | undefined;
  onHide?: ((screen: GameScreen<T>, game: Game) => Promise<void> | void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, screen: GameScreen<T>, game: Game) => void) | undefined;
  onResize?: ((screen: GameScreen<T>, game: Game) => void) | undefined;
};

export class GameScreen<T = undefined> {
  #game: Game | null = null;

  readonly assetBundles: string[] = [];
  readonly view: pixi.Container = new pixi.Container();
  state!: T;

  private readonly onAdd?: (screen: GameScreen<T>, game: Game) => T;
  private readonly onShow?: (screen: GameScreen<T>, game: Game) => Promise<void> | void;
  private readonly onHide?: (screen: GameScreen<T>, game: Game) => Promise<void> | void;
  private readonly onUpdate?: (ticker: pixi.Ticker, screen: GameScreen<T>, game: Game) => void;
  private readonly onResize?: (screen: GameScreen<T>, game: Game) => void;

  constructor({assetBundles, onAdd, onShow, onHide, onUpdate, onResize}: GameScreenOptions<T>) {
    if (assetBundles !== undefined) {
      this.assetBundles = assetBundles;
    }

    if (onAdd !== undefined) {
      this.onAdd = onAdd;
    }

    if (onShow !== undefined) {
      this.onShow = onShow;
    }

    if (onHide !== undefined) {
      this.onHide = onHide;
    }

    if (onUpdate !== undefined) {
      this.onUpdate = onUpdate;
    }

    if (onResize !== undefined) {
      this.onResize = onResize;
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
    this.state = this.onAdd?.(this, game) as T;
  }

  update(ticker: pixi.Ticker) {
    this.onUpdate?.(ticker, this, this.game);
  }

  async show() {
    await this.onShow?.(this, this.game);
  }

  async hide() {
    await this.onHide?.(this, this.game);
  }

  resize() {
    this.onResize?.(this, this.game);
  }

  addToView(renderable: Renderable) {
    this.view.addChild(renderable.view);
    this.game.app.ticker.add(renderable.update, renderable);
  }

  removeFromView(renderable: Renderable) {
    this.view.removeChild(renderable.view);
    this.game.app.ticker.remove(renderable.update, renderable);
  }
}
