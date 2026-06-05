// import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {Text} from '../engine/ui/Text.js';

export const loadingScreen = new GameScreen({
  assetBundles: ['default'],
  onAdd: () => {
    let label = new Text({
      text: 'Loading...',
      fontFamily: 'monogram',
      fontSize: 48,
      fill: 0xffffff,
      layout: true,
    });

    return {
      // spinner: new pixi.Graphics()
      //   .arc(0, 0, 30, 0, Math.PI * 1.5)
      //   .stroke({width: 4, color: 0xffffff}),
      label,
    };
  },
  onShow: async (screen) => {
    // eslint-disable-next-line no-param-reassign -- needed
    screen.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    // screen.view.addChild(screen.state.spinner);
    screen.view.addChild(screen.state.label.view);
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  },
  onResize: () => {},
  onUpdate: () => {},
});
