import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';

export const loadingScreen = new GameScreen({
  assetBundles: ['default'],
  onAdd: () => {
    let label = new pixi.BitmapText({
      text: 'Loading...',
      style: {
        fontFamily: 'px sans nouveaux',
        fontSize: 16,
        fill: 0xffffff,
      },
    });
    label.anchor.set(0.5);
    label.scale.set(4);

    return {
      spinner: new pixi.Graphics()
        .arc(0, 0, 30, 0, Math.PI * 1.5)
        .stroke({width: 4, color: 0xffffff}),
      label,
    };
  },
  onShow: async (screen) => {
    screen.view.addChild(screen.state.spinner);
    screen.view.addChild(screen.state.label);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  },
  onUpdate: (ticker, screen) => {
    let cx = screen.game.app.screen.width / 2;
    let cy = screen.game.app.screen.height / 2;
    /* eslint-disable no-param-reassign -- needed */
    screen.state.spinner.x = cx;
    screen.state.spinner.y = cy;
    screen.state.spinner.rotation += 0.1 * ticker.deltaTime;
    screen.state.label.x = cx;
    screen.state.label.y = cy + 70;
    /* eslint-enable no-param-reassign -- needed */
  },
});
