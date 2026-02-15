import * as pixi from 'pixi.js';

import {type Game} from './Game.js';

export type Renderable = {
  view: pixi.Container;
  update: (ticker: pixi.Ticker) => void;
};

export type GameScreenOptions = {
  assetBundles?: string[] | undefined;
  game: Game;
  onInit?: ((screen: GameScreen, game: Game) => void) | undefined;
  onShow?: ((screen: GameScreen, game: Game) => Promise<void> | void) | undefined;
  onHide?: ((screen: GameScreen, game: Game) => Promise<void> | void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, screen: GameScreen, game: Game) => void) | undefined;
};

export class GameScreen {
  readonly assetBundles: string[] = [];
  readonly game: Game;
  readonly view: pixi.Container = new pixi.Container();

  private readonly onShow?: (screen: GameScreen, game: Game) => Promise<void> | void;
  private readonly onHide?: (screen: GameScreen, game: Game) => Promise<void> | void;
  private readonly onUpdate?: (ticker: pixi.Ticker, gameScreen: GameScreen, game: Game) => void;

  constructor({assetBundles, game, onInit, onShow, onHide, onUpdate}: GameScreenOptions) {
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

    onInit?.(this, this.game);
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
