import * as pixi from 'pixi.js';
import {Button, Container, GameScreen, type Modal, Text} from 'tellurion';

import {barPicture} from '../content/pictures/barPicture.js';
import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {measureText} from '../core/measureText.js';
import {palette} from '../core/palette.js';
import {playFocusSound} from '../core/playFocusSound.js';
// The mainMenuScreen -> nightScreen -> menuModal -> mainMenuScreen static
// import cycle is deliberate and safe: no module reads another's binding while
// it evaluates, only as the game runs. This screen reads the night screen in
// New Game's click, the night screen calls the menu's functions from its Menu
// button, its update and its hide, and the menu reads this screen in Quit to
// menu's click. The directive covers the route through the log screen too,
// mainMenuScreen -> nightScreen -> logScreen -> menuModal -> mainMenuScreen:
// the night screen reads the log screen when the night ends, and the log screen
// calls the menu's functions from its Menu button, its update and its hide.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves as the game runs, long after the modules evaluate
import {nightScreen} from './nightScreen.js';
import {openOptionsModal} from './optionsModal.js';
import {PlacePicture} from './placePicture.js';

type MainMenuScreenContents = {
  title: Text;
  newGameButton: Button;
  openModal: Modal | null;
  optionsButton: Button;
  picture: PlacePicture;
  plate: pixi.Graphics;
};

// The size is explicit so that the button centres a leaf of known width.
function labelText(label: string): Text {
  return new Text({
    text: label,
    theme: game.theme,
    layout: {width: measureText(label, 'label'), height: 12},
  });
}

function resizePicture(screen: GameScreen<MainMenuScreenContents>): void {
  screen.contents.picture.resize(
    game.app.screen.width / game.pixelScale,
    game.app.screen.height / game.pixelScale,
  );
}

export const mainMenuScreen = new GameScreen<MainMenuScreenContents>({
  assetBundles: ['default'],
  onFocusEvent: playFocusSound,
  onAttach: (screen): MainMenuScreenContents => {
    // The bar's picture is the background, added in onShow. Centering via flex
    // on the root layout path: the percentages resolve against game.view, so a
    // window resize is handled for free.

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
      layout: {width: 96, marginTop: 16},
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
    // The title stands on a black plate, 8 larger than it on every side, so the
    // picture does not run through the letters. The buttons have their own fill.
    let plate = new pixi.Graphics();

    plate.rect(0, 0, 1, 1).fill(palette.black);
    plate.layout = {position: 'absolute', left: 0, top: 0, width: 112, height: 64};

    let titleBlock = new Container({
      children: [plate, title],
      layout: {width: 112, height: 64, justifyContent: 'center'},
    });

    // The main menu has no window: the title and the buttons stand on the picture.
    screen.ui.addChild(titleBlock, newGameButton, optionsButton);

    return {
      title,
      newGameButton,
      openModal: null,
      optionsButton,
      picture: new PlacePicture({picture: barPicture}),
      plate,
    };
  },
  onShow: (screen) => {
    screen.addToView(screen.contents.picture);
    resizePicture(screen);

    // Music is driven by direct mixer calls from the screen. playMusic
    // replaces the current track.
    audio.playMusic(assets.sound('menu-music'));
  },
  onHide: (screen) => {
    screen.removeFromView(screen.contents.picture);

    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide.
    screen.contents.openModal?.destroy();

    screen.contents.openModal = null;
  },
  onUpdate: (ticker, screen) => {
    // The Options window is an overlay.
    screen.contents.picture.speed = screen.ui.topOverlay === null ? 1 : 0.5;
  },
  onResize: (screen) => {
    resizePicture(screen);
  },
});
