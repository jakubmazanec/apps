import {
  Button,
  GameScreen,
  type Modal,
  type Overlay,
  type RunnableDialogueScript,
  Text,
} from 'tellurion';

import {journeys} from '../content/journeys.js';
import {nightStart} from '../content/nightStart.js';
import {game} from '../core/game.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  getSceneArea,
  LINE_HEIGHT,
  MARGIN,
  type SceneArea,
  TOP_ROW_WIDTH,
} from '../core/getSceneArea.js';
import {getSpotPosition} from '../core/getSpotPosition.js';
import {input} from '../core/input.js';
import {measureText} from '../core/measureText.js';
import {createNight, formatStatus, type Night, type PlaceId} from '../core/night.js';
import {type Place} from '../core/place.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {takeJourney} from '../core/travel.js';
import {errorScreen} from './errorScreen.js';
// The nightScreen <-> mainMenuScreen static import cycle is deliberate and
// safe: each module reads the other's binding only inside a click handler
// (Quit to menu here, New Game there), long after both modules have evaluated.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves inside event handlers, long after both modules evaluate
import {mainMenuScreen} from './mainMenuScreen.js';
import {openMenuModal} from './menuModal.js';
import {openOptionsModal} from './optionsModal.js';
import {PlacePicture} from './placePicture.js';
import {StoryWindow} from './storyWindow.js';
import {TravelWindow} from './travelWindow.js';

type NightScreenContents = {
  /** Whether a story window has closed and the screen has not looked at the night since. */
  hasStoryClosed: boolean;

  /**
   * The topmost overlay at the end of the last update. As a rule it took this frame's cancel
   * command, unless a tap opened another overlay since.
   */
  lastTopOverlay: Overlay | null;

  menuButton: Button;
  menuModal: Modal | null;
  night: Night;
  optionsModal: Modal | null;

  /** The place being shown and its picture and buttons; `null` and empty while none is. */
  picture: PlacePicture | null;
  place: Place | null;
  placeButton: Button | null;
  spotButtons: Button[];

  statusText: Text;
  storyWindow: StoryWindow | null;

  /** From a way out's choice until its modal has closed. */
  travelWindow: TravelWindow | null;
};
type NightScreen = GameScreen<NightScreenContents>;

function getButtonWidth(label: string): number {
  return measureText(label, 'label') + 2 * BUTTON_PADDING_X;
}

function getPlaceLabel(place: Place): string {
  return place.shortName ?? place.name;
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
  let {picture, place, spotButtons, statusText, storyWindow, travelWindow} = screen.contents;
  let area = getArea();

  // Beside the place button, level with its label, or under it on a screen
  // narrower than the one-line top row. With no place shown, a wide screen
  // puts it where the place button stands.
  statusText.view.layout =
    area.width < TOP_ROW_WIDTH ?
      {left: MARGIN, top: MARGIN + BUTTON_HEIGHT + MARGIN}
    : {
        left: place === null ? MARGIN : MARGIN + getButtonWidth(getPlaceLabel(place)) + MARGIN,
        top: MARGIN + (BUTTON_HEIGHT - LINE_HEIGHT) / 2,
      };

  for (let [index, spot] of (place?.spots ?? []).entries()) {
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

  picture?.resize(area.width, area.top + area.height);
  storyWindow?.resize(area);
  travelWindow?.resize(area.width, area.top + area.height);
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
      // The screen looks at the night in its next update (see onUpdate).
      screen.contents.hasStoryClosed = true;
    },
  });

  screen.contents.storyWindow = storyWindow;
  screen.ui.addOverlay(storyWindow);
}

// Takes the place being shown off the screen. The screen behind is black,
// which is the game's background colour.
function leavePlace(screen: NightScreen): void {
  let {picture, placeButton, spotButtons} = screen.contents;
  let buttons = placeButton === null ? spotButtons : [placeButton, ...spotButtons];

  screen.ui.removeChild(...buttons);

  for (let button of buttons) {
    button.destroy();
  }

  if (picture !== null) {
    screen.removeFromView(picture);
    picture.destroy();
  }

  screen.contents.picture = null;
  screen.contents.place = null;
  screen.contents.placeButton = null;
  screen.contents.spotButtons = [];
}

// Builds the place's picture and buttons and opens its description. It runs
// only while no overlay is open, so the buttons go under the windows that
// open later, and the description is the topmost window.
function showPlace(screen: NightScreen, place: Place): void {
  leavePlace(screen);

  // The picture comes first: its constructor throws on a shader that does not
  // compile, and then nothing else of the place has been built.
  let picture = new PlacePicture({picture: place.picture});

  screen.addToView(picture);
  screen.contents.picture = picture;

  let label = getPlaceLabel(place);
  let placeButton = new Button({
    theme: game.theme,
    children: [createLabel(label)],
    layout: {
      position: 'absolute',
      left: MARGIN,
      top: MARGIN,
      width: getButtonWidth(label),
      height: BUTTON_HEIGHT,
    },
    onClick: () => {
      openStory(screen, place.description);
    },
  });
  // layOut() positions the scene buttons.
  let spotButtons = place.spots.map(
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

  // Tab follows the UI root's children, and UiRoot only appends, so the status
  // line and Menu go out and back in after the place button: Tab then keeps
  // reading order, the place button, Menu and the scene buttons. A new place
  // starts with nothing focused.
  screen.ui.removeChild(screen.contents.statusText, screen.contents.menuButton);
  screen.ui.addChild(
    placeButton,
    screen.contents.statusText,
    screen.contents.menuButton,
    ...spotButtons,
  );
  screen.contents.place = place;
  screen.contents.placeButton = placeButton;
  screen.contents.spotButtons = spotButtons;
  layOut(screen);
  // Showing a place clears a way out that a script chose together with it.
  screen.contents.night.leaving = null;
  writeStatus(screen);
  openStory(screen, place.description);
}

// Opens the travel window from the place being shown on the way a way out
// chose. It runs only while no overlay is open, so the window is the topmost.
function openTravel(
  screen: NightScreen,
  from: PlaceId,
  {way, ways}: NonNullable<Night['leaving']>,
): void {
  let area = getArea();

  screen.contents.travelWindow = new TravelWindow({
    ui: screen.ui,
    scheduler: screen.scheduler,
    start: nightStart,
    from,
    way,
    ways,
    screenWidth: area.width,
    screenHeight: area.top + area.height,
    onClosed: (destination) => {
      screen.contents.travelWindow = null;

      // Back and the cancel command leave the night as it was.
      if (destination === null) {
        return;
      }

      // The modal has left the UI, and nothing could open above it while it
      // faded, so the journey's window is the topmost. When that window has
      // closed, actOnNight shows the destination.
      takeJourney(screen.contents.night, destination);
      leavePlace(screen);
      writeStatus(screen);
      layOut(screen);
      openStory(screen, journeys[destination.way]);
    },
  });
}

// Looks at the night once a story window has closed. A script that moved the
// player shows the new place, and so does the end of a journey; a place the
// night does not have leaves the player where they are, with no way out. A way
// out that a script chose opens the travel window.
function actOnNight(screen: NightScreen): void {
  let {night, place} = screen.contents;

  if (place !== null && night.place === place.id) {
    if (night.leaving !== null) {
      openTravel(screen, place.id, night.leaving);
      night.leaving = null;
    }

    return;
  }

  let nextPlace = nightStart.places[night.place];

  if (nextPlace !== undefined) {
    showPlace(screen, nextPlace);
  } else if (place === null) {
    // Only a journey leaves no place shown, and it ends in a place of
    // nightStart. The error screen shows the impossible rather than a black
    // screen with no way on.
    throw new Error(`The journey ended in "${night.place}", which is not a place!`);
  } else {
    // eslint-disable-next-line no-console -- the running game reports a script's unknown place
    console.warn(`No place "${night.place}"; the night stays in "${place.id}".`);
    // The script's move is dropped as a whole: a way out chosen with it would
    // open the travel window at a later close that has nothing to do with it.
    night.place = place.id;
    night.leaving = null;
  }
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

    // The place's members are built when a place is shown (showPlace).
    screen.ui.addChild(statusText, menuButton);

    return {
      hasStoryClosed: false,
      lastTopOverlay: null,
      menuButton,
      menuModal: null,
      night: createNight(nightStart),
      optionsModal: null,
      picture: null,
      place: null,
      placeButton: null,
      spotButtons: [],
      statusText,
      storyWindow: null,
      travelWindow: null,
    };
  },
  // A place nightStart lacks is an error, which the error screen shows.
  onShow: (screen) => {
    let night = createNight(nightStart);

    screen.contents.night = night;
    screen.contents.hasStoryClosed = false;
    screen.contents.lastTopOverlay = null;
    writeStatus(screen);

    let place = nightStart.places[night.place];

    if (place === undefined) {
      throw new Error(`The night starts in "${night.place}", which is not a place!`);
    }

    showPlace(screen, place);
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide. The
    // topmost window goes first. A destroyed travel window reports no
    // destination: its onClosed does not fire.
    screen.contents.optionsModal?.destroy();
    screen.contents.menuModal?.destroy();
    screen.contents.travelWindow?.modal.destroy();
    screen.contents.storyWindow?.destroy();

    screen.contents.optionsModal = null;
    screen.contents.menuModal = null;
    screen.contents.travelWindow = null;
    screen.contents.storyWindow = null;
    leavePlace(screen);
  },
  onUpdate: (ticker, screen) => {
    // The story window, the travel window, the menu and the Options window are
    // all overlays.
    if (screen.contents.picture !== null) {
      screen.contents.picture.speed = screen.ui.topOverlay === null ? 1 : 0.5;
    }

    screen.contents.storyWindow?.update(ticker.deltaMS);

    // The night waits for every overlay to close: Escape in the fade of a
    // story window opens the menu above the closing window, and a place's
    // description or the travel window opened then would lie above the menu.
    // A hidden screen does nothing.
    if (
      screen.contents.hasStoryClosed &&
      screen.state === 'shown' &&
      screen.ui.topOverlay === null
    ) {
      screen.contents.hasStoryClosed = false;

      try {
        actOnNight(screen);
      } catch (error) {
        // A place's picture that does not compile, or a journey that ended in
        // no place, handled as the engine handles an error in a screen's
        // transition: the console keeps the details, which a production
        // build's error screen does not show. showScreen never rejects.
        // eslint-disable-next-line no-console -- the only record of the error in a production build
        console.error(error);
        errorScreen.contents.showError(error);
        void game.showScreen(errorScreen);
      }
    }

    // The engine has already sent this frame's cancel command to the topmost
    // overlay, which it closed if the overlay declares close: the menu, the
    // Options window or the travel window. With no overlay, or with a story
    // window on top, a journey's too, which declares none, the command opens
    // the menu. focusPressed only reads the latched state, so reading it again
    // here is safe. The overlay that took the command is, as a rule, the one on
    // top at the end of the last update, not the one on top now: a frame as long
    // as a UI fade can finish the closing of that overlay before this point. (A
    // tap that opened another overlay since then makes it a miss.) The overlay
    // is recorded after the rule, so the menu this rule opens is on record too.
    let {lastTopOverlay} = screen.contents;

    if (input.focusPressed('cancel') && lastTopOverlay?.close === undefined) {
      openMenu(screen);
    }

    screen.contents.lastTopOverlay = screen.ui.topOverlay;
  },
  onResize: (screen) => {
    layOut(screen);
  },
});
