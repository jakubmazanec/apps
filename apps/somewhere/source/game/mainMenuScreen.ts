import {GameScreen} from '../engine/app/GameScreen.js';
import {type Modal} from '../engine/ui/Modal.js';
import {Panel} from '../engine/ui/Panel.js';
import {Text} from '../engine/ui/Text.js';
import {game} from './game.js';
// The mainMenuScreen <-> gameScreen static import cycle is deliberate and safe:
// each module reads the other's binding only inside event handlers (New Game
// here, Quit to menu there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {gameScreen} from './gameScreen.js';
import {BANNER_SLICE, createButton, FOCUS_RING, nineSlice} from './widgets.js';

type MainMenuScreenState = {
  openModal: Modal | null;
};

export const mainMenuScreen = new GameScreen<MainMenuScreenState>({
  // Only the always-preloaded `default` bundle: the `game` bundle is first
  // needed by gameScreen, and Game.showScreen already shows the loading screen
  // for any not-yet-loaded bundle when New Game is pressed.
  assetBundles: ['default'],
  focusRing: FOCUS_RING,
  onAdd: (screen): MainMenuScreenState => {
    // Solid background is the app's existing black (Game init background); no
    // world runs behind the menu. Centering via flex on the root layout path
    // (the same pattern loadingScreen uses): the percentages resolve against
    // game.view, so window resize is handled for free.
    // eslint-disable-next-line no-param-reassign -- needed
    screen.view.layout = {width: '100%', height: '100%'};
    // eslint-disable-next-line no-param-reassign -- needed
    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    let title = new Text({
      text: 'Somewhere',
      fontFamily: 'monogram-outline',
      fontSize: 48,
      layout: true,
    });

    let newGameButton = createButton({
      label: 'New Game',
      onClick: () => {
        // showScreen rejects when a bundle load fails; the game stays usable
        // and the click can be retried.
        game.showScreen(gameScreen).catch((error: unknown) => {
          // eslint-disable-next-line no-console -- no error UI exists yet
          console.error(error);
        });
      },
    });

    let bannerPanel = new Panel({
      background: nineSlice('banner', BANNER_SLICE),
      children: [title, newGameButton],
      layout: {
        padding: 32,
        alignItems: 'center',
        flexDirection: 'column',
        gap: 16,
      },
    });

    screen.ui.addChild(bannerPanel);

    return {openModal: null};
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close() — the scheduler was already cleared before onHide.
    screen.state.openModal?.destroy();
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.openModal = null;
  },
  onResize: (screen) => {
    screen.state.openModal?.resize(screen.game.app.screen.width, screen.game.app.screen.height);
  },
});
