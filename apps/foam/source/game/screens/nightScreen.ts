import {Button, GameScreen, type Modal, type RunnableDialogueScript, Text} from 'tellurion';

import {samplePlace} from '../content/samplePlace.js';
import {game} from '../core/game.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  LINE_HEIGHT,
  MARGIN,
  NARROW_WIDTH,
  type SceneArea,
} from '../core/getSceneArea.js';
import {getSpotPosition} from '../core/getSpotPosition.js';
import {input} from '../core/input.js';
import {measureText} from '../core/measureText.js';
import {createNight, formatStatus, type Night} from '../core/night.js';
import {playFocusSound} from '../core/playFocusSound.js';
// The nightScreen <-> mainMenuScreen static import cycle is deliberate and
// safe: each module reads the other's binding only inside a click handler
// (Quit to menu here, New Game there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {mainMenuScreen} from './mainMenuScreen.js';
import {openMenuModal} from './menuModal.js';
import {openOptionsModal} from './optionsModal.js';
import {PlacePicture} from './placePicture.js';
import {StoryWindow} from './storyWindow.js';

// The sample bar's start. Task 5 of the places plan replaces it with `nightStart`.
const SAMPLE_START = {place: 'train', minutes: 1180, money: 350} as const;

type NightScreenContents = {
  menuButton: Button;
  menuModal: Modal | null;
  night: Night;
  optionsModal: Modal | null;
  picture: PlacePicture;
  placeButton: Button;
  spotButtons: Button[];
  statusText: Text;
  storyWindow: StoryWindow | null;
};
type NightScreen = GameScreen<NightScreenContents>;

function getButtonWidth(label: string): number {
  return measureText(label, 'label') + 2 * BUTTON_PADDING_X;
}

// A label with an explicit size: a leaf sized by its own bounds is measured
// again later, and its button would move it then.
function createLabel(text: string): Text {
  return new Text({
    text,
    theme: game.theme,
    layout: {width: measureText(text, 'label'), height: LINE_HEIGHT},
  });
}

function getArea(): SceneArea {
  return getSceneArea(
    game.app.screen.width / game.pixelScale,
    game.app.screen.height / game.pixelScale,
  );
}

function writeStatus(screen: NightScreen): void {
  let status = formatStatus(screen.contents.night);

  screen.contents.statusText.setText(status);
  screen.contents.statusText.view.layout = {width: measureText(status, 'label')};
}

function layOut(screen: NightScreen): void {
  let {picture, spotButtons, statusText, storyWindow} = screen.contents;
  let area = getArea();

  // Beside the place button, level with its label, or under it on a narrow
  // screen.
  statusText.view.layout =
    area.width < NARROW_WIDTH ?
      {left: MARGIN, top: MARGIN + BUTTON_HEIGHT + MARGIN}
    : {
        left: MARGIN + getButtonWidth(samplePlace.name) + MARGIN,
        top: MARGIN + (BUTTON_HEIGHT - LINE_HEIGHT) / 2,
      };

  for (let [index, spot] of samplePlace.spots.entries()) {
    let button = spotButtons[index];

    if (button !== undefined) {
      button.view.layout = getSpotPosition({
        x: spot.x,
        y: spot.y,
        width: getButtonWidth(spot.label),
        height: BUTTON_HEIGHT,
        area,
      });
    }
  }

  picture.resize(area.width, area.top + area.height);
  storyWindow?.resize(area);
}

function openStory(screen: NightScreen, script: RunnableDialogueScript<Night>): void {
  if (screen.contents.storyWindow !== null) {
    return;
  }

  let storyWindow = new StoryWindow({
    scheduler: screen.scheduler,
    script,
    context: screen.contents.night,
    area: getArea(),
    onClosed: () => {
      screen.contents.storyWindow = null;
      writeStatus(screen);
    },
  });

  screen.contents.storyWindow = storyWindow;
  screen.ui.addOverlay(storyWindow);
}

// The menu also opens above a story window, whose text waits meanwhile. A
// hidden screen opens no menu: Quit to menu hides the screen inside its click,
// and an Escape in the same frame still reaches onUpdate, where the screen has
// no overlay left.
function openMenu(screen: NightScreen): void {
  if (screen.state !== 'shown' || screen.contents.menuModal !== null) {
    return;
  }

  screen.contents.menuModal = openMenuModal({
    ui: screen.ui,
    scheduler: screen.scheduler,
    onOptions: () => {
      screen.contents.optionsModal = openOptionsModal({
        ui: screen.ui,
        scheduler: screen.scheduler,
        onClosed: () => {
          screen.contents.optionsModal = null;
        },
      });
    },
    onQuit: () => {
      // The swap runs this screen's onHide, which destroys the menu.
      // showScreen never rejects; a failure lands on the error screen.
      void game.showScreen(mainMenuScreen);
    },
    onClosed: () => {
      screen.contents.menuModal = null;
    },
  });
}

export const nightScreen = new GameScreen<NightScreenContents>({
  assetBundles: ['default'],
  onFocusEvent: playFocusSound,
  onAttach: (screen): NightScreenContents => {
    // Everything on the scene has an absolute position, so the UI root needs
    // only a size. The percentages resolve against game.view.

    screen.view.layout = {width: '100%', height: '100%'};
    screen.ui.view.layout = {width: '100%', height: '100%'};

    let placeButton = new Button({
      theme: game.theme,
      children: [createLabel(samplePlace.name)],
      layout: {
        position: 'absolute',
        left: MARGIN,
        top: MARGIN,
        width: getButtonWidth(samplePlace.name),
        height: BUTTON_HEIGHT,
      },
      onClick: () => {
        openStory(screen, samplePlace.description);
      },
    });
    // layOut() positions it and writeStatus() sets its text and width.
    let statusText = new Text({
      text: '',
      theme: game.theme,
      fontFamily: 'monogram-outline',
      layout: {position: 'absolute', left: 0, top: 0, width: 0, height: LINE_HEIGHT},
    });
    let menuButton = new Button({
      theme: game.theme,
      children: [createLabel('Menu')],
      layout: {
        position: 'absolute',
        right: MARGIN,
        top: MARGIN,
        width: getButtonWidth('Menu'),
        height: BUTTON_HEIGHT,
      },
      onClick: () => {
        openMenu(screen);
      },
    });
    // layOut() positions the scene buttons.
    let spotButtons = samplePlace.spots.map(
      (spot) =>
        new Button({
          theme: game.theme,
          children: [createLabel(spot.label)],
          layout: {
            position: 'absolute',
            left: 0,
            top: 0,
            width: getButtonWidth(spot.label),
            height: BUTTON_HEIGHT,
          },
          onClick: () => {
            openStory(screen, spot.script);
          },
        }),
    );

    screen.ui.addChild(placeButton, statusText, menuButton, ...spotButtons);

    return {
      menuButton,
      menuModal: null,
      night: createNight(SAMPLE_START),
      optionsModal: null,
      picture: new PlacePicture({picture: samplePlace.picture}),
      placeButton,
      spotButtons,
      statusText,
      storyWindow: null,
    };
  },
  onShow: (screen) => {
    screen.contents.night = createNight(SAMPLE_START);
    writeStatus(screen);
    screen.addToView(screen.contents.picture);
    layOut(screen);
    openStory(screen, samplePlace.description);
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide. The
    // topmost window goes first.
    screen.contents.optionsModal?.destroy();
    screen.contents.menuModal?.destroy();
    screen.contents.storyWindow?.destroy();

    screen.contents.optionsModal = null;
    screen.contents.menuModal = null;
    screen.contents.storyWindow = null;
    screen.removeFromView(screen.contents.picture);
  },
  onUpdate: (ticker, screen) => {
    // The story window, the menu and the Options window are all overlays.
    screen.contents.picture.speed = screen.ui.topOverlay === null ? 1 : 0.5;
    screen.contents.storyWindow?.update(ticker.deltaMS);

    // The engine has already sent this frame's cancel command to the topmost
    // overlay, which it closed if the overlay declares close: the menu or the
    // Options window. With no overlay, or with a story window on top, which
    // declares none, the command opens the menu. focusPressed only reads the
    // latched state, so reading it again here is safe.
    if (input.focusPressed('cancel') && screen.ui.topOverlay?.close === undefined) {
      openMenu(screen);
    }
  },
  onResize: (screen) => {
    layOut(screen);
  },
});
