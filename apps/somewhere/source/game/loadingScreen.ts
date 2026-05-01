import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';

export const loadingScreen = new GameScreen({
  assetBundles: ['default'],
  onAdd: () => ({
    spinner: new pixi.Graphics()
      .arc(0, 0, 30, 0, Math.PI * 1.5)
      .stroke({width: 4, color: 0xffffff}),
  }),
  onShow: async (screen) => {
    screen.view.addChild(screen.state.spinner);
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
  },
  onUpdate: (ticker, screen) => {
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.spinner.x = screen.game.app.screen.width / 2;
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.spinner.y = screen.game.app.screen.height / 2;
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.spinner.rotation += 0.1 * ticker.deltaTime;
  },
});
