import * as pixi from 'pixi.js';
import {Button, Container, GameScreen, type Modal, Text} from 'tellurion';

import {nightStart} from '../content/nightStart.js';
import {barPicture} from '../content/pictures/barPicture.js';
import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {measureText} from '../core/measureText.js';
import {countStart, forgetNights} from '../core/nights.js';
import {palette} from '../core/palette.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {clearSavedNight, loadSavedNight} from '../core/save.js';
import {forgetStories} from '../core/stories.js';
import {forgetTextsRead} from '../core/textsRead.js';
import {todaySeed} from '../core/todaySeed.js';
import {openCollectionWindow} from './collectionWindow.js';
import {openConfirmModal} from './confirmModal.js';
import {type ListWindow} from './listWindow.js';
import {openNewNightModal} from './newNightModal.js';
// The mainMenuScreen -> nightScreen -> menuModal -> mainMenuScreen static
// import cycle is deliberate and safe: no module reads another's binding while
// it evaluates, only as the game runs. This screen reads the night screen in
// the New night window's Start and Continue's click, the night screen calls the menu's
// functions from its Menu button, its update and its hide, and the menu reads this screen
// in Quit to menu's click. The directive covers the route through the log screen too,
// mainMenuScreen -> nightScreen -> logScreen -> menuModal -> mainMenuScreen:
// the night screen reads the log screen when the night ends, and the log screen
// calls the menu's functions from its Menu button, its update and its hide.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves as the game runs, long after the modules evaluate
import {nightScreen} from './nightScreen.js';
import {openOptionsModal} from './optionsModal.js';
import {PlacePicture} from './placePicture.js';

type MainMenuScreenContents = {
  title: Text;
  collectionButton: Button;
  collectionWindow: ListWindow | null;
  confirmModal: Modal | null;
  continueButton: Button;
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

// Continue stands above New Game while there is a saved night. It is checked on
// show, as the menu lives across shows and the night saves while the menu is
// hidden, and when a window over the menu closes, since Reset can take the save
// away while the menu is shown. On show nothing is focused, and on a window's
// close only a removal can happen, with the focus back on the button that opened
// the window, so no focused button is ever taken out.
function slotContinue(screen: GameScreen<MainMenuScreenContents>): void {
  let {collectionButton, continueButton, newGameButton, optionsButton} = screen.contents;
  let hasSave = loadSavedNight(nightStart.places) !== null;
  let isContinueShown = screen.ui.children.includes(continueButton);

  if (hasSave && !isContinueShown) {
    // UiRoot.addChild only appends, so New Game, Collection and Options go out
    // and back in to slot Continue between the title and New Game.
    screen.ui.removeChild(newGameButton, collectionButton, optionsButton);
    screen.ui.addChild(continueButton, newGameButton, collectionButton, optionsButton);
    newGameButton.view.layout = {marginTop: 6};
  } else if (!hasSave && isContinueShown) {
    // Dropping it from the root also drops it from the focus order.
    screen.ui.removeChild(continueButton);
    newGameButton.view.layout = {marginTop: 16};
  }
}

// Counted at the start, so a night started and abandoned at once still counts.
function startNight(seed: number): void {
  countStart(todaySeed());
  // The clear makes "Start ends the saved night" literal, and the null keeps a
  // Continue that failed to show the screen from leaking into a fresh night.
  clearSavedNight();
  nightScreen.contents.resuming = null;
  nightStart.seed = seed;
  // showScreen never rejects; a failure lands on the error screen.
  void game.showScreen(nightScreen);
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
      label: {...game.theme.text.label, fontSize: 48},
      layout: {width: 96, height: 48},
    });
    // Not added here: slotContinue puts it above New Game while there is a saved night.
    let continueButton = new Button({
      theme: game.theme,
      children: [labelText('Continue')],
      layout: {width: 96, marginTop: 16},
      onClick: () => {
        // The save is read once more and handed to the night screen for its
        // show, as the night screen hands the night to the log screen.
        nightScreen.contents.resuming = loadSavedNight(nightStart.places);
        // showScreen never rejects; a failure lands on the error screen.
        void game.showScreen(nightScreen);
      },
    });
    let newGameButton = new Button({
      theme: game.theme,
      children: [labelText('New Game')],
      layout: {width: 96, marginTop: 16},
      onClick: () => {
        screen.contents.openModal = openNewNightModal({
          ui: screen.ui,
          scheduler: screen.scheduler,
          onClosed: () => {
            screen.contents.openModal = null;
            slotContinue(screen);
          },
          onStart: (seed) => {
            if (loadSavedNight(nightStart.places) === null) {
              startNight(seed);
            } else {
              screen.contents.confirmModal = openConfirmModal({
                ui: screen.ui,
                scheduler: screen.scheduler,
                title: 'Night in progress',
                text: 'Start ends the saved night.',
                action: 'Start',
                // The night screen's show destroys both windows through the menu's hide.
                onAction: () => {
                  startNight(seed);
                },
                onClosed: () => {
                  screen.contents.confirmModal = null;
                },
              });
            }
          },
        });
      },
    });
    let collectionButton = new Button({
      theme: game.theme,
      children: [labelText('Collection')],
      layout: {width: 96, marginTop: 6},
      onClick: () => {
        screen.contents.collectionWindow = openCollectionWindow({
          ui: screen.ui,
          scheduler: screen.scheduler,
          onReset: () => {
            screen.contents.confirmModal = openConfirmModal({
              ui: screen.ui,
              scheduler: screen.scheduler,
              title: 'Reset',
              text: 'Everything the game kept goes: the stories, the nights, the texts read and the saved night.',
              action: 'Reset',
              // Continue leaves the menu when the Collection window closes.
              onAction: () => {
                forgetStories();
                forgetNights();
                forgetTextsRead();
                clearSavedNight();
                screen.contents.collectionWindow?.refresh();
                screen.contents.confirmModal?.close();
              },
              onClosed: () => {
                screen.contents.confirmModal = null;
              },
            });
          },
          onClosed: () => {
            screen.contents.collectionWindow = null;
            slotContinue(screen);
          },
        });
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
            slotContinue(screen);
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
    screen.ui.addChild(titleBlock, newGameButton, collectionButton, optionsButton);

    return {
      title,
      collectionButton,
      collectionWindow: null,
      confirmModal: null,
      continueButton,
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
    slotContinue(screen);

    // Music is driven by direct mixer calls from the screen. playMusic
    // replaces the current track.
    audio.playMusic(assets.sound('menu-music'));
  },
  onHide: (screen) => {
    screen.removeFromView(screen.contents.picture);

    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide. The
    // topmost window goes first.
    screen.contents.confirmModal?.destroy();
    screen.contents.collectionWindow?.modal.destroy();
    screen.contents.openModal?.destroy();

    screen.contents.confirmModal = null;
    screen.contents.collectionWindow = null;
    screen.contents.openModal = null;
  },
  onUpdate: (ticker, screen) => {
    // The Options, New night and Collection windows and the confirmations are overlays.
    screen.contents.picture.speed = screen.ui.topOverlay === null ? 1 : 0.5;
  },
  onResize: (screen) => {
    resizePicture(screen);
    screen.contents.collectionWindow?.resize();
  },
});
