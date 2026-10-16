import {type ErrorScreenContents, GameScreen, Panel, Text} from 'tellurion';

import {game} from '../core/game.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

// The end of the line for a failed transition: no buttons, because retrying
// would have to re-enter a screen whose show() never completed. The player
// reloads.
export const errorScreen = new GameScreen<ErrorScreenContents>({
  // Only the always-preloaded `default` bundle: the screen that reports a
  // failed bundle load must never depend on one.
  assetBundles: ['default'],
  onAttach: (screen): ErrorScreenContents => {
    // Centering via flex on the root layout path, the same pattern
    // mainMenuScreen uses: the percentages resolve against game.view.

    screen.view.layout = {width: '100%', height: '100%'};

    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    let message = new Text({
      text: '',
      theme: game.theme,
      role: 'body',
      // The DEV branch below renders an arbitrary Error.message; unwrapped it runs
      // off the panel and off the viewport. 120 is the title's width, so the window
      // is 144 wide (12 px padding either side) and fits a 146-pixel screen, the
      // narrowest the tests keep. breakWords covers the long unbroken tokens error
      // messages are full of: urls, module paths, minified identifiers.
      wordWrap: true,
      wordWrapWidth: 120,
      breakWords: true,
      layout: true,
    });

    screen.ui.addChild(
      new Panel({
        theme: game.theme,
        children: [createWindowTitle('Something went wrong', 120), message],
        layout: {
          ...WINDOW_PADDING,
          alignItems: 'center',
          flexDirection: 'column',
          gap: 4,
        },
      }),
    );

    return {
      showError: (error) => {
        // Consumed here, never stored: the label holds a string afterwards,
        // nothing holds the error. The real message is a dev-build detail.
        message.setText(
          import.meta.env.DEV && error instanceof Error ?
            error.message
          : 'Reload the page to continue.',
        );
      },
    };
  },
});
