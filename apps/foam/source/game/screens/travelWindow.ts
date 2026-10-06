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

import {game} from '../core/game.js';
import {
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  BUTTON_PADDING_Y,
  GLYPH_WIDTH,
  LINE_HEIGHT,
  MARGIN,
  NARROW_WIDTH,
  WINDOW_PADDING_X,
  WINDOW_WIDTH,
} from '../core/getSceneArea.js';
import {measureText} from '../core/measureText.js';
import {type PlaceId, type Way} from '../core/night.js';
import {type Destination, formatJourney, getDestinations, type NightStart} from '../core/travel.js';
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

  /** Called once the window has closed, with the destination the player picked, if any. */
  onClosed: (destination: Destination | null) => void;
};

/** The panel's children, built for one screen width, and the title's leaf. */
type TravelWindowParts = {
  back: Button;
  list: Container;
  row: Container;
  title: Text;
  titleBlock: Container;
  wayButtons: Button[];
};

/** The widths inside the window for one screen width. */
type Widths = {
  /** Inside the window's padding. */
  text: number;

  /** Inside a button's padding as well. */
  label: number;

  /** Whether a destination's numbers stand under its name. */
  isNarrow: boolean;
};

/** A destination's label for one screen width: the name, wrapped, and the numbers. */
type DestinationLabel = {
  name: string;
  nameWidth: number;
  nameLineCount: number;
  numbers: string;
  numbersWidth: number;

  /** The button's height. */
  height: number;
};

const TITLES: Readonly<Record<Way, string>> = {walk: 'On foot', tram: 'By tram', taxi: 'By taxi'};
const WAY_LABELS: Readonly<Record<Way, string>> = {walk: 'Walk', tram: 'Tram', taxi: 'Taxi'};
// Sizes in art pixels.
// Under the title block.
const TITLE_BLOCK_GAP = 4;
// Between the row of ways, the list and Back.
const SECTION_GAP = 8;
// Between two destinations: a focus ring reaches 2 out and does not touch the next button.
const DESTINATION_GAP = 4;
// Between two way buttons. On the narrowest screen, 146 wide, three buttons of 36 and two gaps of 3
// are the 114 inside the window; a focus ring reaches 2 out and does not touch the next button.
const WAY_GAP = 3;
// At least two letters between a name and its numbers on one line.
const NAME_GAP = 2 * GLYPH_WIDTH;
const FADE_DURATION = 200;

function measureLabel(text: string): number {
  return measureText(text, 'label');
}

// The story window's width: 300, or the screen less a margin on each side.
function getWidths(screenWidth: number): Widths {
  let windowWidth = Math.min(WINDOW_WIDTH, Math.floor(screenWidth - 2 * MARGIN));
  let text = Math.max(1, windowWidth - 2 * WINDOW_PADDING_X);

  return {
    text,
    label: Math.max(1, text - 2 * BUTTON_PADDING_X),
    isNarrow: screenWidth < NARROW_WIDTH,
  };
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
function getDestinationLabel(destination: Destination, widths: Widths): DestinationLabel {
  let numbers = formatJourney(destination);
  let numbersWidth = measureLabel(numbers);
  let nameWidth =
    widths.isNarrow ? widths.label : Math.max(1, widths.label - numbersWidth - NAME_GAP);
  let name = wrapText(destination.place.name, nameWidth, measureLabel);
  let nameLineCount = name.split('\n').length;
  let lineCount = widths.isNarrow ? nameLineCount + 1 : nameLineCount;

  return {
    name,
    nameWidth,
    nameLineCount,
    numbers,
    numbersWidth,
    height: lineCount * LINE_HEIGHT + 2 * BUTTON_PADDING_Y,
  };
}

// The room a list of these destinations takes; an empty list takes none.
function getListHeight(destinations: Destination[], widths: Widths): number {
  let height = Math.max(0, destinations.length - 1) * DESTINATION_GAP;

  for (let destination of destinations) {
    height += getDestinationLabel(destination, widths).height;
  }

  return height;
}

/**
 * The window the player picks a destination in, after a way out: a title, a
 * row of the ways, the destinations of the current way and "Back". It is a
 * `Panel` in a `Modal`, which the constructor adds to the UI root. A pick and
 * "Back" close it, and so does the cancel command, which the engine sends to
 * the topmost overlay.
 */
export class TravelWindow {
  /** The overlay. The constructor adds it to the UI; the night screen destroys it on hiding. */
  readonly modal: Modal;

  /** The current way's destination buttons, in the list. */
  #destinationButtons: Button[] = [];

  /** The destinations of each way, looked up once: the start and the place do not change. */
  readonly #destinations = new Map<Way, Destination[]>();

  readonly #panel: Panel;
  #parts: TravelWindowParts;

  /** The destination the player picked; `null` until a pick. */
  #picked: Destination | null = null;

  #screenWidth: number;
  readonly #ui: UiRoot;
  #way: Way;
  readonly #ways: readonly Way[];

  constructor({ui, scheduler, start, from, way, ways, screenWidth, onClosed}: TravelWindowOptions) {
    this.#ui = ui;
    this.#way = way;
    this.#ways = ways;
    this.#screenWidth = screenWidth;

    // The way the window opens on is looked up too, should `ways` lack it.
    for (let listed of [way, ...ways]) {
      if (!this.#destinations.has(listed)) {
        this.#destinations.set(listed, getDestinations(start, from, listed));
      }
    }

    this.#panel = new Panel({
      theme: game.theme,
      layout: {...WINDOW_PADDING, flexDirection: 'column', alignItems: 'stretch'},
    });
    // The buttons are built before the modal, which declares the first
    // destination, or Back for a way with none, as its initial focus, so the
    // window opens with the ring on it. Their clicks read the modal from
    // this.modal, assigned right after.
    this.#parts = this.#build();
    this.modal = new Modal({
      theme: game.theme,
      children: [this.#panel],
      layout: {justifyContent: 'center', alignItems: 'center'},
      scheduler,
      fadeDuration: FADE_DURATION,
      initialFocus: this.#destinationButtons[0] ?? this.#parts.back,
      onClosed: () => {
        onClosed(this.#picked);
      },
    });
    // The focus goes back to whatever had it before once the window closes.
    ui.addOverlay(this.modal);
  }

  /** The way whose destinations the list shows. */
  get way(): Way {
    return this.#way;
  }

  /** Lays the window out again for a screen of this width. */
  resize(screenWidth: number): void {
    if (this.modal.view.destroyed) {
      return;
    }

    // The buttons are built again, and the focus stays at the same position:
    // the same way, the destination of the same index, or Back.
    let {back, list, row, titleBlock, wayButtons} = this.#parts;
    let {focused} = this.#ui;
    let wayIndex = focused instanceof Button ? wayButtons.indexOf(focused) : -1;
    let destinationIndex =
      focused instanceof Button ? this.#destinationButtons.indexOf(focused) : -1;
    let previousChildren = [titleBlock, row, list, back];

    // Destroying the list destroys its destination buttons.
    this.#panel.removeChild(...previousChildren);

    for (let child of previousChildren) {
      child.destroy();
    }

    this.#screenWidth = screenWidth;

    let parts = this.#build();
    let focusTarget =
      parts.wayButtons[wayIndex] ??
      this.#destinationButtons[destinationIndex] ??
      (focused === back ? parts.back : undefined);

    this.#parts = parts;

    if (focusTarget !== undefined) {
      this.#ui.focus(focusTarget);
    }
  }

  // Builds the title block, the row, the list and Back for the screen's
  // width, and adds them to the panel.
  #build(): TravelWindowParts {
    let widths = getWidths(this.#screenWidth);
    let titleBlock = createWindowTitle(TITLES[this.#way], widths.text);
    let [title] = titleBlock.children;

    if (!(title instanceof Text)) {
      throw new TypeError('The title block has no title!');
    }

    // The ways share the window's width equally, so the three fit the
    // narrowest screen.
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
      layout: {gap: WAY_GAP, width: widths.text, height: BUTTON_HEIGHT, marginTop: TITLE_BLOCK_GAP},
    });
    // The list is as high as the longest list of all the ways needs, so
    // switching the way moves neither the row nor Back.
    let listHeight = Math.max(
      ...[...this.#destinations.values()].map((destinations) =>
        getListHeight(destinations, widths),
      ),
    );

    this.#destinationButtons = this.#createDestinationButtons();

    let list = new Container({
      children: this.#destinationButtons,
      layout: {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: DESTINATION_GAP,
        width: widths.text,
        height: listHeight,
        // A list that no way fills takes no room, nor a gap of its own.
        marginTop: listHeight === 0 ? 0 : SECTION_GAP,
      },
    });
    let back = new Button({
      theme: game.theme,
      children: [createLabel('Back', measureLabel('Back'))],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start', marginTop: SECTION_GAP},
      onClick: () => {
        if (!this.#isClosing()) {
          this.modal.close();
        }
      },
    });

    this.#panel.addChild(titleBlock, row, list, back);

    return {back, list, row, title, titleBlock, wayButtons};
  }

  // One button per destination of the current way, in the order of
  // getDestinations. The numbers stand at the right end of the name's first
  // line, or under the name.
  #createDestinationButtons(): Button[] {
    let widths = getWidths(this.#screenWidth);

    return (this.#destinations.get(this.#way) ?? []).map((destination) => {
      let label = getDestinationLabel(destination, widths);

      return new Button({
        theme: game.theme,
        children: [
          createLabel(label.name, label.nameWidth, label.nameLineCount),
          createLabel(label.numbers, label.numbersWidth),
        ],
        layout: {
          ...(widths.isNarrow ?
            {flexDirection: 'column', justifyContent: 'flex-start'}
          : {justifyContent: 'space-between'}),
          alignItems: 'flex-start',
          height: label.height,
        },
        onClick: () => {
          if (!this.#isClosing()) {
            this.#picked = destination;
            this.modal.close();
          }
        },
      });
    });
  }

  // A press can still arrive during the fade: a pick, Back or a way must do
  // nothing over a closing window.
  #isClosing(): boolean {
    return this.modal.state === 'closing' || this.modal.state === 'closed';
  }

  // Makes the way current: the title and the list change, and the focus stays
  // on the pressed button. Pressing the current way changes nothing.
  #switchWay(way: Way, button: Button): void {
    if (this.#isClosing() || way === this.#way) {
      return;
    }

    let {list, title} = this.#parts;

    this.#way = way;
    title.setText(TITLES[way]);
    list.removeChild(...this.#destinationButtons);

    for (let destinationButton of this.#destinationButtons) {
      destinationButton.destroy();
    }

    this.#destinationButtons = this.#createDestinationButtons();
    list.addChild(...this.#destinationButtons);
    this.#ui.focus(button);
  }
}
