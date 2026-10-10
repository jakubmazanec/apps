import * as pixi from 'pixi.js';
import {
  Button,
  easeOutQuad,
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
import {isOpenAt} from '../core/hours.js';
import {input} from '../core/input.js';
import {type Location, type LocationId} from '../core/location.js';
import {measureText} from '../core/measureText.js';
import {createNight, formatStatus, type Night} from '../core/night.js';
import {type Place} from '../core/place.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {getLocation, takeJourney} from '../core/travel.js';
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
  /**
   * Dims the scene behind the story windows and the travel window, which draw no scrim, and turns
   * it black for a change of place. It lies in the UI root above the scene's members and under the
   * windows.
   */
  backdrop: pixi.Graphics;

  /** The alpha the backdrop shows or fades to. */
  backdropAlpha: number;

  /** Cancels the running fade of the backdrop. */
  cancelBackdropFade: (() => void) | null;

  /** Whether a story window has closed and the screen has not looked at the night since. */
  hasStoryClosed: boolean;

  /**
   * Whether the window that is closing ends where the place changes: a pick on the travel window,
   * a script that moved the player, or the end of a journey.
   */
  isPlaceChanging: boolean;

  /**
   * The topmost overlay at the end of the last update. As a rule it took this frame's cancel
   * command, unless a tap opened another overlay since.
   */
  lastTopOverlay: Overlay | null;

  menuButton: Button;
  menuModal: Modal | null;

  /**
   * The place the night has moved the player to, built while the window that moved them is open
   * (see prepareNextPlace); `null` while there is none.
   */
  nextPlace: PlaceParts | null;

  night: Night;
  optionsModal: Modal | null;

  /** The place being shown and its picture and buttons; `null` and empty while none is. */
  picture: PlacePicture | null;
  place: Place | null;
  placeButton: Button | null;
  spotButtons: Button[];

  /** The status line's text, as last written. */
  status: string;

  statusText: Text;
  storyWindow: StoryWindow | null;

  /**
   * Built once, when the screen is attached, and kept: a way out's choice opens it on the night's
   * journey, and closing takes its modal off the UI root without destroying it.
   */
  travelWindow: TravelWindow;
};
type NightScreen = GameScreen<NightScreenContents>;

/** A place's picture and buttons. */
type PlaceParts = {
  place: Place;
  picture: PlacePicture;
  placeButton: Button;
  spotButtons: Button[];
};

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

// It runs in every update, so it touches the text and the layout only when the
// status has changed.
function writeStatus(screen: NightScreen): void {
  let status = formatStatus(screen.contents.night);

  if (status === screen.contents.status) {
    return;
  }

  screen.contents.status = status;
  screen.contents.statusText.setText(status);
  screen.contents.statusText.view.layout = {width: measureText(status, 'label')};
}

function layOut(screen: NightScreen): void {
  let {nextPlace, picture, place, spotButtons, statusText, storyWindow, travelWindow} =
    screen.contents;
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
  nextPlace?.picture.resize(area.width, area.top + area.height);
  storyWindow?.resize(area);
  // Closed too: the kept window is laid out for the screen it opens on next.
  travelWindow.resize(area.width, area.top + area.height);
}

// Whether the travel window is on the UI root: opening, open or closing.
function isTravelWindowShown({contents}: NightScreen): boolean {
  return contents.travelWindow.modal.state !== 'closed';
}

// The scene is dimmed while the night is busy: a story window or the travel
// window is open or closing, or a story window has closed and the screen has not
// looked at the night yet. The next window opens in the same frame as the last
// one leaves, so the backdrop stays up from one window to the next and fades
// out only after the last one. It fades in with the first window's panel. A
// window that closes on a change of place takes the scene to black with it: the
// place being left fades out with the window, the next place is built under
// black, and it fades in with its description, as the journey does with its
// window.
function getBackdropAlpha(screen: NightScreen): number {
  let {contents} = screen;

  if (contents.isPlaceChanging) {
    return 1;
  }

  let isBusy =
    contents.storyWindow !== null || isTravelWindowShown(screen) || contents.hasStoryClosed;

  return isBusy ? game.theme.modal.scrimAlpha : 0;
}

// A hidden screen does nothing: Quit to menu by a key hides the screen inside
// its frame, after the scheduler was cleared, and a fade started then would
// outlive the night and light the next night's first description.
function fadeBackdrop(screen: NightScreen): void {
  if (screen.state !== 'shown') {
    return;
  }

  let {contents} = screen;
  let alpha = getBackdropAlpha(screen);

  if (alpha === contents.backdropAlpha) {
    return;
  }

  contents.backdropAlpha = alpha;
  contents.cancelBackdropFade?.();
  contents.cancelBackdropFade = screen.scheduler.tween({
    target: contents.backdrop,
    to: {alpha},
    duration: UI_FADE_DURATION,
    easing: easeOutQuad,
    onComplete: () => {
      contents.cancelBackdropFade = null;
    },
  });
}

// The place the night has moved the player to, when it is not the place shown
// and the night has it.
function getNextPlace({contents: {night, place}}: NightScreen): Place | undefined {
  return night.place === place?.id ? undefined : nightStart.places[night.place];
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
    // A script that moved the player, or the end of a journey: the scene goes
    // out with the window (see getBackdropAlpha).
    onClosing: () => {
      screen.contents.isPlaceChanging = getNextPlace(screen) !== undefined;
      fadeBackdrop(screen);
    },
    onClosed: () => {
      screen.contents.storyWindow = null;
      // The screen looks at the night in its next update (see onUpdate).
      screen.contents.hasStoryClosed = true;
    },
  });

  screen.contents.storyWindow = storyWindow;
  screen.ui.addOverlay(storyWindow);
  // The next place, or the journey, comes in from black with its window.
  screen.contents.isPlaceChanging = false;
  fadeBackdrop(screen);
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

// Builds a place's picture and buttons. The picture goes into the view hidden,
// and draws there until the place is shown; the buttons go into the UI then.
// The picture comes first: its constructor throws on a shader that does not
// compile, and then nothing else of the place has been built.
function buildPlace(screen: NightScreen, place: Place): PlaceParts {
  let picture = new PlacePicture({picture: place.picture});
  let area = getArea();

  picture.view.visible = false;
  picture.resize(area.width, area.top + area.height);
  screen.addToView(picture);

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

  return {place, picture, placeButton, spotButtons};
}

// Destroys the place built ahead: the night has moved elsewhere, or the screen
// is hidden.
function dropNextPlace(screen: NightScreen): void {
  let {nextPlace} = screen.contents;

  if (nextPlace === null) {
    return;
  }

  for (let button of [nextPlace.placeButton, ...nextPlace.spotButtons]) {
    button.destroy();
  }

  screen.removeFromView(nextPlace.picture);
  nextPlace.picture.destroy();
  screen.contents.nextPlace = null;
}

// Builds the place the night has moved the player to while the window that
// moved them is open, a script's or a journey's, so that the frame that shows
// it after the window costs little. That frame lies on black (see
// getBackdropAlpha): a slow one would hold the black, and the ticker counts up
// to 100 ms of it into the next frame, which would end the fade-in in one
// step. The window is fully shown first, so that a slow frame does not cut its
// own fade-in short. A place that the night does not lead to any more is
// dropped. A hidden screen does nothing.
function prepareNextPlace(screen: NightScreen): void {
  let {nextPlace, storyWindow} = screen.contents;
  let place = getNextPlace(screen);

  if (screen.state !== 'shown' || storyWindow?.state !== 'open' || place === nextPlace?.place) {
    return;
  }

  dropNextPlace(screen);

  if (place !== undefined) {
    screen.contents.nextPlace = buildPlace(screen, place);
  }
}

// Shows a place, built ahead or now, and opens its description. It runs only
// while no overlay is open, so the buttons go under the windows that open
// later, and the description is the topmost window.
function showPlace(screen: NightScreen, place: Place): void {
  let parts = screen.contents.nextPlace;

  if (parts?.place !== place) {
    dropNextPlace(screen);
    parts = buildPlace(screen, place);
  }

  let {picture, placeButton, spotButtons} = parts;

  screen.contents.nextPlace = null;
  leavePlace(screen);
  picture.view.visible = true;
  screen.contents.picture = picture;

  // Tab follows the UI root's children, and UiRoot only appends, so the status
  // line and Menu go out and back in after the place button: Tab then keeps
  // reading order, the place button, Menu and the scene buttons. A new place
  // starts with nothing focused. The backdrop goes back in last, above the
  // scene; no window is open, so the windows come after it.
  screen.ui.removeChild(
    screen.contents.statusText,
    screen.contents.menuButton,
    screen.contents.backdrop,
  );
  screen.ui.addChild(
    placeButton,
    screen.contents.statusText,
    screen.contents.menuButton,
    ...spotButtons,
    screen.contents.backdrop,
  );
  screen.contents.place = place;
  screen.contents.placeButton = placeButton;
  screen.contents.spotButtons = spotButtons;
  layOut(screen);
  // Showing a place clears a way out that a script chose together with it.
  screen.contents.night.leaving = null;
  openStory(screen, place.description);
}

// Builds the travel window, once, when the screen is attached: every control and
// both map layers, so that a journey only fills it (see openTravel). A pick
// takes the player away: the scene goes out with the window.
function createTravelWindow(screen: NightScreen): TravelWindow {
  let area = getArea();

  return new TravelWindow({
    ui: screen.ui,
    scheduler: screen.scheduler,
    start: nightStart,
    screenWidth: area.width,
    screenHeight: area.top + area.height,
    onClosing: (destination) => {
      screen.contents.isPlaceChanging = destination !== null;
      fadeBackdrop(screen);
    },
    onClosed: (destination) => {
      // Back and the cancel command leave the night as it was.
      if (destination === null) {
        return;
      }

      // The modal has left the UI, and nothing could open above it while it
      // faded, so the journey's window is the topmost. The place leaves under
      // black. When that window has closed, actOnNight shows the destination.
      takeJourney(nightStart, screen.contents.night, destination);
      leavePlace(screen);
      layOut(screen);
      openStory(screen, journeys[destination.way]);
    },
  });
}

// The location of a place of nightStart. The checker holds every place to one
// location; a place in none is an error, which the error screen shows rather
// than a travel window from nowhere.
function getLocationOf(place: Place): Location {
  let location = getLocation(nightStart, place.id);

  if (location === undefined) {
    throw new Error(`The place "${place.id}" is in no location!`);
  }

  return location;
}

// Opens the travel window from the location of the place being shown on the
// way a way out chose. It runs only while no overlay is open, so the window is
// the topmost.
function openTravel(
  screen: NightScreen,
  from: LocationId,
  {way, ways}: NonNullable<Night['leaving']>,
): void {
  screen.contents.travelWindow.open({from, way, ways, night: screen.contents.night});
  fadeBackdrop(screen);
}

// Runs the closing of the location the player is in and puts them outside. The
// place changes before the window opens, as a script's onEnter changes it: the
// outside is built while the closing is open (prepareNextPlace), the window
// closes into black (onClosing sees the change), and actOnNight then shows the
// outside with its description. The checker holds a location with hours to a
// closing and an outside; one that lacks either is an error, which the error
// screen shows.
function closeLocation(screen: NightScreen, location: Location): void {
  let {closing, id, outside} = location;

  if (closing === undefined || outside === undefined) {
    throw new Error(`"${id}" has closed with no closing script or no outside!`);
  }

  screen.contents.night.place = outside;
  openStory(screen, closing);
}

// Looks at the night once a story window has closed. A script that moved the
// player shows the new place, and so does the end of a journey; a place the
// night does not have leaves the player where they are, with no way out. A way
// out that a script chose opens the travel window. A location that is closed
// with the player indoors closes on them, after any window: a beer that ran
// past the hour, the description of a room that a door led into too late. The
// order is a place the night moved the player to, then a way out, then the
// closing; a way out exists only outdoors and a closing only indoors, so the
// last two never meet.
function actOnNight(screen: NightScreen): void {
  let {night, place} = screen.contents;

  if (place !== null && night.place === place.id) {
    if (night.leaving !== null) {
      openTravel(screen, getLocationOf(place).id, night.leaving);
      night.leaving = null;
    } else if (!place.outdoors) {
      let location = getLocationOf(place);

      if (!isOpenAt(nightStart.locationData[location.id]?.hours, night.minutes)) {
        closeLocation(screen, location);
      }
    }

    return;
  }

  let nextPlace = getNextPlace(screen);

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
    // The same scrim as a Modal's. It takes no taps: the windows' own layers do.
    let backdrop = new pixi.Graphics();

    backdrop.rect(0, 0, 1, 1).fill(game.theme.modal.scrimColor);
    backdrop.alpha = 0;
    backdrop.eventMode = 'none';
    backdrop.layout = {position: 'absolute', left: 0, top: 0, width: '100%', height: '100%'};

    // The place's members are built when a place is shown (showPlace).
    screen.ui.addChild(statusText, menuButton, backdrop);

    return {
      backdrop,
      backdropAlpha: 0,
      cancelBackdropFade: null,
      hasStoryClosed: false,
      isPlaceChanging: false,
      lastTopOverlay: null,
      menuButton,
      menuModal: null,
      nextPlace: null,
      night: createNight(nightStart),
      optionsModal: null,
      picture: null,
      place: null,
      placeButton: null,
      spotButtons: [],
      status: '',
      statusText,
      storyWindow: null,
      travelWindow: createTravelWindow(screen),
    };
  },
  // A place nightStart lacks is an error, which the error screen shows.
  onShow: (screen) => {
    let night = createNight(nightStart);

    screen.contents.night = night;
    screen.contents.hasStoryClosed = false;
    screen.contents.lastTopOverlay = null;
    writeStatus(screen);
    // The place appears under its description, so it is dimmed from its first
    // frame. Hiding the screen cleared the scheduler and the fade with it.
    screen.contents.backdrop.alpha = game.theme.modal.scrimAlpha;
    screen.contents.backdropAlpha = game.theme.modal.scrimAlpha;
    screen.contents.cancelBackdropFade = null;
    screen.contents.isPlaceChanging = false;

    let place = nightStart.places[night.place];

    if (place === undefined) {
      throw new Error(`The night starts in "${night.place}", which is not a place!`);
    }

    showPlace(screen, place);
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide. The
    // topmost window goes first. The travel window is kept for the next night:
    // its modal only leaves the UI root, and reports no destination, as its
    // onClosed does not fire.
    screen.contents.optionsModal?.destroy();
    screen.contents.menuModal?.destroy();

    if (isTravelWindowShown(screen)) {
      screen.ui.removeOverlay(screen.contents.travelWindow.modal);
    }

    screen.contents.storyWindow?.destroy();

    screen.contents.optionsModal = null;
    screen.contents.menuModal = null;
    screen.contents.storyWindow = null;
    leavePlace(screen);
    dropNextPlace(screen);
  },
  onUpdate: (ticker, screen) => {
    // The story window, the travel window, the menu and the Options window are
    // all overlays.
    if (screen.contents.picture !== null) {
      screen.contents.picture.speed = screen.ui.topOverlay === null ? 1 : 0.5;
    }

    screen.contents.storyWindow?.update(ticker.deltaMS);
    // The status line follows the night while a window is open: a choice, an
    // onEnter and a journey show on it at once.
    writeStatus(screen);

    try {
      prepareNextPlace(screen);

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
        actOnNight(screen);
      }
    } catch (error) {
      // A place's picture that does not compile, a journey that ended in no
      // place, a place in no location, or a location that closes with no
      // closing script or no outside, handled as the engine handles an error
      // in a screen's transition: the console keeps the details, which a production build's
      // error screen does not show. showScreen never rejects, and it hides
      // this screen at once, so the error does not come again.
      // eslint-disable-next-line no-console -- the only record of the error in a production build
      console.error(error);
      errorScreen.contents.showError(error);
      void game.showScreen(errorScreen);
    }

    // The last window has left, or Back or the cancel command closed the travel
    // window.
    fadeBackdrop(screen);

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
