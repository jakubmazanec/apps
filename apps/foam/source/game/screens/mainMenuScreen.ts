import {Button, GameScreen, type Modal, Text} from 'tellurion';

import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {measureText} from '../core/measureText.js';
import {playFocusSound} from '../core/playFocusSound.js';
// The mainMenuScreen <-> nightScreen static import cycle is deliberate and
// safe: each module reads the other's binding only inside a click handler (New
// Game here, Quit to menu there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {nightScreen} from './nightScreen.js';
import {openOptionsModal} from './optionsModal.js';

type MainMenuScreenContents = {
  title: Text;
  newGameButton: Button;
  openModal: Modal | null;
  optionsButton: Button;
};

// The size is explicit so that the button centres a leaf of known width.
function labelText(label: string): Text {
  return new Text({
    text: label,
    theme: game.theme,
    layout: {width: measureText(label, 'label'), height: 12},
  });
}

export const mainMenuScreen = new GameScreen<MainMenuScreenContents>({
  assetBundles: ['default'],
  onFocusEvent: playFocusSound,
  onAttach: (screen): MainMenuScreenContents => {
    // The background is the app's black (Game.init). Centering via flex on the
    // root layout path: the percentages resolve against game.view, so a window
    // resize is handled for free.

    screen.view.layout = {width: '100%', height: '100%'};

    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      flexDirection: 'column',
    };

    let title = new Text({
      text: 'Foam',
      theme: game.theme,
      fontSize: 48,
      layout: {width: 96, height: 48},
    });
    let newGameButton = new Button({
      theme: game.theme,
      children: [labelText('New Game')],
      layout: {width: 96, marginTop: 24},
      onClick: () => {
        // showScreen never rejects; a failure lands on the error screen.
        void game.showScreen(nightScreen);
      },
    });
    let optionsButton = new Button({
      theme: game.theme,
      children: [labelText('Options')],
      layout: {width: 96, marginTop: 6},
      onClick: () => {
        screen.contents.openModal = openOptionsModal({
          ui: screen.ui,
          scheduler: screen.scheduler,
          onClosed: () => {
            screen.contents.openModal = null;
          },
        });
      },
    });

    // There is no panel: the picture plan draws the title and the buttons on the scene.
    screen.ui.addChild(title, newGameButton, optionsButton);

    return {title, newGameButton, openModal: null, optionsButton};
  },
  onShow: () => {
    // Music is driven by direct mixer calls from the screen. playMusic
    // replaces the current track.
    audio.playMusic(assets.sound('menu-music'));
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide.
    screen.contents.openModal?.destroy();

    screen.contents.openModal = null;
  },
});
