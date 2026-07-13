import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {Container} from '../engine/ui/Container.js';
import {Modal} from '../engine/ui/Modal.js';
import {Panel} from '../engine/ui/Panel.js';
import {Text} from '../engine/ui/Text.js';
import {TextInput} from '../engine/ui/TextInput.js';
import {Toggle} from '../engine/ui/Toggle.js';
import {game} from './game.js';
// The mainMenuScreen <-> gameScreen static import cycle is deliberate and safe:
// each module reads the other's binding only inside event handlers (New Game
// here, Quit to menu there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {gameScreen} from './gameScreen.js';
import {settings} from './settings.js';
import {BANNER_SLICE, createButton, FOCUS_RING, INPUT_SLICE, nineSlice} from './widgets.js';

// Each Toggle owns and destroys its background sprites, so build a fresh set
// per toggle rather than sharing instances.
function toggleBackgrounds() {
  // eslint-disable-next-line unicorn/consistent-function-scoping -- single-use builder kept local to the only function that needs it
  let toggleSprite = (name: string) => new pixi.Sprite(pixi.Assets.get(name));

  return {
    unchecked: toggleSprite('toggle-unchecked'),
    checked: toggleSprite('toggle-checked'),
    hovered: toggleSprite('toggle-hovered'),
    hoveredChecked: toggleSprite('toggle-hovered-checked'),
    disabled: toggleSprite('toggle-disabled'),
    disabledChecked: toggleSprite('toggle-disabled-checked'),
  };
}

// The Options modal is constructed per open, so the widgets read the current
// settings values at build time — no re-sync code exists or is needed. No
// initialFocus: nothing is focused on open; the first focus command lands via
// the normal focus walk.
function openOptionsModal(screen: GameScreen<MainMenuScreenState>) {
  let title = new Text({
    text: 'Options',
    fontFamily: 'monogram-outline',
    fontSize: 48,
    fill: 0xffffff,
    layout: true,
  });

  let nameInput = new TextInput({
    backgrounds: {
      normal: nineSlice('text-input-normal', INPUT_SLICE),
      hovered: nineSlice('text-input-hovered', INPUT_SLICE),
      disabled: nineSlice('text-input-disabled', INPUT_SLICE),
    },
    value: settings.playerName,
    placeholder: 'Name...',
    fontFamily: 'monogram',
    fontSize: 48,
    fill: 0xffffff,
    maxLength: 16,
    // Evaluated on the Options click — after the canvas is mounted — so it
    // resolves to the real canvas container.
    container: game.app.canvas.parentElement ?? document.body,
    onChange: (input) => {
      settings.playerName = input.value;
    },
    layout: {minWidth: 220, padding: 16},
  });
  let nameRow = new Container({
    children: [
      new Text({
        text: 'Player name',
        fontFamily: 'monogram-outline',
        fontSize: 48,
        fill: 0xffffff,
        layout: true,
      }),
      nameInput,
    ],
    layout: {gap: 12},
  });

  let soundToggle = new Toggle({
    backgrounds: toggleBackgrounds(),
    checked: settings.soundEnabled,
    // Writing the value is a no-op for now: nothing consumes it until a sound
    // system exists (none does today).
    onChange: (toggle) => {
      settings.soundEnabled = toggle.isChecked;
    },
  });
  let soundRow = new Container({
    children: [
      new Text({
        text: 'Sound',
        fontFamily: 'monogram-outline',
        fontSize: 48,
        fill: 0xffffff,
        layout: true,
      }),
      soundToggle,
    ],
    layout: {gap: 12},
  });

  let closeButton = createButton({
    label: 'Close',
    onClick: () => {
      // Focus returns to the Options menu item via the focus-scope pop.
      screen.state.openModal?.close();
    },
  });

  let panel = new Panel({
    background: nineSlice('banner', BANNER_SLICE),
    children: [title, nameRow, soundRow, closeButton],
    layout: {
      padding: 32,
      alignItems: 'center',
      flexDirection: 'column',
      gap: 16,
    },
  });

  let modal = new Modal({
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler: screen.scheduler,
    fadeDuration: 200,
    onClose: () => {
      // eslint-disable-next-line no-param-reassign -- needed
      screen.state.openModal = null;
    },
  });

  // eslint-disable-next-line no-param-reassign -- needed
  screen.state.openModal = modal;
  modal.open(screen.ui);
  modal.resize(game.app.screen.width, game.app.screen.height);
}

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

    let optionsButton = createButton({
      label: 'Options',
      onClick: () => {
        openOptionsModal(screen);
      },
    });

    let bannerPanel = new Panel({
      background: nineSlice('banner', BANNER_SLICE),
      children: [title, newGameButton, optionsButton],
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
