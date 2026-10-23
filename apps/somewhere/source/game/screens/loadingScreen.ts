import {GameScreen, Text} from 'tellurion';

import {game} from '../core/game.js';

type LoadingScreenContents = {label: Text};

export const loadingScreen = new GameScreen<LoadingScreenContents>({
  assetBundles: ['default'],
  onAttach: (): LoadingScreenContents => {
    let label = new Text({text: 'Loading...', theme: game.theme, role: 'body', layout: true});

    return {
      label,
    };
  },
  onShow: (screen) => {
    screen.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    screen.view.addChild(screen.contents.label.view);
  },
  onResize: () => {},
  onUpdate: () => {},
});
