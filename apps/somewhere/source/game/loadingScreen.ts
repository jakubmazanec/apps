import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {Text} from '../engine/graphics/Text.js';

export const loadingScreen = new GameScreen({
  assetBundles: ['default'],
  onAdd: () => {
    let label = new Text({
      text: 'Loading...',
      fontFamily: 'px sans nouveaux',
      fontSize: 64,
      fill: 0xffffff,
      anchor: {x: 0.5, y: 0.5},
    });

    return {
      spinner: new pixi.Graphics()
        .arc(0, 0, 30, 0, Math.PI * 1.5)
        .stroke({width: 4, color: 0xffffff}),
      label,
    };
  },
  onShow: async (screen) => {
    screen.view.addChild(screen.state.spinner);
    screen.view.addChild(screen.state.label.view);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  },
  onResize: (screen, game) => {
    let cx = game.app.canvas.width / 2;
    let cy = game.app.canvas.height / 2;
    /* eslint-disable no-param-reassign -- needed */
    screen.state.spinner.x = cx;
    screen.state.spinner.y = cy;
    screen.state.label.view.x = cx;
    screen.state.label.view.y = cy + 70;
    /* eslint-enable no-param-reassign -- needed */
  },
  onUpdate: (ticker, screen) => {
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.spinner.rotation += 0.1 * ticker.deltaTime;
  },
});
