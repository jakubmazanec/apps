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
import {type MapLayer} from '../core/mapLayers.js';
import {measureText} from '../core/measureText.js';
import {type PlaceId, type Way} from '../core/night.js';
import {BUTTON_SIZE, placeMapButtons} from '../core/placeMapButtons.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {
  type Destination,
  getDestinations,
  type MapData,
  type NightStart,
  type PlaceData,
} from '../core/travel.js';
import {MapPicture} from './mapPicture.js';
import {createWindowTitle, WINDOW_PADDING} from './windowTitle.js';

export type TravelWindowOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  start: NightStart;
  from: PlaceId;

  /** The way the window opens on. */
  way: Way;

  /** The ways the row offers, in this order. */
  ways: readonly Way[];

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
  numbers: string;
  numbersWidth: number;

  /** The height a button needs for it. */
  height: number;
};

/** The destination button and its two texts, which a new selection changes. */
type DestinationParts = {button: Button; name: Text; numbers: Text};

/** A place that has a button on the map, and its position in metres. */
type MapPlace = {id: string; point: MapPoint};

/** The panel's children, built for one screen size, and the parts the window changes later. */
type TravelWindowParts = {
  back: Button;

  /** The row and the map, the destination and Back, in a column or side by side. */
  body: Container;

  /** The place buttons' top-left corners on the map, by place id. */
  corners: Map<string, {x: number; y: number}>;

  /** The destination button, or null while the way has no destination. */
  destination: DestinationParts | null;

  destinationRoom: DestinationRoom;
  frame: MapFrame;
  mapPicture: MapPicture;

  /** The place buttons by place id, in the order of the place data. */
  placeButtons: Map<string, Button>;

  /** The room of the destination button, which stays when the selection or the way changes. */
  slot: Container;

  title: Text;
  titleBlock: Container;
  wayButtons: Button[];

  /** The light's pixel on the map, or null for a place without a position. */
  you: {x: number; y: number} | null;
};

const TITLES: Readonly<Record<Way, string>> = {walk: 'On foot', tram: 'By tram', taxi: 'By taxi'};
const WAY_LABELS: Readonly<Record<Way, string>> = {walk: 'Walk', tram: 'Tram', taxi: 'Taxi'};
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
// A place button is a square of BUTTON_SIZE with no padding: the theme's
// padding of 6 left and right would make it 12 wide.
const NO_PADDING = {paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0};

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

// On a wide screen the name and the numbers share a line, and the name wraps
// in the room the numbers leave. On a narrow one the numbers stand on a line
// of their own under the name, which wraps to the whole label width.
function getDestinationLabel(
  destination: Destination,
  {width, isNarrow}: Pick<DestinationRoom, 'isNarrow' | 'width'>,
): DestinationLabel {
  let labelWidth = Math.max(1, width - 2 * BUTTON_PADDING_X);
  let numbers = formatCosts(destination);
  let numbersWidth = measureLabel(numbers);
  let nameWidth = isNarrow ? labelWidth : Math.max(1, labelWidth - numbersWidth - NAME_GAP);
  let name = wrapText(destination.place.name, nameWidth, measureLabel);
  let nameLineCount = name.split('\n').length;
  let lineCount = isNarrow ? nameLineCount + 1 : nameLineCount;

  return {
    name,
    nameWidth,
    nameLineCount,
    numbers,
    numbersWidth,
    height: lineCount * LINE_HEIGHT + 2 * BUTTON_PADDING_Y,
  };
}

function setDestinationLabel({name, numbers}: DestinationParts, label: DestinationLabel): void {
  name.setText(label.name);
  name.view.layout = {width: label.nameWidth, height: label.nameLineCount * LINE_HEIGHT};
  numbers.setText(label.numbers);
  numbers.view.layout = {width: label.numbersWidth};
}

/**
 * The window the player picks a destination in, after a way out: a title, a
 * row of the ways, a map with a button for each place, a button for the
 * selected destination, and "Back". It is a `Panel` in a `Modal`, which the
 * constructor adds to the UI root. The destination button and "Back" close it,
 * and so does the cancel command, which the engine sends to the topmost
 * overlay.
 */
export class TravelWindow {
  /** The overlay. The constructor adds it to the UI; the night screen destroys it on hiding. */
  readonly modal: Modal;

  /** The destinations of each way, looked up once: the start and the place do not change. */
  readonly #destinations = new Map<Way, Destination[]>();

  readonly #map: MapData;

  /** The places with a button on the map: every place with a position but the player's. */
  readonly #mapPlaces: MapPlace[];

  readonly #panel: Panel;
  #parts: TravelWindowParts;

  /** The destination the player picked; `null` until a pick. */
  #picked: Destination | null = null;

  /** Every position of the place data, in metres: the map fits them all, whatever the way. */
  readonly #points: MapPoint[];

  #screenHeight: number;
  #screenWidth: number;

  /** The destination the destination button makes the journey to; `null` for a way with none. */
  #selected: Destination | null;

  readonly #ui: UiRoot;
  #way: Way;
  readonly #ways: readonly Way[];

  /** The player's place in metres, or null for a place without a position. */
  readonly #you: MapPoint | null;

  constructor({
    ui,
    scheduler,
    start,
    from,
    way,
    ways,
    screenWidth,
    screenHeight,
    onClosing,
    onClosed,
  }: TravelWindowOptions) {
    this.#ui = ui;
    this.#map = start.map;
    this.#way = way;
    this.#ways = ways;
    this.#screenWidth = screenWidth;
    this.#screenHeight = screenHeight;

    // The way the window opens on is looked up too, should `ways` lack it.
    for (let listed of [way, ...ways]) {
      if (!this.#destinations.has(listed)) {
        this.#destinations.set(listed, getDestinations(start, from, listed));
      }
    }

    let {origin} = start.map;
    let fromPosition = start.placeData[from]?.position;

    this.#points = Object.values(start.placeData).flatMap(({position}) =>
      position === undefined ? [] : [getMapPoint(position, origin)],
    );
    this.#you = fromPosition === undefined ? null : getMapPoint(fromPosition, origin);
    this.#mapPlaces = Object.entries(start.placeData).flatMap(([id, {position}]) =>
      position === undefined || id === from || !Object.hasOwn(start.places, id) ?
        []
      : [{id, point: getMapPoint(position, origin)}],
    );
    this.#warnOfMissingPositions(start.placeData);
    this.#selected = this.#getDestinations(way)[0] ?? null;
    this.#panel = new Panel({
      theme: game.theme,
      layout: {...WINDOW_PADDING, flexDirection: 'column', alignItems: 'stretch'},
    });
    // The buttons are built before the modal, which declares the destination
    // button, or Back for a way with none, as its initial focus, so the window
    // opens with the ring on it. Their clicks read the modal from this.modal,
    // assigned right after.
    this.#parts = this.#build();
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
      initialFocus: this.#parts.destination?.button ?? this.#parts.back,
      onClosing: () => {
        onClosing?.(this.#picked);
      },
      onClosed: () => {
        onClosed(this.#picked);
      },
    });
    // The focus goes back to whatever had it before once the window closes.
    ui.addOverlay(this.modal);
  }

  /** The way whose places take a press. */
  get way(): Way {
    return this.#way;
  }

  /** Lays the window out again for a screen of this size. */
  resize(screenWidth: number, screenHeight: number): void {
    if (this.modal.view.destroyed) {
      return;
    }

    // The parts are built again, the map picture with them, and the focus
    // stays on the same control: the same way, the same place, the
    // destination button or Back.
    let {back, body, destination, placeButtons, titleBlock, wayButtons} = this.#parts;
    let {focused} = this.#ui;
    let wayIndex = focused instanceof Button ? wayButtons.indexOf(focused) : -1;
    let placeId = [...placeButtons].find(([, button]) => button === focused)?.[0];
    let isDestinationFocused = destination !== null && focused === destination.button;

    // Destroying the body destroys its buttons and the map picture.
    this.#panel.removeChild(titleBlock, body);
    titleBlock.destroy();
    body.destroy();
    this.#screenWidth = screenWidth;
    this.#screenHeight = screenHeight;

    let parts = this.#build();
    let focusTarget =
      parts.wayButtons[wayIndex] ??
      (placeId === undefined ? undefined : parts.placeButtons.get(placeId)) ??
      (isDestinationFocused ? parts.destination?.button : undefined) ??
      (focused === back ? parts.back : undefined);

    this.#parts = parts;

    if (focusTarget !== undefined) {
      this.#ui.focus(focusTarget);
    }
  }

  // Builds the title block and the body for the screen's size, adds them to
  // the panel and draws the map.
  #build(): TravelWindowParts {
    let layout = getTravelLayout(this.#screenWidth, this.#screenHeight);
    let {controlWidth, isNarrow, kind} = layout;
    // The destination button is as high as the tallest selection of every way
    // needs, so a new selection or way moves nothing.
    let destinationHeight = BUTTON_HEIGHT;

    for (let destinations of this.#destinations.values()) {
      for (let destination of destinations) {
        destinationHeight = Math.max(
          destinationHeight,
          getDestinationLabel(destination, {width: controlWidth, isNarrow}).height,
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

    // The ways share the row's width equally, so the three fit the narrowest
    // screen.
    let wayButtons = this.#ways.map(
      (way) =>
        new Button({
          theme: game.theme,
          children: [createLabel(WAY_LABELS[way], measureLabel(WAY_LABELS[way]))],
          layout: {flexGrow: 1, flexBasis: 0, height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
          onClick: (button) => {
            this.#switchWay(way, button);
          },
        }),
    );
    let row = new Container({
      children: wayButtons,
      layout: {gap: WAY_GAP, width: controlWidth, height: BUTTON_HEIGHT},
    });
    let frame = fitMapFrame(this.#points, mapSize.width, mapSize.height, MAP_INSET);
    let you = this.#you === null ? null : toMapPixel(frame, this.#you);
    let corners = this.#placeButtonCorners(frame, you);
    let mapPicture = new MapPicture({map: this.#map});

    mapPicture.view.layout = {position: 'absolute', left: 0, top: 0, ...mapSize};

    let placeButtons = this.#createPlaceButtons(corners);
    // The picture is a child of the map area, so destroying the area destroys
    // it, and its texture, too.
    let mapArea = new Container({
      children: [mapPicture, ...placeButtons.values()],
      layout: mapSize,
    });
    let destination =
      this.#selected === null ? null : this.#createDestination(destinationRoom, this.#selected);
    let slot = new Container({
      children: destination === null ? [] : [destination.button],
      layout: {width: controlWidth, height: destinationHeight},
    });
    let back = new Button({
      theme: game.theme,
      children: [createLabel('Back', measureLabel('Back'))],
      layout: {
        height: BUTTON_HEIGHT,
        justifyContent: 'flex-start',
        // In the side column, Back stands at the bottom, level with the map's.
        ...(kind === 'sideBySide' ? {marginTop: 'auto'} : {}),
      },
      onClick: () => {
        if (!this.#isClosing()) {
          this.modal.close();
        }
      },
    });
    let column = {flexDirection: 'column', alignItems: 'stretch', gap: SECTION_GAP} as const;
    let body =
      kind === 'stacked' ?
        new Container({
          children: [row, mapArea, slot, back],
          layout: {...column, marginTop: TITLE_BLOCK_GAP},
        })
      : new Container({
          children: [
            mapArea,
            new Container({
              children: [row, slot, back],
              layout: {...column, width: SIDE_COLUMN_WIDTH, height: mapSize.height},
            }),
          ],
          layout: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: SECTION_GAP,
            marginTop: TITLE_BLOCK_GAP,
          },
        });

    this.#panel.view.layout = {...layout.window};
    this.#panel.addChild(titleBlock, body);

    let parts: TravelWindowParts = {
      back,
      body,
      corners,
      destination,
      destinationRoom,
      frame,
      mapPicture,
      placeButtons,
      slot,
      title,
      titleBlock,
      wayButtons,
      you,
    };

    this.#drawMap(parts);

    return parts;
  }

  // The destination button: the name's Text, then the numbers' Text, at the
  // right end of the name's first line or under the name.
  #createDestination(room: DestinationRoom, destination: Destination): DestinationParts {
    let label = getDestinationLabel(destination, room);
    let name = createLabel(label.name, label.nameWidth, label.nameLineCount);
    let numbers = createLabel(label.numbers, label.numbersWidth);
    let button = new Button({
      theme: game.theme,
      children: [name, numbers],
      layout: {
        ...(room.isNarrow ?
          {flexDirection: 'column', justifyContent: 'flex-start'}
        : {justifyContent: 'space-between'}),
        alignItems: 'flex-start',
        width: room.width,
        height: room.height,
      },
      onClick: () => {
        if (!this.#isClosing() && this.#selected !== null) {
          this.#picked = this.#selected;
          this.modal.close();
        }
      },
    });

    return {button, name, numbers};
  }

  // One button with no label per place on the map, labelled with the place's
  // id. A place the current way does not reach takes no press and no focus.
  #createPlaceButtons(corners: Map<string, {x: number; y: number}>): Map<string, Button> {
    let placeButtons = new Map<string, Button>();

    for (let [id, corner] of corners) {
      let button = new Button({
        theme: game.theme,
        layout: {
          ...NO_PADDING,
          position: 'absolute',
          left: corner.x,
          top: corner.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        },
        onClick: (pressed) => {
          this.#selectPlace(id, pressed);
        },
      });

      button.view.label = id;

      if (!this.#isReached(id)) {
        button.disable();
      }

      placeButtons.set(id, button);
    }

    return placeButtons;
  }

  // The map shows the current way's layer, the light and the dotted line to
  // the selection's button. A selection without a button has no line.
  #drawMap({corners, frame, mapPicture, you}: TravelWindowParts): void {
    let corner = this.#selected === null ? undefined : corners.get(this.#selected.place.id);

    mapPicture.draw({
      layer: MAP_LAYERS[this.#way],
      frame,
      you,
      selected:
        corner === undefined ? null : (
          {x: corner.x + BUTTON_SIZE / 2, y: corner.y + BUTTON_SIZE / 2}
        ),
      buttons: [...corners.values()],
    });
  }

  #getDestinations(way: Way): Destination[] {
    return this.#destinations.get(way) ?? [];
  }

  // A press can still arrive during the fade: a pick, a place, Back or a way
  // must do nothing over a closing window.
  #isClosing(): boolean {
    return this.modal.state === 'closing' || this.modal.state === 'closed';
  }

  #isReached(id: string): boolean {
    return this.#getDestinations(this.#way).some(({place}) => place.id === id);
  }

  // The places' buttons centred on their pixels, pushed apart and off the
  // light, in the order of the place data.
  #placeButtonCorners(
    frame: MapFrame,
    you: {x: number; y: number} | null,
  ): Map<string, {x: number; y: number}> {
    let topLefts = placeMapButtons(
      this.#mapPlaces.map(({point}) => toMapPixel(frame, point)),
      you,
      frame.width,
      frame.height,
    );
    let corners = new Map<string, {x: number; y: number}>();

    for (let [index, {id}] of this.#mapPlaces.entries()) {
      let corner = topLefts[index];

      if (corner !== undefined) {
        corners.set(id, corner);
      }
    }

    return corners;
  }

  // Selects the place's destination of the current way: the destination
  // button names it and the dotted line moves to it. The focus stays on the
  // pressed button. Pressing the selected place changes nothing.
  #selectPlace(id: string, button: Button): void {
    if (this.#isClosing()) {
      return;
    }

    let destination = this.#getDestinations(this.#way).find(({place}) => place.id === id);

    if (destination === undefined || destination === this.#selected) {
      return;
    }

    this.#selected = destination;
    this.#showSelection();
    this.#ui.focus(button);
  }

  // Shows the selection on the destination button, which is built when a way
  // gains a destination and goes when it has none, and draws the map again.
  #showSelection(): void {
    let parts = this.#parts;
    let {destination, destinationRoom, slot} = parts;

    if (this.#selected === null) {
      if (destination !== null) {
        slot.removeChild(destination.button);
        destination.button.destroy();
        parts.destination = null;
      }
    } else if (destination === null) {
      let created = this.#createDestination(destinationRoom, this.#selected);

      slot.addChild(created.button);
      parts.destination = created;
    } else {
      setDestinationLabel(destination, getDestinationLabel(this.#selected, destinationRoom));
    }

    this.#drawMap(parts);
  }

  // Makes the way current: the title, the places that take a press, the
  // selection and the map's layer change, and the focus stays on the pressed
  // button. Nothing moves. Pressing the current way changes nothing.
  #switchWay(way: Way, button: Button): void {
    if (this.#isClosing() || way === this.#way) {
      return;
    }

    this.#way = way;
    this.#selected = this.#getDestinations(way)[0] ?? null;
    this.#parts.title.setText(TITLES[way]);

    // Enabled or disabled, never built again, so the focus never lands on a
    // button that goes.
    for (let [id, placeButton] of this.#parts.placeButtons) {
      if (this.#isReached(id)) {
        placeButton.enable();
      } else {
        placeButton.disable();
      }
    }

    this.#showSelection();
    this.#ui.focus(button);
  }

  // A destination whose place has no position has no button on the map, yet
  // the destination button can still take the player there. The checker
  // reports such a place; the window says so once, when it opens.
  #warnOfMissingPositions(placeData: PlaceData): void {
    let warned = new Set<string>();

    for (let destinations of this.#destinations.values()) {
      for (let {place} of destinations) {
        if (placeData[place.id]?.position === undefined && !warned.has(place.id)) {
          warned.add(place.id);
          // eslint-disable-next-line no-console -- the running game reports a place the map lacks
          console.warn(`No position for "${place.id}": it has no button on the map.`);
        }
      }
    }
  }
}
