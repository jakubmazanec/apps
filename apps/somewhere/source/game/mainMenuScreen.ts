import {GameScreen} from '../engine/app/GameScreen.js';
import {type AudioBus} from '../engine/audio/AudioMixer.js';
import {Button} from '../engine/ui/Button.js';
import {Container} from '../engine/ui/Container.js';
import {Modal} from '../engine/ui/Modal.js';
import {Panel} from '../engine/ui/Panel.js';
import {Slider} from '../engine/ui/Slider.js';
import {Text} from '../engine/ui/Text.js';
import {TextInput} from '../engine/ui/TextInput.js';
import {assets} from './assets.js';
import {audio, playFocusSound} from './audio.js';
import {game} from './game.js';
import {clearStagedSave, loadSave, stageContinue} from './save.js';
import {saveSettings, saveSettingsSoon, settings} from './settings.js';
// The mainMenuScreen <-> worldScreen static import cycle is deliberate and safe:
// each module reads the other's binding only inside event handlers (New Game
// here, Quit to menu there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {worldScreen} from './worldScreen.js';

// One row per bus: a label plus a Slider seeded from the current setting.
// onChange fires on every value change, including each pointermove tick of a
// drag. audio.setVolume is cheap (an in-memory ~15 ms ramp) and wants every
// tick; the settings write is not, so it goes through saveSettingsSoon and
// collapses to one write on the drag's trailing edge.
function volumeRow(label: string, bus: AudioBus) {
  let slider = new Slider({
    theme: game.theme,
    value: settings.volumes[bus],
    onChange: (changed) => {
      audio.setVolume(bus, changed.value);
      settings.volumes[bus] = changed.value;
      saveSettingsSoon();
    },
  });

  return new Container({
    children: [new Text({text: label, theme: game.theme, layout: true}), slider],
    layout: {gap: 3},
  });
}

// The Options modal is constructed per open, so the widgets read the current
// settings values at build time — no re-sync code exists or is needed. No
// initialFocus: nothing is focused on open; the first focus command lands via
// the normal focus walk.
function openOptionsModal(screen: GameScreen<MainMenuScreenContents>) {
  let title = new Text({text: 'Options', theme: game.theme, layout: true});
  let nameInput = new TextInput({
    theme: game.theme,
    value: settings.playerName,
    placeholder: 'Name...',
    role: 'body',
    maxLength: 16,
    // Evaluated on the Options click — after the canvas is mounted — so it
    // resolves to the real canvas container.
    container: game.app.canvas.parentElement ?? document.body,
    onChange: (input) => {
      settings.playerName = input.value;
      saveSettings();
      audio.play(assets.sound('ui-key'), {bus: 'ui'});
    },
    layout: {minWidth: 55, padding: 4},
  });
  let nameRow = new Container({
    children: [new Text({text: 'Player name', theme: game.theme, layout: true}), nameInput],
    layout: {gap: 3},
  });
  let masterRow = volumeRow('Master', 'master');
  let musicRow = volumeRow('Music', 'music');
  let sfxRow = volumeRow('SFX', 'sfx');
  let uiRow = volumeRow('UI', 'ui');
  let closeButton = new Button({
    theme: game.theme,
    children: [new Text({text: 'Close', theme: game.theme, layout: true})],
    onClick: () => {
      // Focus returns to the Options menu item via the focus-scope pop.
      screen.contents.openModal?.close();
    },
  });
  let panel = new Panel({
    theme: game.theme,
    children: [title, nameRow, masterRow, musicRow, sfxRow, uiRow, closeButton],
    layout: {
      padding: 8,
      alignItems: 'center',
      flexDirection: 'column',
      gap: 4,
    },
  });
  let modal = new Modal({
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler: screen.scheduler,
    fadeDuration: 200,
    onClose: () => {
      saveSettingsSoon.flush();

      screen.contents.openModal = null;
    },
  });

  screen.contents.openModal = modal;
  modal.open(screen.ui);
  modal.resize(game.app.screen.width / game.pixelScale, game.app.screen.height / game.pixelScale);
}

type MainMenuScreenContents = {
  bannerPanel: Panel;
  continueButton: Button;
  newGameButton: Button;
  openModal: Modal | null;
  optionsButton: Button;
};

export const mainMenuScreen = new GameScreen<MainMenuScreenContents>({
  // Only the always-preloaded `default` bundle: the `game` bundle is first
  // needed by worldScreen, and Game.showScreen already shows the loading screen
  // for any not-yet-loaded bundle when New Game is pressed.
  assetBundles: ['default'],
  onFocusEvent: playFocusSound,
  onShow: (screen) => {
    // Recomputed per show: the menu object lives across shows, and quitting a
    // run creates a save while it is hidden.
    let {bannerPanel, continueButton, newGameButton, optionsButton} = screen.contents;
    let hasSave = loadSave() !== null;
    let isContinueShown = bannerPanel.children.includes(continueButton);

    if (hasSave && !isContinueShown) {
      // Panel.addChild only appends, so re-add the tail to slot Continue
      // between the title and New Game.
      bannerPanel.removeChild(newGameButton, optionsButton);
      bannerPanel.addChild(continueButton, newGameButton, optionsButton);
    } else if (!hasSave && isContinueShown) {
      // Dropping it from the panel also drops it from the focus order.
      bannerPanel.removeChild(continueButton);
    }

    // Music is driven by direct mixer calls from the screen context (never the
    // world, never auto-stopped by pause). playMusic replaces the current voice.
    audio.playMusic(assets.sound('menu-music'));
  },
  onAttach: (screen): MainMenuScreenContents => {
    // Solid background is the app's existing black (Game init background); no
    // world runs behind the menu. Centering via flex on the root layout path
    // (the same pattern loadingScreen uses): the percentages resolve against
    // game.view, so window resize is handled for free.

    screen.view.layout = {width: '100%', height: '100%'};

    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    let title = new Text({text: 'Somewhere', theme: game.theme, layout: true});
    let continueButton = new Button({
      theme: game.theme,
      children: [new Text({text: 'Continue', theme: game.theme, layout: true})],
      onClick: () => {
        // Stage before the swap so worldScreen.onShow can apply it after
        // world.start(). showScreen never rejects: a failed bundle load lands on the
        // error screen.
        stageContinue();
        void game.showScreen(worldScreen);
      },
    });
    let newGameButton = new Button({
      theme: game.theme,
      children: [new Text({text: 'New Game', theme: game.theme, layout: true})],
      onClick: () => {
        // A stale stage from a failed Continue transition must never leak
        // into a fresh run.
        clearStagedSave();
        // showScreen never rejects: a failed bundle load lands on the error screen.
        void game.showScreen(worldScreen);
      },
    });
    let optionsButton = new Button({
      theme: game.theme,
      children: [new Text({text: 'Options', theme: game.theme, layout: true})],
      onClick: () => {
        openOptionsModal(screen);
      },
    });
    let bannerPanel = new Panel({
      theme: game.theme,
      // Continue is added/removed per show according to whether a save
      // exists; see onShow.
      children: [title, newGameButton, optionsButton],
      layout: {
        padding: 8,
        alignItems: 'center',
        flexDirection: 'column',
        gap: 4,
      },
    });

    screen.ui.addChild(bannerPanel);

    return {bannerPanel, continueButton, newGameButton, openModal: null, optionsButton};
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close() — the scheduler was already cleared before onHide.
    screen.contents.openModal?.destroy();

    screen.contents.openModal = null;
  },
  onResize: (screen) => {
    screen.contents.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
});
