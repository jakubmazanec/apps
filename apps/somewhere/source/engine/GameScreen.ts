import * as pixi from 'pixi.js';

import {type Game} from './Game.js';

export type Renderable = {
  view: pixi.Container;
  update: (ticker: pixi.Ticker) => void;
};

export type GameScreenOptions<T> = {
  assetBundles?: string[] | undefined;
  game: Game;
  onInit?: ((screen: GameScreen<T>, game: Game) => T) | undefined;
  onShow?: ((screen: GameScreen<T>, game: Game) => Promise<void> | void) | undefined;
  onHide?: ((screen: GameScreen<T>, game: Game) => Promise<void> | void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, screen: GameScreen<T>, game: Game) => void) | undefined;
};

export class GameScreen<T = undefined> {
  readonly assetBundles: string[] = [];
  readonly game: Game;
  readonly view: pixi.Container = new pixi.Container();
  readonly state: T;

  private readonly onShow?: (screen: GameScreen<T>, game: Game) => Promise<void> | void;
  private readonly onHide?: (screen: GameScreen<T>, game: Game) => Promise<void> | void;
  private readonly onUpdate?: (ticker: pixi.Ticker, screen: GameScreen<T>, game: Game) => void;

  constructor({assetBundles, game, onInit, onShow, onHide, onUpdate}: GameScreenOptions<T>) {
    this.game = game;

    if (assetBundles !== undefined) {
      this.assetBundles = assetBundles;
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

    this.state = onInit?.(this, this.game) as T;
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

  addToView(renderable: Renderable) {
    this.view.addChild(renderable.view);
    this.game.app.ticker.add(renderable.update, renderable);
  }
}
