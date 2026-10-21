import {Button, Container, Modal, Panel, type Scheduler, type UiRoot, wrapText} from 'tellurion';

import {game} from '../core/game.js';
import {getPageBreaks} from '../core/getPageBreaks.js';
import {
  BUTTON_GAP,
  BUTTON_HEIGHT,
  CHOICES_GAP,
  getTextWidth,
  LINE_HEIGHT,
  MARGIN,
  type SceneArea,
  WINDOW_GAP,
  WINDOW_PADDING_Y,
} from '../core/getSceneArea.js';
import {formatTime, isNightOver} from '../core/hours.js';
import {measureText} from '../core/measureText.js';
import {type Night} from '../core/night.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {TextBlock} from './textBlock.js';
import {createLabel, getArea} from './topRow.js';
import {createWindowTitle, TITLE_HEIGHT, WINDOW_PADDING} from './windowTitle.js';

export type StoriesWindowOptions = {
  ui: UiRoot;
  scheduler: Scheduler;
  night: Night | null;

  /** Called once the window has closed. */
  onClosed: () => void;
};

/** What one layout builds for the screen's size; a resize builds it again, and the buttons stay. */
type StoriesLayout = {
  /** The scene area it was built for. */
  area: SceneArea;

  /** The list as one text, wrapped to the text's width. */
  formatted: string;

  /** The offset at which each page starts: 0, then the breaks. */
  pageStarts: number[];

  /** The row of Back and Next; `null` for a list of one page. */
  row: Container | null;

  textBlock: TextBlock;
  titleBlock: Container;
};

/**
 * The night's stories, found so far, one a line with the time of the find, in a window above the
 * menu or the log: a title with the count, the list, page by page with Back and Next when it needs
 * more than one, and Close. It is built per opening and owns a `Modal`, which Close closes, and so
 * does the cancel command, which the engine sends to the topmost overlay.
 */
export class StoriesWindow {
  readonly modal: Modal;

  readonly #back: Button;
  readonly #close: Button;

  /** The parts of the last layout, and what it cut the list into. */
  #layout: StoriesLayout;

  readonly #next: Button;
  readonly #night: Night | null;

  /** The page shown, from 0. */
  #page = 0;

  readonly #panel: Panel;
  readonly #ui: UiRoot;

  constructor({ui, scheduler, night, onClosed}: StoriesWindowOptions) {
    this.#ui = ui;
    this.#night = night;
    this.#back = new Button({
      theme: game.theme,
      children: [createLabel('Back')],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
      onClick: () => {
        this.#turnPage(-1);
      },
    });
    this.#next = new Button({
      theme: game.theme,
      children: [createLabel('Next')],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
      onClick: () => {
        this.#turnPage(1);
      },
    });
    // Its click reads the modal from this.modal, assigned when the modal is
    // built. close() does nothing on a closing or closed modal.
    this.#close = new Button({
      theme: game.theme,
      children: [createLabel('Close')],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
      onClick: () => {
        this.modal.close();
      },
    });
    this.#panel = new Panel({
      theme: game.theme,
      layout: {...WINDOW_PADDING, flexDirection: 'column', gap: WINDOW_GAP},
    });
    this.#layout = this.#layOut();
    // Nothing is focused on open. The top padding centres the window in the
    // scene area, as the story window's view does.
    this.modal = new Modal({
      theme: game.theme,
      children: [this.#panel],
      layout: {justifyContent: 'center', alignItems: 'center', paddingTop: this.#layout.area.top},
      scheduler,
      fadeDuration: UI_FADE_DURATION,
      onClosed,
    });
    this.#showPage();
    ui.addOverlay(this.modal);
  }

  /** Lays the window out again for the screen's size, keeping the page. */
  resize(): void {
    let area = getArea();

    // The night screen lays itself out at every arrival too: the same size
    // builds nothing again.
    if (area.width === this.#layout.area.width && area.height === this.#layout.area.height) {
      return;
    }

    // The page shown is the one that holds the offset at which the shown page
    // began. wrapText adds and removes no character, so an offset points at
    // the same letter at every width.
    let offset = this.#layout.pageStarts[this.#page] ?? 0;

    this.#takeApart();
    this.#layout = this.#layOut();
    this.#page = this.#layout.pageStarts.findLastIndex((start) => start <= offset);
    this.modal.view.layout = {paddingTop: area.top};
    this.#showPage();
  }

  // Builds the title block, the text block and, for a list of more than one
  // page, the row of Back and Next for the screen's size, and adds them to the
  // panel with Close under them. The block is as tall as the list, up to the
  // lines the scene area allows less the margins, the paddings, the title
  // block and its gap, and Close and its gap, as the log screen counts its
  // lines; a list that needs more is cut into pages, and the row takes its
  // room from the text.
  #layOut(): StoriesLayout {
    let area = getArea();
    let textWidth = getTextWidth(area.width);
    let stories = this.#night?.stories ?? [];
    // A null night reads as empty and over.
    let formatted =
      stories.length > 0 ?
        stories
          .map(({title, minutes}) =>
            wrapText(`${formatTime(minutes)}  ${title}`, textWidth, measureText),
          )
          .join('\n')
      : this.#night !== null && !isNightOver(this.#night) ? 'None yet'
      : 'None';
    let room =
      area.height -
      2 * MARGIN -
      2 * WINDOW_PADDING_Y -
      TITLE_HEIGHT -
      WINDOW_GAP -
      CHOICES_GAP -
      BUTTON_HEIGHT;
    let lineCount = formatted.split('\n').length;
    let isPaged = lineCount > Math.max(1, Math.floor(room / LINE_HEIGHT));
    let linesPerPage =
      isPaged ?
        Math.max(1, Math.floor((room - BUTTON_GAP - BUTTON_HEIGHT) / LINE_HEIGHT))
      : lineCount;
    let titleBlock = createWindowTitle(`Stories  ${stories.length} found`, textWidth);
    let textBlock = new TextBlock({width: textWidth, height: linesPerPage * LINE_HEIGHT});
    let row =
      isPaged ?
        new Container({
          children: [this.#back, this.#next],
          layout: {
            gap: BUTTON_GAP,
            width: textWidth,
            height: BUTTON_HEIGHT,
            // The panel's gap and this make the room between the text and the row.
            marginTop: CHOICES_GAP - WINDOW_GAP,
          },
        })
      : null;

    // The panel's gap and this make the room above Close.
    this.#close.view.layout = {
      width: textWidth,
      marginTop: (row === null ? CHOICES_GAP : BUTTON_GAP) - WINDOW_GAP,
    };
    this.#panel.addChild(titleBlock, textBlock, ...(row === null ? [] : [row]), this.#close);

    return {
      area,
      formatted,
      pageStarts: [0, ...getPageBreaks(formatted, linesPerPage)],
      row,
      textBlock,
      titleBlock,
    };
  }

  // Shows the page's slice of the list, whole and at once. Back is disabled on
  // the first page and Next on the last. When a turn disables the button that
  // has the focus, the focus moves to the other one, so Enter on Next reads
  // the list through and Enter on Back reads it back.
  #showPage(): void {
    let {formatted, pageStarts, textBlock} = this.#layout;

    textBlock.show(
      formatted,
      pageStarts[this.#page] ?? 0,
      pageStarts[this.#page + 1] ?? formatted.length,
    );

    if (this.#page > 0) {
      this.#back.enable();
    } else {
      this.#back.disable();
    }

    if (this.#page < pageStarts.length - 1) {
      this.#next.enable();
    } else {
      this.#next.disable();
    }

    if (this.#ui.focused === this.#back && this.#back.isDisabled && !this.#next.isDisabled) {
      this.#ui.focus(this.#next);
    } else if (this.#ui.focused === this.#next && this.#next.isDisabled && !this.#back.isDisabled) {
      this.#ui.focus(this.#back);
    }
  }

  // Takes the parts of the last layout off the panel and destroys them. The
  // three buttons leave their containers first, so they stay, and the focus
  // with them.
  #takeApart(): void {
    let {row, textBlock, titleBlock} = this.#layout;

    row?.removeChild(this.#back, this.#next);
    this.#panel.removeChild(this.#close);

    for (let part of [titleBlock, textBlock, row]) {
      if (part !== null) {
        this.#panel.removeChild(part);
        part.destroy();
      }
    }
  }

  #turnPage(step: number): void {
    let nextPage = Math.min(Math.max(this.#page + step, 0), this.#layout.pageStarts.length - 1);

    if (nextPage !== this.#page) {
      this.#page = nextPage;
      this.#showPage();
    }
  }
}
