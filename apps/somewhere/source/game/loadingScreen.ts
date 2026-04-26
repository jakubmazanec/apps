import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/GameScreen.js';
import {game} from './game.js';

let spinner: pixi.Graphics;

export const loadingScreen = new GameScreen({
  game,
  assetBundles: ['default'],
  onShow: (screen) => {
    spinner = new pixi.Graphics()
      .arc(0, 0, 30, 0, Math.PI * 1.5)
      .stroke({width: 4, color: 0xffffff});

    screen.view.addChild(spinner);
  },
  onUpdate: (ticker, screen) => {
    spinner.x = screen.game.app.screen.width / 2;
    spinner.y = screen.game.app.screen.height / 2;
    spinner.rotation += 0.1 * ticker.deltaTime;
  },
});
