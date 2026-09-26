import * as pixi from 'pixi.js';

import {GameScreen} from '../../engine/app/GameScreen.js';
import {Button} from '../../engine/ui/Button.js';
import {Container} from '../../engine/ui/Container.js';
import {Modal} from '../../engine/ui/Modal.js';
import {Panel} from '../../engine/ui/Panel.js';
import {Text} from '../../engine/ui/Text.js';
import {type Disposables} from '../../engine/utilities/Disposables.js';
import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {input} from '../core/input.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {applyStagedSave, writeSave} from '../core/save.js';
import {settings} from '../core/settings.js';
import {type UIEventMap, uiEvents} from '../core/uiEvents.js';
import {world} from '../core/world.js';
import {flushPendingTravel} from '../levels/levelManager.js';
// The worldScreen <-> mainMenuScreen static import cycle is deliberate and safe:
// each module reads the other's binding only inside event handlers (Quit to
// menu here, New Game there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {mainMenuScreen} from './mainMenuScreen.js';
import {openPauseMenu, teardownWorldScreen} from './pauseFlow.js';

type WorldScreenContents = {
  // Everything registered per show: the visibility listener and the travel
  // ticker callback. Scoped to a show/hide pair, not the screen's lifetime.
  disposables: Disposables<never, 'shown'>;
  hitCounter: Text;
  nameLabel: Text;
  openModal: Modal | null;
  pauseButton: Button;
};

let wallHitCount = 0;

// The pause menu is constructed per open (the reminder-dialog pattern): banner
// panel with a "Paused" title, Resume (initial focus), and Quit to menu.
function buildPauseModal(screen: GameScreen<WorldScreenContents, UIEventMap>): Modal {
  let resumeButton = new Button({
    theme: game.theme,
    children: [new Text({text: 'Resume', theme: game.theme, layout: true})],
    // The same close the cancel command calls; resuming lives in onClosing.
    onClick: () => {
      screen.contents.openModal?.close();
    },
  });
  let saveLabel = new Text({text: 'Save', theme: game.theme, layout: true});
  let saveButton = new Button({
    theme: game.theme,
    children: [saveLabel],
    onClick: () => {
      // Manual save under the pause modal: capture works on a paused world.
      writeSave();
      // Feedback on the kept reference (the hitCounter idiom); the modal is
      // rebuilt per open, so the label resets naturally.
      saveLabel.setText('Saved');
    },
  });
  let quitButton = new Button({
    theme: game.theme,
    children: [new Text({text: 'Quit to menu', theme: game.theme, layout: true})],
    onClick: () => {
      // The swap triggers this screen's onHide, which does the full teardown
      // (modal destroy + world stop + detach). showScreen never rejects; the menu bundle
      // is always loaded, so there is nothing here that can fail anyway.
      void game.showScreen(mainMenuScreen);
    },
  });
  let panel = new Panel({
    theme: game.theme,
    children: [
      new Text({text: 'Paused', theme: game.theme, layout: true}),
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
    // Shared by the Resume button and by Escape, and fired once per close:
    // the world unfreezes at close-start, behind the fading scrim, and can
    // never stay frozen behind a closed overlay.
    onClosing: () => {
      world.resume();
    },
    onClosed: () => {
      screen.contents.openModal = null;
    },
  });
}

// Called by the pause button and by the pause key and Escape (via onUpdate
// below); the ordering (pause first, then overlay) lives in openPauseMenu.
function openPauseModal(screen: GameScreen<WorldScreenContents, UIEventMap>): void {
  // One guard for every caller: a second open would call world.pause() on an already
  // paused world, which throws. Escape cannot reach here with the modal open (it is
  // dismissible, so onUpdate leaves the command to it), but the pause key and the HUD
  // button can, the button on a double tap that races the scrim.
  if (screen.contents.openModal !== null) {
    return;
  }

  openPauseMenu({
    world,
    openModal: () => {
      let modal = buildPauseModal(screen);

      screen.contents.openModal = modal;
      modal.open(screen.ui);
      modal.resize(
        screen.game.app.screen.width / screen.game.pixelScale,
        screen.game.app.screen.height / screen.game.pixelScale,
      );
    },
  });
}

export const worldScreen = new GameScreen<WorldScreenContents, UIEventMap>({
  // `default` for the HUD/pause-menu widgets, `game` for world assets — this is
  // what makes New Game show the loading screen while the game bundle is cold.
  assetBundles: ['default', 'game'],
  events: uiEvents,
  onFocusEvent: playFocusSound,
  onAttach: (screen): WorldScreenContents => {
    // Full-screen flex row: HUD texts top-left, pause button top-right. The
    // percentages resolve against game.view's root layout, so window resize is
    // handled by the existing root-layout resize path. The focus-ring overlay
    // and the modal stay out of the flow (no layout / position: absolute).

    screen.view.layout = {width: '100%', height: '100%'};

    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: 4,
    };

    let nameLabel = new Text({text: '', theme: game.theme, layout: true});
    let hitCounter = new Text({text: 'Wall hits: 0', theme: game.theme, layout: true});
    let hud = new Container({
      children: [nameLabel, hitCounter],
      layout: {flexDirection: 'column', alignItems: 'flex-start', gap: 1},
    });
    let pauseButton = new Button({
      theme: game.theme,
      // Text label — no icon asset exists yet; art can replace it later.
      children: [new Text({text: 'Pause', theme: game.theme, layout: true})],
      onClick: () => {
        openPauseModal(screen);
      },
    });

    screen.ui.addChild(hud, pauseButton);

    return {disposables: {shown: null}, hitCounter, nameLabel, openModal: null, pauseButton};
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();
    // Safe directly after start(): addEntity outside an update applies
    // synchronously, so playersQuery is already populated. A no-op without a
    // staged save (New Game).
    applyStagedSave();

    wallHitCount = 0;
    screen.contents.hitCounter.setText('Wall hits: 0');
    // Read fresh each show: Options is reachable only from the main menu and
    // runs are ephemeral, so the name cannot change mid-run. An empty name
    // renders an empty label.
    screen.contents.nameLabel.setText(settings.playerName);

    screen.subscribe('world:wallHit', () => {
      wallHitCount += 1;
      screen.contents.hitCounter.setText(`Wall hits: ${wallHitCount}`);
    });

    // Swap to the in-game track; the menu track (still playing through the
    // loading screen) is replaced by this single music voice — no silent gap,
    // no explicit stop. Music is not stopped on pause or onHide in the demo.
    audio.playMusic(assets.sound('game-music'));

    // Auto-save at the last reliable lifecycle moment on mobile: covers tab
    // close, tab switch and app backgrounding. Firing while the pause modal
    // is open is fine — capture works on a paused world.
    screen.contents.disposables.shown = new DisposableStack();

    let handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        writeSave();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    screen.contents.disposables.shown.defer(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    // The travel executor: HIGH priority runs before the world's NORMAL
    // update and the LOW-priority render, so a swap never straddles a frame.
    let runPendingTravel = () => {
      flushPendingTravel(world);
    };

    game.app.ticker.add(runPendingTravel, undefined, pixi.UPDATE_PRIORITY.HIGH);
    screen.contents.disposables.shown.defer(() => {
      game.app.ticker.remove(runPendingTravel, undefined);
    });
  },
  onHide: (screen) => {
    // Auto-save before teardown: the world must still be alive when the
    // position is captured. This one choke point covers Quit-to-menu and any
    // future path away from the screen.
    writeSave();
    screen.contents.disposables.shown?.dispose();
    screen.contents.disposables.shown = null;
    teardownWorldScreen({
      world,
      modal: screen.contents.openModal,
      detachWorld: () => {
        screen.removeFromView(world);
      },
    });

    screen.contents.openModal = null;
  },
  onResize: (screen) => {
    screen.contents.openModal?.resize(
      screen.game.app.screen.width / screen.game.pixelScale,
      screen.game.app.screen.height / screen.game.pixelScale,
    );
  },
  onUpdate: (ticker, screen) => {
    // The pause key works from anywhere; the cancel command opens the menu only
    // when there was nothing to dismiss, which is what the screen-level hook did.
    // focusPressed is a pure read of latched state, so the engine's cancel
    // routing reading it earlier this frame does not interfere.
    if (
      input.pressed('pause') ||
      (input.focusPressed('cancel') && screen.ui.topOverlay?.close === undefined)
    ) {
      openPauseModal(screen);
    }
  },
});
