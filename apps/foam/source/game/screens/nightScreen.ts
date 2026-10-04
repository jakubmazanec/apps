import {Button, GameScreen, type RunnableDialogueScript, Text} from 'tellurion';

import {samplePlace} from '../content/samplePlace.js';
import {game} from '../core/game.js';
import {
  BUTTON_HEIGHT,
  getSceneArea,
  LINE_HEIGHT,
  MARGIN,
  NARROW_WIDTH,
  type SceneArea,
} from '../core/getSceneArea.js';
import {getSpotPosition} from '../core/getSpotPosition.js';
import {measureText} from '../core/measureText.js';
import {createNight, formatStatus, type Night} from '../core/night.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {PlaceholderBackground} from './placeholderBackground.js';
import {StoryWindow} from './storyWindow.js';

type NightScreenContents = {
  background: PlaceholderBackground;
  night: Night;
  placeButton: Button;
  spotButtons: Button[];
  statusText: Text;
  storyWindow: StoryWindow | null;
};
type NightScreen = GameScreen<NightScreenContents>;

// A button's padding on both sides of its label, as in the theme.
const BUTTON_PADDING = 4;

function getButtonWidth(label: string): number {
  return measureText(label, 'label') + BUTTON_PADDING;
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
  let {background, spotButtons, statusText, storyWindow} = screen.contents;
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

  background.resize(area.width, area.top + area.height);
  storyWindow?.resize(area);
}

function openStory(screen: NightScreen, script: RunnableDialogueScript<Night>): void {
  if (screen.contents.storyWindow !== null) {
    return;
  }

  screen.contents.storyWindow = new StoryWindow({
    ui: screen.ui,
    scheduler: screen.scheduler,
    script,
    context: screen.contents.night,
    area: getArea(),
    onClosed: () => {
      screen.contents.storyWindow = null;
      writeStatus(screen);
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
      layout: {position: 'absolute', left: 0, top: 0, width: 0, height: LINE_HEIGHT},
    });
    // It does nothing yet: the menu it opens does not exist.
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
      background: new PlaceholderBackground(),
      night: createNight(),
      placeButton,
      spotButtons,
      statusText,
      storyWindow: null,
    };
  },
  onShow: (screen) => {
    screen.contents.night = createNight();
    writeStatus(screen);
    screen.addToView(screen.contents.background);
    layOut(screen);
    openStory(screen, samplePlace.description);
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide.
    screen.contents.storyWindow?.destroy();

    screen.contents.storyWindow = null;
    screen.removeFromView(screen.contents.background);
  },
  onUpdate: (ticker, screen) => {
    screen.contents.storyWindow?.update(ticker.deltaMS);
  },
  onResize: (screen) => {
    layOut(screen);
  },
});
