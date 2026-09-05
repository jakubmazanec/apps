import {type ErrorScreenContents} from '../../engine/app/ErrorScreenContents.js';
import {GameScreen} from '../../engine/app/GameScreen.js';
import {Panel} from '../../engine/ui/Panel.js';
import {Text} from '../../engine/ui/Text.js';
import {game} from '../core/game.js';

// The end of the line for a failed transition: no buttons, because retrying would have to
// re-enter a screen whose show() never completed. The player reloads.
export const errorScreen = new GameScreen<ErrorScreenContents>({
  // Only the always-preloaded `default` bundle: the screen that reports a failed bundle load
  // must never depend on one.
  assetBundles: ['default'],
  onAttach: (screen): ErrorScreenContents => {
    // Centering via flex on the root layout path, the same pattern loadingScreen and
    // mainMenuScreen use: the percentages resolve against game.view.

    screen.view.layout = {width: '100%', height: '100%'};

    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    let title = new Text({text: 'Something went wrong', theme: game.theme, layout: true});
    let message = new Text({
      text: '',
      theme: game.theme,
      role: 'body',
      // The DEV branch below renders an arbitrary Error.message; unwrapped it runs off the
      // panel and off the viewport. 128 art px is the panel's content width on the narrowest
      // viewport defaultChoosePixelScale produces (a tall phone bottoms out near 147 art px,
      // less the panel's 8 px padding either side). breakWords covers the long unbroken
      // tokens error messages are full of: urls, module paths, minified identifiers.
      wordWrap: true,
      wordWrapWidth: 128,
      breakWords: true,
      layout: true,
    });

    screen.ui.addChild(
      new Panel({
        theme: game.theme,
        children: [title, message],
        layout: {
          padding: 8,
          alignItems: 'center',
          flexDirection: 'column',
          gap: 4,
        },
      }),
    );

    return {
      showError: (error) => {
        // Consumed here, never stored: the label holds a string afterwards, nothing holds the
        // error. The real message is a dev-build detail, matching failUnsupported's split.
        message.setText(
          import.meta.env.DEV && error instanceof Error ?
            error.message
          : 'Reload the page to continue.',
        );
      },
    };
  },
});
