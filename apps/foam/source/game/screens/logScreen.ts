import {Button, Container, GameScreen, type Modal, type Overlay, Panel, Text} from 'tellurion';

import {game} from '../core/game.js';
import {getPageBreaks} from '../core/getPageBreaks.js';
import {
  BUTTON_GAP,
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  CHOICES_GAP,
  getSceneArea,
  LINE_HEIGHT,
  MARGIN,
  type SceneArea,
  TOP_ROW_WIDTH,
  WINDOW_GAP,
  WINDOW_PADDING_X,
  WINDOW_PADDING_Y,
  WINDOW_WIDTH,
} from '../core/getSceneArea.js';
import {input} from '../core/input.js';
import {formatLog} from '../core/log.js';
import {stripMarks} from '../core/markedText.js';
import {measureText} from '../core/measureText.js';
import {formatStatus, type Night} from '../core/night.js';
import {playFocusSound} from '../core/playFocusSound.js';
import {openMenu} from './menuModal.js';
import {TextBlock} from './textBlock.js';
import {createWindowTitle, TITLE_HEIGHT, WINDOW_PADDING} from './windowTitle.js';

type LogScreenContents = {
  back: Button;

  /** The log as one marked text, wrapped to the text's width. */
  formatted: string;

  /** The topmost overlay at the end of the last update; see the night screen. */
  lastTopOverlay: Overlay | null;
  linesPerPage: number;
  menuButton: Button;
  menuModal: Modal | null;
  next: Button;

  /** The night whose log is shown; null before the first `showLog`. */
  night: Night | null;
  optionsModal: Modal | null;

  /** The page shown, from 0. */
  page: number;

  /** The offset at which each page starts: 0, then the breaks. */
  pageStarts: number[];
  panel: Panel;

  /** Keeps the night for the next show; `onShow` lays the screen out from it. */
  showLog: (night: Night) => void;
  statusText: Text;
  textBlock: TextBlock | null;
  title: Text;
  titleBlock: Container | null;
};
type LogScreen = GameScreen<LogScreenContents>;

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

// The night's status as it stood at the end, written as the night screen writes it.
function writeStatus({contents: {night, statusText}}: LogScreen): void {
  let status = night === null ? '' : formatStatus(night);

  statusText.setText(status);
  statusText.view.layout = {width: measureText(status, 'label')};
}

// Shows the page's slice of the log, whole and at once, and its number in the
// title. Back is disabled on the first page and Next on the last. When a turn
// disables the button that has the focus, the focus moves to the other one, so
// Enter on Next reads the log through and Enter on Back reads it back.
function showPage({contents, ui}: LogScreen): void {
  let {back, formatted, next, page, pageStarts, textBlock, title} = contents;

  title.setText(`The night  ${page + 1} of ${pageStarts.length}`);
  textBlock?.show(formatted, pageStarts[page] ?? 0, pageStarts[page + 1] ?? formatted.length);

  if (page > 0) {
    back.enable();
  } else {
    back.disable();
  }

  if (page < pageStarts.length - 1) {
    next.enable();
  } else {
    next.disable();
  }

  if (ui.focused === back && back.isDisabled && !next.isDisabled) {
    ui.focus(next);
  } else if (ui.focused === next && next.isDisabled && !back.isDisabled) {
    ui.focus(back);
  }
}

function turnPage(screen: LogScreen, step: number): void {
  let {page, pageStarts} = screen.contents;
  let nextPage = Math.min(Math.max(page + step, 0), pageStarts.length - 1);

  if (nextPage !== page) {
    screen.contents.page = nextPage;
    showPage(screen);
  }
}

// Takes the parts of the last layout off the panel and destroys them. Back and
// Next leave their row first, so they stay, and the focus with them.
function takeApart({contents: {back, next, panel, textBlock, titleBlock}}: LogScreen): void {
  let row =
    panel.children.find(
      (child): child is Container => child instanceof Container && child.children.includes(back),
    ) ?? null;

  row?.removeChild(back, next);

  for (let part of [titleBlock, textBlock, row]) {
    if (part !== null) {
      panel.removeChild(part);
      part.destroy();
    }
  }
}

// Lays the screen out for its size: the top row, and the window as tall as the
// scene area allows, with the log cut into pages that fill it.
function layOut(screen: LogScreen): void {
  let {back, next, night, page, pageStarts, panel, statusText} = screen.contents;
  let area = getArea();

  // The panel is centred in the scene area, as the story window is; the status
  // line and Menu stand out of the flow, in the top row.
  screen.ui.view.layout = {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: area.top,
  };
  // Where the night screen puts it with no place shown: at the left of the top
  // row, level with Menu's label, or under the top row on a screen narrower
  // than the one-line top row.
  statusText.view.layout =
    area.width < TOP_ROW_WIDTH ?
      {left: MARGIN, top: MARGIN + BUTTON_HEIGHT + MARGIN}
    : {left: MARGIN, top: MARGIN + (BUTTON_HEIGHT - LINE_HEIGHT) / 2};

  let windowWidth = Math.min(WINDOW_WIDTH, Math.floor(area.width - 2 * MARGIN));
  let textWidth = Math.max(1, windowWidth - 2 * WINDOW_PADDING_X);
  // The lines that fit the area's height less the margins, the paddings, the
  // title block and its gap, and the buttons' row and its gap: the window has
  // the same height on every page.
  let linesPerPage = Math.max(
    1,
    Math.floor(
      (area.height -
        2 * MARGIN -
        2 * WINDOW_PADDING_Y -
        TITLE_HEIGHT -
        WINDOW_GAP -
        CHOICES_GAP -
        BUTTON_HEIGHT) /
        LINE_HEIGHT,
    ),
  );
  // Marks show nothing, so a line holds as many letters as without them.
  let formatted = formatLog(night?.log ?? [], textWidth, (text) => measureText(stripMarks(text)));
  let newPageStarts = [0, ...getPageBreaks(formatted, linesPerPage)];
  // A resize keeps the player's place: the page shown is the one that holds the
  // offset at which the shown page began. wrapText adds and removes no
  // character, so an offset points at the same letter at every width.
  let offset = pageStarts[page] ?? 0;

  screen.contents.formatted = formatted;
  screen.contents.linesPerPage = linesPerPage;
  screen.contents.pageStarts = newPageStarts;
  screen.contents.page = newPageStarts.findLastIndex((start) => start <= offset);

  takeApart(screen);

  let titleBlock = createWindowTitle('', textWidth);
  let [title] = titleBlock.children;

  if (!(title instanceof Text)) {
    throw new TypeError('The title block has no title!');
  }

  let textBlock = new TextBlock({width: textWidth, height: linesPerPage * LINE_HEIGHT});
  let row = new Container({
    children: [back, next],
    layout: {
      gap: BUTTON_GAP,
      width: textWidth,
      height: BUTTON_HEIGHT,
      // The panel's gap and this make the room between the text and the row.
      marginTop: CHOICES_GAP - WINDOW_GAP,
    },
  });

  panel.addChild(titleBlock, textBlock, row);
  screen.contents.title = title;
  screen.contents.titleBlock = titleBlock;
  screen.contents.textBlock = textBlock;
  showPage(screen);
}

/**
 * The log of the night, page by page, after the night has ended: the night's top row, with the
 * final status and Menu, over one window titled "The night" with Back and Next. The night is handed
 * over with `showLog` before `showScreen`.
 */
export const logScreen = new GameScreen<LogScreenContents>({
  assetBundles: ['default'],
  onFocusEvent: playFocusSound,
  onAttach: (screen): LogScreenContents => {
    // The percentages resolve against game.view; layOut() sets the UI root's
    // layout.
    screen.view.layout = {width: '100%', height: '100%'};

    // layOut() positions it and writeStatus() sets its text and width.
    let statusText = new Text({
      text: '',
      theme: game.theme,
      fontFamily: 'monogram-outline',
      layout: {position: 'absolute', left: 0, top: 0, width: 0, height: LINE_HEIGHT},
    });
    // layOut() fills it.
    let panel = new Panel({
      theme: game.theme,
      layout: {...WINDOW_PADDING, flexDirection: 'column', gap: WINDOW_GAP},
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
    let back = new Button({
      theme: game.theme,
      children: [createLabel('Back')],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
      onClick: () => {
        turnPage(screen, -1);
      },
    });
    let next = new Button({
      theme: game.theme,
      children: [createLabel('Next')],
      layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
      onClick: () => {
        turnPage(screen, 1);
      },
    });

    // The Tab order is depth-first, so with nothing focused Tab reaches Next
    // (Back is disabled on the first page) before Menu.
    screen.ui.addChild(statusText, panel, menuButton);

    return {
      back,
      formatted: '',
      lastTopOverlay: null,
      linesPerPage: 1,
      menuButton,
      menuModal: null,
      next,
      night: null,
      optionsModal: null,
      page: 0,
      pageStarts: [0],
      panel,
      showLog: (night) => {
        screen.contents.night = night;
        screen.contents.page = 0;
      },
      statusText,
      textBlock: null,
      // Stands in until layOut() puts the title of its title block here.
      title: new Text({text: '', theme: game.theme}),
      titleBlock: null,
    };
  },
  // Nothing is focused: hiding the screen cleared the focus.
  onShow: (screen) => {
    screen.contents.lastTopOverlay = null;
    writeStatus(screen);
    layOut(screen);
  },
  onHide: (screen) => {
    // Owning-screen teardown rule, as on the night screen: synchronous
    // destroy(), never the animated close(), because the scheduler was already
    // cleared before onHide. The topmost window goes first.
    screen.contents.optionsModal?.destroy();
    screen.contents.menuModal?.destroy();

    screen.contents.optionsModal = null;
    screen.contents.menuModal = null;
  },
  onUpdate: (ticker, screen) => {
    // The night screen's rule for the cancel command (see its onUpdate): the
    // engine has already sent it to the topmost overlay, which closed if it
    // declares close, the menu or the Options window. With no overlay the
    // command opens the night's menu, so a stray Escape cannot lose the log,
    // which no screen can show again. The overlay that took the command is, as
    // a rule, the one on top at the end of the last update.
    let {lastTopOverlay} = screen.contents;

    if (input.focusPressed('cancel') && lastTopOverlay?.close === undefined) {
      openMenu(screen);
    }

    screen.contents.lastTopOverlay = screen.ui.topOverlay;
  },
  // The pages are cut again for the new size, and the page is kept. An open
  // menu is an overlay, which stays above.
  onResize: (screen) => {
    layOut(screen);
  },
});
