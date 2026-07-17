import {GameScreen} from '../engine/app/GameScreen.js';
import {type Button} from '../engine/ui/Button.js';
import {Container} from '../engine/ui/Container.js';
import {Modal} from '../engine/ui/Modal.js';
import {Panel} from '../engine/ui/Panel.js';
import {Text} from '../engine/ui/Text.js';
import {assets} from './assets.js';
import {audio, playFocusSound} from './audio.js';
import {game} from './game.js';
import {input} from './input.js';
// The gameScreen <-> mainMenuScreen static import cycle is deliberate and safe:
// each module reads the other's binding only inside event handlers (Quit to
// menu here, New Game there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {mainMenuScreen} from './mainMenuScreen.js';
import {openPauseMenu, resumeFromPause, teardownGameScreen} from './pauseFlow.js';
import {applyStagedSave, writeSave} from './save.js';
import {settings} from './settings.js';
import {type UIEventMap, uiEvents} from './uiEvents.js';
import {createButton, nineSlice} from './widgets.js';
import {world} from './world.js';

type GameScreenState = {
  hitCounter: Text;
  nameLabel: Text;
  openModal: Modal | null;
  pauseButton: Button;
  visibilityDisposables: DisposableStack | null;
};

let wallHitCount = 0;

// The pause menu is constructed per open (the reminder-dialog pattern): banner
// panel with a "Paused" title, Resume (initial focus), and Quit to menu.
function buildPauseModal(screen: GameScreen<GameScreenState, UIEventMap>): Modal {
  let resumeButton = createButton({
    label: 'Resume',
    onClick: () => {
      let modal = screen.state.openModal;

      if (modal !== null) {
        resumeFromPause({world, modal});
      }
    },
  });
  let saveLabel = new Text({
    text: 'Save',
    fontFamily: 'monogram-outline',
    fontSize: 12,
    fill: 0xffffff,
    layout: true,
  });
  let saveButton = createButton({
    label: saveLabel,
    onClick: () => {
      // Manual save under the pause modal: capture works on a paused world.
      writeSave();
      // Feedback on the kept reference (the hitCounter idiom); the modal is
      // rebuilt per open, so the label resets naturally.
      saveLabel.setText('Saved');
    },
  });
  let quitButton = createButton({
    label: 'Quit to menu',
    onClick: () => {
      // The swap triggers this screen's onHide, which does the full teardown
      // (modal destroy + world stop + detach). showScreen rejects only when a
      // bundle load fails; the menu bundle is always loaded.
      game.showScreen(mainMenuScreen).catch((error: unknown) => {
        // eslint-disable-next-line no-console -- no error UI exists yet
        console.error(error);
      });
    },
  });
  let panel = new Panel({
    background: nineSlice('banner'),
    children: [
      new Text({
        text: 'Paused',
        fontFamily: 'monogram-outline',
        fontSize: 12,
        fill: 0xffffff,
        layout: true,
      }),
      resumeButton,
      saveButton,
      quitButton,
    ],
    layout: {
      padding: 8,
      alignItems: 'center',
      flexDirection: 'column',
      gap: 4,
    },
  });

  return new Modal({
    children: [panel],
    layout: {justifyContent: 'center', alignItems: 'center'},
    scheduler: screen.scheduler,
    fadeDuration: 200,
    initialFocus: resumeButton,
    onClose: () => {
      // eslint-disable-next-line no-param-reassign -- needed
      screen.state.openModal = null;
    },
  });
}

export const gameScreen = new GameScreen<GameScreenState, UIEventMap>({
  // `default` for the HUD/pause-menu widgets, `game` for world assets — this is
  // what makes New Game show the loading screen while the game bundle is cold.
  assetBundles: ['default', 'game'],
  events: uiEvents,
  focusRing: () => ({texture: assets.texture('ui', 'focus-ring'), padding: 2}),
  onFocusEvent: playFocusSound,
  onAdd: (screen): GameScreenState => {
    // Full-screen flex row: HUD texts top-left, pause button top-right. The
    // percentages resolve against game.view's root layout, so window resize is
    // handled by the existing root-layout resize path. The focus-ring overlay
    // and the modal stay out of the flow (no layout / position: absolute).
    // eslint-disable-next-line no-param-reassign -- needed
    screen.view.layout = {width: '100%', height: '100%'};
    // eslint-disable-next-line no-param-reassign -- needed
    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: 4,
    };

    let nameLabel = new Text({
      text: '',
      fontFamily: 'monogram-outline',
      fontSize: 12,
      fill: 0xffffff,
      layout: true,
    });
    let hitCounter = new Text({
      text: 'Wall hits: 0',
      fontFamily: 'monogram-outline',
      fontSize: 12,
      fill: 0xffffff,
      layout: true,
    });
    let hud = new Container({
      children: [nameLabel, hitCounter],
      layout: {flexDirection: 'column', alignItems: 'flex-start', gap: 1},
    });

    let pauseButton = createButton({
      // Text label — no icon asset exists yet; art can replace it later.
      label: 'Pause',
      onClick: () => {
        openPauseMenu({
          world,
          openModal: () => {
            let modal = buildPauseModal(screen);

            // eslint-disable-next-line no-param-reassign -- needed
            screen.state.openModal = modal;
            modal.open(screen.ui);
            modal.resize(
              screen.game.app.screen.width / screen.game.pixelScale,
              screen.game.app.screen.height / screen.game.pixelScale,
            );
          },
        });
      },
    });

    screen.ui.addChild(hud, pauseButton);

    return {hitCounter, nameLabel, openModal: null, pauseButton, visibilityDisposables: null};
  },
  onShow: (screen) => {
    screen.addToView(world);
    input.attach(game.view);
    world.start();
    // Safe directly after start(): addEntity outside an update applies
    // synchronously, so playersQuery is already populated. A no-op without a
    // staged save (New Game).
    applyStagedSave();

    wallHitCount = 0;
    screen.state.hitCounter.setText('Wall hits: 0');
    // Read fresh each show: Options is reachable only from the main menu and
    // runs are ephemeral, so the name cannot change mid-run. An empty name
    // renders an empty label.
    screen.state.nameLabel.setText(settings.playerName);

    screen.subscribe('world:wallHit', () => {
      wallHitCount += 1;
      screen.state.hitCounter.setText(`Wall hits: ${wallHitCount}`);
    });

    // Swap to the in-game track; the menu track (still playing through the
    // loading screen) is replaced by this single music voice — no silent gap,
    // no explicit stop. Music is not stopped on pause or onHide in the demo.
    audio.playMusic(assets.sound('game-music'));

    // Auto-save at the last reliable lifecycle moment on mobile: covers tab
    // close, tab switch and app backgrounding. Firing while the pause modal
    // is open is fine — capture works on a paused world.
    let disposables = new DisposableStack();
    let handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        writeSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    disposables.defer(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.visibilityDisposables = disposables;
  },
  onHide: (screen) => {
    // Auto-save before teardown: the world must still be alive when the
    // position is captured. This one choke point covers Quit-to-menu and any
    // future path away from the screen.
    writeSave();
    screen.state.visibilityDisposables?.dispose();
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.visibilityDisposables = null;
    teardownGameScreen({
      world,
      modal: screen.state.openModal,
      detachWorld: () => {
        screen.removeFromView(world);
      },
    });
    input.detach();
    // eslint-disable-next-line no-param-reassign -- needed
    screen.state.openModal = null;
  },
  onResize: (screen) => {
    screen.state.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
});
