import {
  Button,
  Container,
  Modal,
  Panel,
  type Scheduler,
  Text,
  type UiRoot,
  wrapText,
} from 'tellurion';

import {fitMapFrame, MAP_INSET, type MapFrame, toMapPixel} from '../core/fitMapFrame.js';
import {formatCosts} from '../core/formatCosts.js';
import {game} from '../core/game.js';
import {getMapPoint, type MapPoint} from '../core/getMapPoint.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  BUTTON_PADDING_Y,
  GLYPH_WIDTH,
  LINE_HEIGHT,
  WINDOW_PADDING_X,
} from '../core/getSceneArea.js';
import {getMapSize, getTravelLayout, SIDE_COLUMN_WIDTH} from '../core/getTravelLayout.js';
import {getHoursForms, getHoursWords} from '../core/hours.js';
import {type LocationId} from '../core/location.js';
import {type MapLayer} from '../core/mapLayers.js';
import {measureText} from '../core/measureText.js';
import {type Night, type Way} from '../core/night.js';
import {BUTTON_SIZE, placeMapButtons} from '../core/placeMapButtons.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {
  type Destination,
  getDestinations,
  type LocationData,
  type NightStart,
  WAY_WORDS,
} from '../core/travel.js';
import {MapPicture} from './mapPicture.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

export type TravelWindowOptions = {
  /** UI root of the screen that shows the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  start: NightStart;

  /** The screen's width in art pixels. */
  screenWidth: number;

  /** The screen's height in art pixels. */
  screenHeight: number;

  /**
   * Called when the window starts to fade out, with the destination the player picked, if any.
   */
  onClosing?: (destination: Destination | null) => void;

  /** Called once the window has closed, with the destination the player picked, if any. */
  onClosed: (destination: Destination | null) => void;
};

/** A journey the window is shown for: where it starts, the way it opens on and the ways offered. */
export type TravelJourney = {
  from: LocationId;
  way: Way;

  /** The ways the way out offers; the row's other ways take no press. */
  ways: readonly Way[];

  /**
   * The night, read for its money: a destination that costs more is greyed out. Its clock and a
   * destination's minutes give the minute of arrival, at which the destination button reads the
   * hours.
   */
  night: Night;
};

/** The destination button's room for one screen size. */
type DestinationRoom = {
  width: number;
  height: number;

  /** Whether a destination's numbers stand under its name. */
  isNarrow: boolean;
};

/** A destination's label in a button of some width: the name, wrapped, and the numbers. */
type DestinationLabel = {
  name: string;
  nameWidth: number;
  nameLineCount: number;

  /** The costs and the hours words, on one line, or the words on a second one. */
  numbers: string;

  /** The width of the numbers' widest line. */
  numbersWidth: number;
  numbersLineCount: number;

  /** The height a button needs for it. */
  height: number;
};

/** The destination button and its two texts, which a new selection changes. */
type DestinationParts = {button: Button; name: Text; numbers: Text};

/** A location that has a button on the map, and its position in metres. */
type MapLocation = {id: string; point: MapPoint};

/**
 * The containers built for one screen size, which hold the window's controls, and the sizes the
 * controls are drawn at. A resize builds them again; the controls stay.
 */
type TravelWindowSize = {
  /** The row and the map, the destination and Back, in a column or side by side. */
  body: Container;

  /** The container Back stands in: the body, or the side column. */
  backParent: Container;

  destinationRoom: DestinationRoom;
  frame: MapFrame;
  mapArea: Container;
  row: Container;

  /** The room of the destination button, which stays when the selection or the way changes. */
  slot: Container;

  title: Text;
  titleBlock: Container;
};

const WAYS: readonly Way[] = ['walk', 'tram', 'taxi'];
const TITLES: Readonly<Record<Way, string>> = {walk: 'On foot', tram: 'By tram', taxi: 'By taxi'};
const MAP_LAYERS: Readonly<Record<Way, MapLayer>> = {
  walk: 'streets',
  tram: 'trams',
  taxi: 'streets',
};
// Sizes in art pixels.
// Under the title block.
const TITLE_BLOCK_GAP = 4;
// Between the row of ways, the map, the destination and Back, and between the
// map and the side column.
const SECTION_GAP = 8;
// Between two way buttons. On the narrowest screen, 146 wide, three buttons of 36 and two gaps of 3
// are the 114 inside the window; a focus ring reaches 2 out and does not touch the next button.
const WAY_GAP = 3;
// At least two letters between a name and its numbers on one line.
const NAME_GAP = 2 * GLYPH_WIDTH;
// A location button is a square of BUTTON_SIZE with no padding: the theme's
// padding of 6 left and right would make it 12 wide.
const NO_PADDING = {paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0};
// The destination button's label while the way has no destination.
const NO_LABEL: DestinationLabel = {
  name: '',
  nameWidth: 1,
  nameLineCount: 1,
  numbers: '',
  numbersWidth: 1,
  numbersLineCount: 1,
  height: 0,
};

function measureLabel(text: string): number {
  return measureText(text, 'label');
}

// A label with an explicit size: a leaf sized by its own bounds is measured
// again later, and its button would move it then.
function createLabel(text: string, width: number, lineCount = 1): Text {
  return new Text({
    text,
    theme: game.theme,
    layout: {width, height: lineCount * LINE_HEIGHT},
  });
}

// The costs and the hours words two spaces apart when the line fits the room,
// else the words on a line of their own under the costs: the words are never
// split from each other.
function joinNumbers(costs: string, hoursWords: string, room: number): string {
  if (hoursWords === '') {
    return costs;
  }

  let line = `${costs}  ${hoursWords}`;

  return measureLabel(line) <= room ? line : `${costs}\n${hoursWords}`;
}

// On a wide screen the name and the numbers share a line, and the name wraps
// in the room the numbers leave. On a narrow one the numbers stand on a line
// of their own under the name, which wraps to the whole label width.
// The numbers' room is the label's width on a narrow screen; on a wide one it
// is what the gap and the name's widest word leave, so the name keeps room for
// its words.
function getDestinationLabel(
  destination: Destination,
  {width, isNarrow}: Pick<DestinationRoom, 'isNarrow' | 'width'>,
  hoursWords: string,
): DestinationLabel {
  let labelWidth = Math.max(1, width - 2 * BUTTON_PADDING_X);
  let widestWord = Math.max(...destination.location.name.split(' ').map(measureLabel));
  let numbersRoom = isNarrow ? labelWidth : labelWidth - NAME_GAP - widestWord;
  let numbers = joinNumbers(formatCosts(destination), hoursWords, numbersRoom);
  let numbersLines = numbers.split('\n');
  let numbersWidth = Math.max(...numbersLines.map(measureLabel));
  let numbersLineCount = numbersLines.length;
  let nameWidth = isNarrow ? labelWidth : Math.max(1, labelWidth - numbersWidth - NAME_GAP);
  let name = wrapText(destination.location.name, nameWidth, measureLabel);
  let nameLineCount = name.split('\n').length;
  let lineCount =
    isNarrow ? nameLineCount + numbersLineCount : Math.max(nameLineCount, numbersLineCount);

  return {
    name,
    nameWidth,
    nameLineCount,
    numbers,
    numbersWidth,
    numbersLineCount,
    height: lineCount * LINE_HEIGHT + 2 * BUTTON_PADDING_Y,
  };
}

function setDestinationLabel({name, numbers}: DestinationParts, label: DestinationLabel): void {
  name.setText(label.name);
  name.view.layout = {width: label.nameWidth, height: label.nameLineCount * LINE_HEIGHT};
  numbers.setText(label.numbers);
  numbers.view.layout = {width: label.numbersWidth, height: label.numbersLineCount * LINE_HEIGHT};
}

/**
 * The window the player picks a destination in, after a way out: a title, a
 * row of the ways, a map with a button for each location, a button for the
 * selected destination, and "Back". It is a `Panel` in a kept `Modal`, built
 * once with every control and both map layers, so that showing it costs a
 * frame like any other: each journey's `open` only fills it and adds the
 * modal to the UI root. The destination button and "Back" close it,
 * and so does the cancel command, which the engine sends to the topmost
 * overlay; closing takes it off the UI root and keeps it.
 */
export class TravelWindow {
  /** The overlay, kept: closing it removes it from the UI root without destroying it. */
  readonly modal: Modal;

  readonly #back: Button;

  /** The location buttons' top-left corners on the map for the journey, by location id. */
  #corners = new Map<string, {x: number; y: number}>();

  /** The destination button, which the modal declares as its initial focus, so it always stays. */
  readonly #destination: DestinationParts;

  /**
   * The destinations of each way from the journey's location; a way the way out lacks has none.
   */
  readonly #destinations = new Map<Way, Destination[]>();

  /** The journey's location; `null` until the first `open`. */
  #from: LocationId | null = null;

  /**
   * The location buttons by location id, one for every location with a position, the player's
   * hidden.
   */
  readonly #locationButtons: Map<string, Button>;

  /**
   * Every location that has a position and is a location of the night, in the order of the
   * location data.
   */
  readonly #locations: MapLocation[];

  readonly #mapPicture: MapPicture;

  /** The journey's night, read for its money and its clock; `null` until the first `open`. */
  #night: Night | null = null;

  readonly #panel: Panel;

  /** The destination the player picked; `null` until a pick. */
  #picked: Destination | null = null;

  /** Every position of the location data, in metres: the map fits them all, whatever the way. */
  readonly #points: MapPoint[];

  /**
   * Every destination from every location: the destination button is as high as the tallest of
   * them needs, with any form of its hours words, so that the map's size depends on the screen's
   * size only.
   */
  readonly #roomDestinations: Destination[];

  #screenHeight: number;

  #screenWidth: number;

  /** The destination the destination button makes the journey to; `null` for a way with none. */
  #selected: Destination | null = null;

  #size: TravelWindowSize;
  readonly #start: NightStart;

  readonly #ui: UiRoot;

  #way: Way = 'walk';
  readonly #wayButtons: Map<Way, Button>;

  /** The journey location's position in metres, or null for a location without one. */
  #youPoint: MapPoint | null = null;

  constructor({
    ui,
    scheduler,
    start,
    screenWidth,
    screenHeight,
    onClosing,
    onClosed,
  }: TravelWindowOptions) {
    this.#ui = ui;
    this.#start = start;
    this.#screenWidth = screenWidth;
    this.#screenHeight = screenHeight;

    let {origin} = start.map;

    this.#points = Object.values(start.locationData).flatMap(({position}) =>
      position === undefined ? [] : [getMapPoint(position, origin)],
    );
    this.#locations = Object.entries(start.locationData).flatMap(([id, {position}]) =>
      position === undefined || !Object.hasOwn(start.locations, id) ?
        []
      : [{id, point: getMapPoint(position, origin)}],
    );
    this.#roomDestinations = Object.values(start.locations).flatMap(({id}) =>
      WAYS.flatMap((way) => getDestinations(start, id, way)),
    );
    this.#warnOfMissingPositions(start.locationData);
    this.#wayButtons = new Map(
      WAYS.map((way) => [
        way,
        new Button({
          theme: game.theme,
          children: [createLabel(WAY_WORDS[way], measureLabel(WAY_WORDS[way]))],
          // The ways share the row's width equally, so the three fit the
          // narrowest screen.
          layout: {flexGrow: 1, flexBasis: 0, height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
          onClick: (button) => {
            this.#switchWay(way, button);
          },
        }),
      ]),
    );
    this.#locationButtons = this.#createLocationButtons();
    this.#destination = this.#createDestination();
    this.#back = new Button({
      theme: game.theme,
      children: [createLabel('Back', measureLabel('Back'))],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
      onClick: () => {
        if (!this.#isClosing()) {
          this.modal.close();
        }
      },
    });
    this.#mapPicture = new MapPicture({map: start.map});
    this.#panel = new Panel({
      theme: game.theme,
      layout: {...WINDOW_PADDING, flexDirection: 'column', alignItems: 'stretch'},
    });
    this.#size = this.#layOut();
    // The buttons are built before the modal, which declares the destination
    // button as its initial focus, so the window opens with the ring on it.
    // Their clicks read the modal from this.modal, assigned right after.
    this.modal = new Modal({
      theme: game.theme,
      children: [this.#panel],
      layout: {justifyContent: 'center', alignItems: 'center'},
      // The scrim still takes every tap but draws nothing: the night screen
      // dims the scene behind all its windows, so the scene stays dimmed from
      // one window to the next.
      scrimAlpha: 0,
      scheduler,
      fadeDuration: UI_FADE_DURATION,
      initialFocus: this.#destination.button,
      isReusable: true,
      onClosing: () => {
        onClosing?.(this.#picked);
      },
      onClosed: () => {
        onClosed(this.#picked);
      },
    });
  }

  /** The way whose locations take a press. */
  get way(): Way {
    return this.#way;
  }

  /**
   * Shows a journey from `from` and adds the modal to the UI root: the title and the map of `way`,
   * the light at `from`, the locations the way reaches, and its nearest destination on the
   * destination button. Nothing here is built, so that frame costs what any other does. The modal
   * puts the focus and the ring on the destination button; when that takes no press, a way with no
   * destination or one the night cannot pay, they go to Back.
   */
  open({from, way, ways, night}: TravelJourney): void {
    let position = this.#start.locationData[from]?.position;

    this.#from = from;
    this.#night = night;
    this.#way = way;
    this.#picked = null;
    this.#youPoint = position === undefined ? null : getMapPoint(position, this.#start.map.origin);

    // The way the window opens on counts as offered, should `ways` lack it.
    for (let listed of WAYS) {
      let isOffered = listed === way || ways.includes(listed);
      let button = this.#wayButtons.get(listed);

      this.#destinations.set(listed, isOffered ? getDestinations(this.#start, from, listed) : []);

      if (isOffered) {
        button?.enable();
      } else {
        button?.disable();
      }
    }

    this.#selected = this.#getDestinations(way)[0] ?? null;
    this.#showJourney();
    this.#ui.addOverlay(this.modal);

    // Moving the focus keeps the ring that adding the modal showed.
    if (this.#destination.button.isDisabled) {
      this.#ui.focus(this.#back);
    }
  }

  /**
   * Lays the window out again for a screen of this size. The controls stay, the focus with them;
   * the containers are built again and the map's layers are drawn at the new size.
   */
  resize(screenWidth: number, screenHeight: number): void {
    // The night screen lays itself out at every arrival too: the same size
    // draws nothing again.
    if (
      this.modal.view.destroyed ||
      (screenWidth === this.#screenWidth && screenHeight === this.#screenHeight)
    ) {
      return;
    }

    this.#screenWidth = screenWidth;
    this.#screenHeight = screenHeight;
    this.#takeApart();
    this.#size = this.#layOut();

    if (this.#from !== null) {
      this.#showJourney();
    }
  }

  // The destination button: the name's Text, then the numbers' Text, at the
  // right end of the name's first line or under the name. Its size and its
  // direction come from the screen's size (see #layOut).
  #createDestination(): DestinationParts {
    let name = createLabel('', 1);
    let numbers = createLabel('', 1);
    let button = new Button({
      theme: game.theme,
      children: [name, numbers],
      onClick: () => {
        if (!this.#isClosing() && this.#selected !== null) {
          this.#picked = this.#selected;
          this.modal.close();
        }
      },
    });

    return {button, name, numbers};
  }

  // One button with no label for every location on the map, labelled with the
  // location's id. The journey decides where each stands and whether it takes
  // a press (see #showJourney).
  #createLocationButtons(): Map<string, Button> {
    let locationButtons = new Map<string, Button>();

    for (let {id} of this.#locations) {
      let button = new Button({
        theme: game.theme,
        layout: {
          ...NO_PADDING,
          position: 'absolute',
          left: 0,
          top: 0,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        },
        onClick: (pressed) => {
          this.#selectLocation(id, pressed);
        },
      });

      button.view.label = id;
      locationButtons.set(id, button);
    }

    return locationButtons;
  }

  // The marks of the journey: the light, the dotted line to the selection's
  // button and the buttons' black squares. A selection without a button has
  // no line.
  #drawMarks(): void {
    let you = this.#youPoint === null ? null : toMapPixel(this.#size.frame, this.#youPoint);
    let corner =
      this.#selected === null ? undefined : this.#corners.get(this.#selected.location.id);

    this.#mapPicture.drawMarks({
      you,
      selected:
        corner === undefined ? null : (
          {x: corner.x + BUTTON_SIZE / 2, y: corner.y + BUTTON_SIZE / 2}
        ),
      buttons: [...this.#corners.values()],
    });
  }

  #getDestinations(way: Way): Destination[] {
    return this.#destinations.get(way) ?? [];
  }

  // A press can still arrive during the fade: a pick, a location, Back or a way
  // must do nothing over a closing window.
  #isClosing(): boolean {
    return this.modal.state === 'closing' || this.modal.state === 'closed';
  }

  #isReached(id: string): boolean {
    return this.#getDestinations(this.#way).some(({location}) => location.id === id);
  }

  // Builds the containers for the screen's size, puts the controls in them,
  // adds them to the panel and draws the map's layers at the map's size. The
  // destination button is as high as the tallest destination of every location
  // and way needs, so neither a journey nor a selection moves anything. Each
  // destination is measured with every form its hours words can take, so the
  // clock moves nothing either.
  #layOut(): TravelWindowSize {
    let layout = getTravelLayout(this.#screenWidth, this.#screenHeight);
    let {controlWidth, isNarrow, kind} = layout;
    let destinationHeight = BUTTON_HEIGHT;

    for (let destination of this.#roomDestinations) {
      let forms = getHoursForms(this.#start.locationData[destination.location.id]?.hours);

      for (let hoursWords of forms) {
        destinationHeight = Math.max(
          destinationHeight,
          getDestinationLabel(destination, {width: controlWidth, isNarrow}, hoursWords).height,
        );
      }
    }

    let destinationRoom = {width: controlWidth, height: destinationHeight, isNarrow};
    let mapSize = getMapSize(layout, destinationHeight);
    let titleBlock = createWindowTitle(
      TITLES[this.#way],
      Math.max(1, layout.window.width - 2 * WINDOW_PADDING_X),
    );
    let [title] = titleBlock.children;

    if (!(title instanceof Text)) {
      throw new TypeError('The title block has no title!');
    }

    let row = new Container({
      children: [...this.#wayButtons.values()],
      layout: {gap: WAY_GAP, width: controlWidth, height: BUTTON_HEIGHT},
    });
    let frame = fitMapFrame(this.#points, mapSize.width, mapSize.height, MAP_INSET);

    this.#mapPicture.view.layout = {position: 'absolute', left: 0, top: 0, ...mapSize};
    this.#mapPicture.drawLayers(frame);

    // The picture is a child of the map area; a resize takes it out before
    // the area is destroyed (see #takeApart).
    let mapArea = new Container({
      children: [this.#mapPicture, ...this.#locationButtons.values()],
      layout: mapSize,
    });

    this.#destination.button.view.layout = {
      ...(isNarrow ?
        {flexDirection: 'column', justifyContent: 'flex-start'}
      : {flexDirection: 'row', justifyContent: 'space-between'}),
      alignItems: 'flex-start',
      width: destinationRoom.width,
      height: destinationRoom.height,
    };

    let slot = new Container({
      children: [this.#destination.button],
      layout: {width: controlWidth, height: destinationHeight},
    });

    // In the side column, Back stands at the bottom, level with the map's.
    this.#back.view.layout = {marginTop: kind === 'sideBySide' ? 'auto' : 0};

    let column = {flexDirection: 'column', alignItems: 'stretch', gap: SECTION_GAP} as const;
    let body: Container;
    let backParent: Container;

    if (kind === 'stacked') {
      body = new Container({
        children: [row, mapArea, slot, this.#back],
        layout: {...column, marginTop: TITLE_BLOCK_GAP},
      });
      backParent = body;
    } else {
      backParent = new Container({
        children: [row, slot, this.#back],
        layout: {...column, width: SIDE_COLUMN_WIDTH, height: mapSize.height},
      });
      body = new Container({
        children: [mapArea, backParent],
        layout: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: SECTION_GAP,
          marginTop: TITLE_BLOCK_GAP,
        },
      });
    }

    this.#panel.view.layout = {...layout.window};
    this.#panel.addChild(titleBlock, body);

    return {body, backParent, destinationRoom, frame, mapArea, row, slot, title, titleBlock};
  }

  // The locations' buttons centred on their pixels, pushed apart and off the
  // light, in the order of the location data. The journey's own location has
  // none.
  #locationButtonCorners(
    frame: MapFrame,
    you: {x: number; y: number} | null,
  ): Map<string, {x: number; y: number}> {
    let locations = this.#locations.filter(({id}) => id !== this.#from);
    let topLefts = placeMapButtons(
      locations.map(({point}) => toMapPixel(frame, point)),
      you,
      frame.width,
      frame.height,
    );
    let corners = new Map<string, {x: number; y: number}>();

    for (let [index, {id}] of locations.entries()) {
      let corner = topLefts[index];

      if (corner !== undefined) {
        corners.set(id, corner);
      }
    }

    return corners;
  }

  // Selects the location's destination of the current way: the destination
  // button names it and the dotted line moves to it. The focus stays on the
  // pressed button. Pressing the selected location changes nothing.
  #selectLocation(id: string, button: Button): void {
    if (this.#isClosing()) {
      return;
    }

    let destination = this.#getDestinations(this.#way).find(({location}) => location.id === id);

    if (destination === undefined || destination === this.#selected) {
      return;
    }

    this.#selected = destination;
    this.#showSelection();
    this.#ui.focus(button);
  }

  // Shows the journey and the current way: the title, the map's layer, where
  // each location button stands and whether it takes a press, and the
  // selection. The journey's own location has no button: the light is there.
  #showJourney(): void {
    let {frame, title} = this.#size;
    let you = this.#youPoint === null ? null : toMapPixel(frame, this.#youPoint);

    this.#corners = this.#locationButtonCorners(frame, you);
    title.setText(TITLES[this.#way]);

    // Enabled or disabled, never built again, so the focus never lands on a
    // button that goes.
    for (let [id, button] of this.#locationButtons) {
      let corner = this.#corners.get(id);

      button.view.renderable = corner !== undefined;

      if (corner !== undefined) {
        button.view.layout = {left: corner.x, top: corner.y};
      }

      if (corner !== undefined && this.#isReached(id)) {
        button.enable();
      } else {
        button.disable();
      }
    }

    this.#mapPicture.showLayer(MAP_LAYERS[this.#way]);
    this.#showSelection();
  }

  // Shows the selection on the destination button and draws the marks again.
  // While the way has no destination the button is not drawn and takes no
  // press, so its room stays empty; it stays, as the modal's initial focus. A
  // destination that costs more than the night's money is greyed out; one that
  // costs exactly the money can still be paid. The numbers say the
  // destination's hours at the minute the journey would arrive.
  #showSelection(): void {
    let {button} = this.#destination;
    let money = this.#night?.money ?? 0;

    button.view.renderable = this.#selected !== null;

    if (this.#selected === null) {
      setDestinationLabel(this.#destination, NO_LABEL);
      button.disable();
    } else {
      let hours = this.#start.locationData[this.#selected.location.id]?.hours;
      let hoursWords = getHoursWords(hours, (this.#night?.minutes ?? 0) + this.#selected.minutes);

      setDestinationLabel(
        this.#destination,
        getDestinationLabel(this.#selected, this.#size.destinationRoom, hoursWords),
      );

      if (this.#selected.price > money) {
        button.disable();
      } else {
        button.enable();
      }
    }

    this.#drawMarks();
  }

  // Makes the way current: the title, the locations that take a press, the
  // selection and the map's layer change, and the focus stays on the pressed
  // button. Nothing moves. Pressing the current way changes nothing.
  #switchWay(way: Way, button: Button): void {
    if (this.#isClosing() || way === this.#way) {
      return;
    }

    this.#way = way;
    this.#selected = this.#getDestinations(way)[0] ?? null;
    this.#showJourney();
    this.#ui.focus(button);
  }

  // Takes the containers of the last size off the panel and destroys them.
  // The controls and the map picture leave them first, so they stay.
  #takeApart(): void {
    let {backParent, body, mapArea, row, slot, titleBlock} = this.#size;

    row.removeChild(...this.#wayButtons.values());
    mapArea.removeChild(this.#mapPicture, ...this.#locationButtons.values());
    slot.removeChild(this.#destination.button);
    backParent.removeChild(this.#back);
    this.#panel.removeChild(titleBlock, body);
    titleBlock.destroy();
    body.destroy();
  }

  // A destination whose location has no position has no button on the map,
  // yet the destination button can still take the player there. The checker
  // reports such a location; the window says so once, when it is built.
  #warnOfMissingPositions(locationData: LocationData): void {
    let warned = new Set<string>();

    for (let {location} of this.#roomDestinations) {
      if (locationData[location.id]?.position === undefined && !warned.has(location.id)) {
        warned.add(location.id);
        // eslint-disable-next-line no-console -- the running game reports a location the map lacks
        console.warn(`No position for "${location.id}": it has no button on the map.`);
      }
    }
  }
}
