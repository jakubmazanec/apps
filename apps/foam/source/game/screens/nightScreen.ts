import * as pixi from 'pixi.js';
import {
  Button,
  easeOutQuad,
  GameScreen,
  type Modal,
  type RunnableDialogueScript,
  type Text,
  type UiOverlayComponent,
} from 'tellurion';

import {journeys} from '../content/journeys.js';
import {nightEnd} from '../content/nightEnd.js';
import {nightStart} from '../content/nightStart.js';
import {messages} from '../content/phone/index.js';
import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {SEPARATOR} from '../core/contentPath.js';
import {game} from '../core/game.js';
import {
  BUTTON_HEIGHT,
  getTextWidth,
  LINE_HEIGHT,
  MARGIN,
  TOP_ROW_WIDTH,
} from '../core/getSceneArea.js';
import {getSpotPosition} from '../core/getSpotPosition.js';
import {isNightOver, isOpenAt} from '../core/hours.js';
import {type Location, type LocationId} from '../core/location.js';
import {logChoice} from '../core/log.js';
import {createNight, formatStatus, type Night, restoreNight} from '../core/night.js';
import {recordNight} from '../core/nights.js';
import {
  dropStaleMessages,
  dropUnknownMessages,
  getUnreadMessage,
  readMessage,
  receiveMessages,
} from '../core/phone.js';
import {type Place} from '../core/place.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {clearSavedNight, type SavedNight, saveNight} from '../core/save.js';
import {collection, reloadCollection, saveCollection} from '../core/stories.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {todaySeed} from '../core/todaySeed.js';
import {formatTravel, getLocation, takeJourney} from '../core/travel.js';
import {errorScreen} from './errorScreen.js';
// The nightScreen -> logScreen -> menuModal -> mainMenuScreen -> nightScreen
// static import cycle is deliberate and safe: no module reads another's binding
// while it evaluates, only as the game runs. This screen reads the log screen
// when the night ends, the log screen calls the menu's functions from its Menu
// button, its update and its hide, the menu reads the main menu in Quit to
// menu's click, and the main menu reads this screen in New Game's and Continue's clicks.
// eslint-disable-next-line import/no-cycle -- see comment above: the cycle only resolves as the game runs, long after the modules evaluate
import {logScreen} from './logScreen.js';
// The nightScreen -> menuModal -> mainMenuScreen -> nightScreen static import
// cycle is deliberate and safe: no module reads another's binding while it
// evaluates, only as the game runs. This screen calls the menu's functions from
// its Menu button, its update and its hide, the menu reads the main menu in
// Quit to menu's click, and the main menu reads this screen in New Game's and Continue's clicks.
// import/no-cycle reports it at the log screen's import above: the rule walks
// each module once per file, and it reached the menu through the log screen.
import {destroyMenus, openMenu, openMenuOnCancel} from './menuModal.js';
import {PlacePicture} from './placePicture.js';
import {type StoriesWindow} from './storiesWindow.js';
import {StoryWindow} from './storyWindow.js';
import {Toast} from './toast.js';
import {
  createLabel,
  createMenuButton,
  createPhoneButton,
  createStatusText,
  getArea,
  getButtonWidth,
  setPhoneCount,
  setStatus,
} from './topRow.js';
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

  /** Whether the end text has opened: the night is over, and the next close shows the log. */
  hasEnded: boolean;

  /** Whether a story window has closed and the screen has not looked at the night since. */
  hasStoryClosed: boolean;

  /**
   * Whether the window that is closing ends where the place changes: a pick on the travel window,
   * a script that moved the player, the end of a journey, or a window that closes on a night that
   * is over.
   */
  isPlaceChanging: boolean;

  /**
   * The topmost overlay at the end of the last update. As a rule it took this frame's cancel
   * command, unless a tap opened another overlay since.
   */
  lastTopOverlay: UiOverlayComponent | null;

  menuButton: Button;
  menuModal: Modal | null;

  /**
   * The place the night has moved the player to, built while the window that moved them is open
   * (see prepareNextPlace); `null` while there is none.
   */
  nextPlace: PlaceParts | null;

  night: Night;
  optionsModal: Modal | null;

  /** The Phone button in the bottom row, built once with the screen. */
  phoneButton: Button;

  /** The count the button shows, as last written. */
  phoneCount: number;

  /** The place being shown and its picture and buttons; `null` and empty while none is. */
  picture: PlacePicture | null;
  place: Place | null;
  placeButton: Button | null;
  spotButtons: Button[];

  /**
   * The key of the message whose window is open, for the window's end to mark it read; null
   * otherwise.
   */
  reading: string | null;

  /**
   * The saved night Continue hands over for the next show, which reads and empties it; null for a
   * fresh night.
   */
  resuming: SavedNight | null;

  /** The status line's text, as last written. */
  status: string;

  statusText: Text;

  /** How many of the night's finds the screen has handled: shown or queued. */
  storiesHandled: number;

  storiesWindow: StoriesWindow | null;
  storyWindow: StoryWindow | null;

  /** The toast showing, or null. */
  toast: Toast | null;

  /**
   * The toasts waiting, in order: a find's "A story" and its title, an arrival's "A message" and
   * its sender.
   */
  toastQueue: Array<{heading: string; title: string}>;

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

function getPlaceLabel(place: Place): string {
  return place.shortName ?? place.name;
}

// It runs in every update, so it touches the text and the layout only when the
// status has changed.
function writeStatus(screen: NightScreen): void {
  let status = formatStatus(screen.contents.night);

  if (status === screen.contents.status) {
    return;
  }

  screen.contents.status = status;
  setStatus(screen.contents.statusText, status);
}

// As writeStatus, it runs in every update, so it touches the button only when
// the count has changed.
function writePhoneCount(screen: NightScreen): void {
  let count = screen.contents.night.phone.unread.length;

  if (count === screen.contents.phoneCount) {
    return;
  }

  screen.contents.phoneCount = count;
  setPhoneCount(screen.contents.phoneButton, count);
}

// Shows the toast at the bottom of the screen, last on the UI root, so it lies
// above the story window, the backdrop, the travel window and the Menu button.
// Once it has faded out, the next title in the queue gets its toast in the next
// update (see handleStories).
function showToast(screen: NightScreen, {heading, title}: {heading: string; title: string}): void {
  let toast = new Toast({
    scheduler: screen.scheduler,
    heading,
    title,
    textWidth: getTextWidth(getArea().width),
    onDone: () => {
      screen.ui.removeChild(toast);
      toast.destroy();
      screen.contents.toast = null;
    },
  });

  screen.contents.toast = toast;
  screen.ui.addChild(toast);
  toast.show();
}

// Queues a toast for each story the night has found since the last update, and
// shows the next one when none is showing. A hidden screen shows none. The
// collection is saved with the night when a window's text ends (see openStory).
function handleStories(screen: NightScreen): void {
  let {contents, state} = screen;

  // Compared each frame, as the status string is.
  while (contents.storiesHandled < contents.night.stories.length) {
    contents.toastQueue.push({
      heading: 'A story',
      title: contents.night.stories[contents.storiesHandled]!.title,
    });
    contents.storiesHandled += 1;
  }

  if (contents.toast === null && contents.toastQueue.length > 0 && state === 'shown') {
    showToast(screen, contents.toastQueue.shift()!);
  }
}

// Hides and shows the place's buttons by their conditions on the night, in place: a hidden button
// keeps its position, leaves the Tab order by itself, and comes back where it was. A button whose
// spot has no condition always shows. A focus on a button that hides is dropped with the ring,
// which would otherwise stay drawn for the hidden button, and the next Tab starts over. The focus
// is on a scene button only while no overlay is open, so clearing it drops no window's focus scope.
function showSpots(screen: NightScreen): void {
  let {night, place, spotButtons} = screen.contents;

  for (let [index, spot] of (place?.spots ?? []).entries()) {
    let button = spotButtons[index];

    if (button !== undefined) {
      button.view.visible = spot.isVisible?.(night) ?? true;

      if (!button.view.visible && screen.ui.focused === button) {
        screen.ui.clearFocus();
      }
    }
  }
}

function layOut(screen: NightScreen): void {
  let {
    nextPlace,
    picture,
    place,
    spotButtons,
    statusText,
    storiesWindow,
    storyWindow,
    toast,
    travelWindow,
  } = screen.contents;
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

  picture?.resize(area.width, area.screenHeight);
  nextPlace?.picture.resize(area.width, area.screenHeight);
  storyWindow?.resize(area);
  storiesWindow?.resize();
  toast?.resize(getTextWidth(area.width));
  // Closed too: the kept window is laid out for the screen it opens on next.
  travelWindow.resize(area.width, area.screenHeight);
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
// window. A window that closes on a night that is over goes out to black too,
// and the end text comes in from black.
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
// and the night has it. None once the night is over: the end text comes next,
// and no place is built behind the window that crossed 08:00.
function getNextPlace({contents: {night, place}}: NightScreen): Place | undefined {
  if (isNightOver(night)) {
    return undefined;
  }

  return night.place === place?.id ? undefined : nightStart.places[night.place];
}

function openStory(
  screen: NightScreen,
  script: RunnableDialogueScript<Night>,
  where: string,
): void {
  if (screen.contents.storyWindow !== null) {
    return;
  }

  let storyWindow = new StoryWindow({
    scheduler: screen.scheduler,
    script,
    context: screen.contents.night,
    area: getArea(),
    where,
    // A script that moved the player, the end of a journey, or a window that
    // closes on a night that is over: the scene goes out with the window (see
    // getBackdropAlpha).
    onClosing: () => {
      screen.contents.isPlaceChanging =
        getNextPlace(screen) !== undefined || isNightOver(screen.contents.night);
      fadeBackdrop(screen);

      // A message counts as read when its window's text ends, where the night
      // is saved, so a quit mid-window leaves it unread.
      if (screen.contents.reading !== null) {
        readMessage(screen.contents.night, screen.contents.reading);
        screen.contents.reading = null;
      }

      // The window calls it when its text has ended, so the last choice's
      // effects, the last node's entry effect and the last page's log line are
      // in the night, and the window's fade has not begun. A save that waited for
      // every overlay to close would lose a finished window to Escape in the
      // fade and then Quit, since the menu opens above a closing window.
      saveNight(screen.contents.night);
      saveCollection();
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

// Opens the oldest unread message and notes its key in reading. With none, or
// with a story window open, it does nothing: openStory would open nothing then
// either, and reading would name a message no window shows.
function openPhone(screen: NightScreen): void {
  let message = getUnreadMessage(screen.contents.night, messages);

  if (message === undefined || screen.contents.storyWindow !== null) {
    return;
  }

  screen.contents.reading = message.key;
  openStory(screen, message.script, `phone${SEPARATOR}${message.key}`);
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
  picture.resize(area.width, area.screenHeight);
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
      openStory(screen, place.description, `${place.id}${SEPARATOR}description`);
    },
  });
  // layOut() positions the scene buttons, and showSpots() hides those whose condition does not
  // hold; a place built ahead has every button visible until it is shown.
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
          openStory(screen, spot.script, `${place.id}${SEPARATOR}${spot.label}`);
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
  // line and Menu go out and back in after the place button, and Phone after the
  // scene buttons: Tab then keeps reading order, the place button, Menu, the
  // scene buttons and Phone. A new place starts with nothing focused. The
  // backdrop goes back in last, above the scene; no window is open, so the
  // windows come after it.
  screen.ui.removeChild(
    screen.contents.statusText,
    screen.contents.menuButton,
    screen.contents.phoneButton,
    screen.contents.backdrop,
  );
  screen.ui.addChild(
    placeButton,
    screen.contents.statusText,
    screen.contents.menuButton,
    ...spotButtons,
    screen.contents.phoneButton,
    screen.contents.backdrop,
  );

  // A toast still showing goes back in after them, so it stays on top through
  // the fade to black.
  if (screen.contents.toast !== null) {
    screen.ui.removeChild(screen.contents.toast);
    screen.ui.addChild(screen.contents.toast);
  }

  screen.contents.place = place;
  screen.contents.placeButton = placeButton;
  screen.contents.spotButtons = spotButtons;
  layOut(screen);
  showSpots(screen);
  // Showing a place clears a way out that a script chose together with it.
  screen.contents.night.leaving = null;
  openStory(screen, place.description, `${place.id}${SEPARATOR}description`);
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
    screenHeight: area.screenHeight,
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
      // The travel is logged at the minute of departure; the journey's window
      // logs its text at the minute of arrival.
      logChoice(screen.contents.night, formatTravel(destination));
      takeJourney(nightStart, screen.contents.night, destination);
      // The change of place, saved before the journey's window opens: a
      // journey is never undone by a quit. Back saves nothing.
      saveNight(screen.contents.night);
      leavePlace(screen);
      layOut(screen);
      openStory(screen, journeys[destination.way], `journeys${SEPARATOR}${destination.way}`);
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
  openStory(screen, closing, `${id}${SEPARATOR}closing`);
}

// Takes back the unread messages whose conditions no longer hold, moves the
// messages whose conditions hold now to the unread list, queues a toast for
// each and plays the chime once if any arrived.
function receiveArrivals(screen: NightScreen): void {
  dropStaleMessages(screen.contents.night, messages);

  let arrived = receiveMessages(screen.contents.night, messages);

  for (let {from} of arrived) {
    screen.contents.toastQueue.push({heading: 'A message', title: from});
  }

  if (arrived.length > 0) {
    audio.play(assets.sound('phone'), {bus: 'ui'});
  }
}

// Looks at the night once a story window has closed. A night that is over takes
// the place off the screen and opens the end text over black, and when that has
// closed the log screen takes over; a way out the night still holds is ignored
// then. A script that moved the player shows the new place, and so does the end
// of a journey; a place the night does not have leaves the player where they
// are, with no way out, and the night is looked at as if they had not moved. A
// way out that a script chose opens the travel window. A location that is
// closed with the player indoors closes on them, after any window: a beer that
// ran past the hour, the description of a room that a door led into too late.
// The order is the end, then the arrivals, then a place the night moved the
// player to, then a way out, then the closing. The end comes first, so a travel
// that arrives after 08:00 never shows its destination, and a closing never
// runs on the close that ends the night. A way out exists only outdoors and a
// closing only indoors, so the last two never meet. It is also called directly
// when a saved night is shown.
// At every look the place's buttons with a condition are hidden or shown by the
// night as it stands, after the arrivals and before the way out and the closing.
function actOnNight(screen: NightScreen): void {
  let {hasEnded, night, place} = screen.contents;

  if (isNightOver(night)) {
    if (hasEnded) {
      // A night is recorded once, when its Morning text has been read through.
      // The save the Morning text's own closing wrote is cleared here a moment
      // later.
      recordNight(night, todaySeed());
      clearSavedNight();
      logScreen.contents.showLog(night);
      // showScreen never rejects; a failure lands on the error screen.
      void game.showScreen(logScreen);
    } else {
      screen.contents.hasEnded = true;
      leavePlace(screen);
      layOut(screen);
      openStory(screen, nightEnd, 'end');
    }

    return;
  }

  // Right after the check that the night is over, before anything else: a
  // night that is over receives nothing.
  receiveArrivals(screen);

  if (place !== null && night.place !== place.id && getNextPlace(screen) === undefined) {
    // eslint-disable-next-line no-console -- the running game reports a script's unknown place
    console.warn(`No place "${night.place}"; the night stays in "${place.id}".`);
    // The script's move is dropped as a whole: a way out chosen with it would
    // open the travel window at a later close that has nothing to do with it.
    // The buttons and the closing still follow the clock the window moved.
    night.place = place.id;
    night.leaving = null;
  }

  if (place !== null && night.place === place.id) {
    showSpots(screen);

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

  if (nextPlace === undefined) {
    // Only a journey or a resume leaves no place shown, and both lead to a
    // place of nightStart, the saved one checked by its loader. The error screen
    // shows the impossible rather than a black screen with no way on.
    throw new Error(`The night is in "${night.place}", which is not a place!`);
  }

  showPlace(screen, nextPlace);
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
    let statusText = createStatusText();
    let menuButton = createMenuButton(() => {
      openMenu(screen);
    });
    let phoneButton = createPhoneButton(() => {
      openPhone(screen);
    });
    // The same scrim as a Modal's. It takes no taps: the windows' own layers do.
    let backdrop = new pixi.Graphics();

    backdrop.rect(0, 0, 1, 1).fill(game.theme.modal.scrimColor);
    backdrop.alpha = 0;
    backdrop.eventMode = 'none';
    backdrop.layout = {position: 'absolute', left: 0, top: 0, width: '100%', height: '100%'};

    // The place's members are built when a place is shown (showPlace).
    screen.ui.addChild(statusText, menuButton, phoneButton, backdrop);

    return {
      backdrop,
      backdropAlpha: 0,
      cancelBackdropFade: null,
      hasEnded: false,
      hasStoryClosed: false,
      isPlaceChanging: false,
      lastTopOverlay: null,
      menuButton,
      menuModal: null,
      nextPlace: null,
      night: createNight(nightStart, collection),
      optionsModal: null,
      phoneButton,
      phoneCount: 0,
      picture: null,
      place: null,
      placeButton: null,
      spotButtons: [],
      reading: null,
      resuming: null,
      status: '',
      statusText,
      storiesHandled: 0,
      storiesWindow: null,
      storyWindow: null,
      toast: null,
      toastQueue: [],
      travelWindow: createTravelWindow(screen),
    };
  },
  // A place nightStart lacks is an error, which the error screen shows.
  onShow: (screen) => {
    let saved = screen.contents.resuming;
    let night =
      saved === null ? createNight(nightStart, collection) : restoreNight(saved, collection);

    screen.contents.resuming = null;
    screen.contents.night = night;
    screen.contents.hasEnded = false;
    screen.contents.hasStoryClosed = false;
    screen.contents.lastTopOverlay = null;
    screen.contents.reading = null;
    // A resumed night queues no toast for its finds.
    screen.contents.storiesHandled = night.stories.length;
    // None is showing: hiding the screen destroyed it.
    screen.contents.toast = null;
    screen.contents.toastQueue = [];
    writeStatus(screen);
    writePhoneCount(screen);
    // The place appears under its description, so it is dimmed from its first
    // frame. Hiding the screen cleared the scheduler and the fade with it.
    screen.contents.backdrop.alpha = game.theme.modal.scrimAlpha;
    screen.contents.backdropAlpha = game.theme.modal.scrimAlpha;
    screen.contents.cancelBackdropFade = null;
    screen.contents.isPlaceChanging = false;

    if (saved !== null) {
      // A saved night may hold a key the content has dropped since.
      dropUnknownMessages(night, messages);
      // With no place shown, actOnNight does the right thing for every state a
      // save can hold. A night that is over opens the end text over black: its
      // Morning lines were never saved, so the log doubles nothing, and when it
      // ends the night is recorded and the save cleared. A place a script
      // changed, or a journey's destination, is the saved place, and showPlace
      // opens it under its description; a journey's own text is not shown again
      // and was never logged, as the pick was logged and paid. With nothing
      // pending, the saved place opens under its description, logged once more
      // at the saved minute. A location closed on the player shows the room
      // under its description, then its closing when the description closes, as
      // live. The call is direct rather than through hasStoryClosed, so the
      // first frame is not black and the flag keeps the meaning its comment
      // gives it.
      actOnNight(screen);

      return;
    }

    let place = nightStart.places[night.place];

    if (place === undefined) {
      throw new Error(`The night starts in "${night.place}", which is not a place!`);
    }

    showPlace(screen, place);
  },
  onHide: (screen) => {
    // Owning-screen teardown rule: synchronous destroy(), never the animated
    // close(), because the scheduler was already cleared before onHide. The
    // topmost window goes first: the menus, then the windows of the night. The
    // travel window is kept for the next night: its modal only leaves the UI
    // root, and reports no destination, as its onClosed does not fire.
    destroyMenus(screen);

    if (isTravelWindowShown(screen)) {
      screen.ui.removeOverlay(screen.contents.travelWindow.modal);
    }

    screen.contents.storyWindow?.destroy();

    screen.contents.storyWindow = null;

    if (screen.contents.toast !== null) {
      screen.ui.removeChild(screen.contents.toast);
      screen.contents.toast.destroy();
    }

    // The next show lays the screen out before onShow, so no destroyed toast
    // is left for layOut to resize.
    screen.contents.toast = null;
    screen.contents.toastQueue = [];
    // Read back from the store in place, so every night that holds it sees the
    // stored titles: a find in an abandoned window is undone with the night.
    // With no window open the store already equals the object, so the call is
    // unconditional.
    reloadCollection();
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
    writePhoneCount(screen);
    handleStories(screen);

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

    // Escape with no overlay that takes it opens the menu, above a story window
    // too (see openMenuOnCancel).
    openMenuOnCancel(screen);
  },
  onResize: (screen) => {
    layOut(screen);
  },
});
