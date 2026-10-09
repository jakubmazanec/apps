import * as pixi from 'pixi.js';
import {
  Button,
  Container,
  Dialogue,
  type DialogueNode,
  easeOutQuad,
  type Overlay,
  Panel,
  type RunnableDialogueScript,
  type Scheduler,
  Text,
  type UiChild,
  type UiRoot,
  wrapText,
} from 'tellurion';

import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {getPageBreaks} from '../core/getPageBreaks.js';
import {
  BUTTON_PADDING_X,
  BUTTON_PADDING_Y,
  GLYPH_WIDTH,
  LINE_HEIGHT,
  MARGIN,
  type SceneArea,
  WINDOW_PADDING_X,
  WINDOW_PADDING_Y,
  WINDOW_WIDTH,
} from '../core/getSceneArea.js';
import {input} from '../core/input.js';
import {MARK, splitMarked, stripMarks} from '../core/markedText.js';
import {measureText} from '../core/measureText.js';
import {type Night} from '../core/night.js';
import {asChoice, type Choice, formatChoice} from '../core/script.js';
import {UI_FADE_DURATION} from '../core/theme.js';
import {createWindowTitle, TITLE_HEIGHT, WINDOW_PADDING} from './windowTitle.js';

export type StoryWindowOptions = {
  /** Scheduler of the screen that opens the window; it drives the fade. */
  scheduler: Scheduler;

  script: RunnableDialogueScript<Night>;
  context: Night;
  area: SceneArea;

  /** Called when the window starts to fade out, once its text has ended. */
  onClosing?: () => void;

  /** Called once the window has closed. */
  onClosed: () => void;
};

export type StoryWindowState = 'closed' | 'closing' | 'open' | 'opening';

// Sizes in art pixels.
// Between the title block and the text.
const WINDOW_GAP = 4;
// Between the text and the first choice.
const CHOICES_GAP = 8;
// Between two choices: a focus ring reaches 2 out and does not touch the next button.
const BUTTON_GAP = 4;
// From a letter cell's top left corner to the cursor's.
const CURSOR_OFFSET = 2;
const BLIP_EVERY_GLYPHS = 3;
// A frame that reveals this many characters is a skip: one blip at most.
const SKIP_THRESHOLD = 4;
const CURSOR_BLINK_MS = 500;

function measureLabel(text: string): number {
  return measureText(text, 'label');
}

/**
 * The window all text appears in, over the dimmed scene. A `Dialogue` runner
 * drives it: the window shows the runner's node, types its text, cuts it into
 * pages and offers its choices.
 *
 * It is an overlay without `close`, so the cancel command passes over it: the
 * window ends only through its text or through a choice. The night screen adds
 * it with `ui.addOverlay`, and the window runs its own fade, as a `Modal`
 * would. It blocks taps on the scene but draws no scrim: the night screen dims
 * the scene behind all its windows, so the scene stays dimmed from one window
 * to the next.
 *
 * The layout is settled when a node is shown, from the whole text and the
 * node's choices, so nothing moves while the text types or the pages turn.
 * A tap on the text or on the room under it that the choices fill, a key
 * press and the choice buttons only tell the runner what was pressed;
 * `update` then brings the window in line with the runner. New choices fade
 * in and take a tap once fully shown.
 */
export class StoryWindow implements Overlay {
  readonly children: UiChild[];
  readonly dialogue: Dialogue<Night>;
  readonly view: pixi.Container = new pixi.Container();

  #area: SceneArea;

  /** Time in ms the cursor has blinked since the runner became idle. */
  #blinkTime = 0;

  /** Characters revealed since the last blip, spaces, line ends and marks not counted. */
  #blipGlyphs = 0;

  /** Offsets in the wrapped text where a page ends. */
  #breaks: number[] = [];

  /** Room for the choices; a node without choices has none. */
  #buttonArea: Container | null = null;

  #buttons: Button[] = [];

  /** Cancels the running fade of the choices. */
  #cancelChoicesFade: (() => void) | null = null;

  /** Cancels the running fade. */
  #cancelFade: (() => void) | null = null;

  /** The visible choices' texts, each wrapped to the inside of its button. */
  #choiceLabels: string[] = [];

  /** The visible choices, in the order of their labels. */
  #choices: Array<Choice<string>> = [];

  /** The choice buttons of the shown node: not built, fading in, or fully shown. */
  #choicesState: 'fading' | 'none' | 'shown' = 'none';

  /** Shows that a press turns the page or closes the window. It sits after the last letter. */
  readonly #cursor: pixi.Sprite;

  /** Whether an `update` has got past its guard: the window open or opening, and topmost. */
  #hasUpdated = false;

  /** The text's leaf in the italic font; it has the regular leaf's size and place. */
  #italicLeaf: Text | null = null;

  /** Width of a button's label. */
  #labelWidth = 1;

  #lastRevealedCount = 0;

  /** The night the script runs on; the labels and the greyed-out choices read it. */
  readonly #night: Night;

  readonly #onClosed: () => void;
  readonly #onClosing: (() => void) | undefined;
  readonly #panel: Panel;

  /** Takes the taps on the text and on the room under it, under the choice buttons. */
  readonly #pressSurface: pixi.Container = new pixi.Container();

  /** The text's leaf in the regular font. */
  #regularLeaf: Text | null = null;

  readonly #scheduler: Scheduler;
  #shownNode: DialogueNode<Night, string> | null = null;
  #shownPageIndex = 0;

  /** The slice of the wrapped text the leaves show, marks kept; null for leaves just made. */
  #shownSlice: string | null = null;

  #state: StoryWindowState = 'closed';

  /** The shown slice without its marks. */
  #text = '';

  /** Holds the two leaves of the text at the same place. */
  #textBlock: Container | null = null;

  /** The speaker's title and the rule under it; a node without a speaker has none. */
  #titleBlock: Container | null = null;

  /** Room the title block and the gap under it take, 0 for a node without a speaker. */
  #titleHeight = 0;

  #ui: UiRoot | null = null;

  /** Whether the runner was idle at the last `update`. */
  #wasIdle = false;

  /** The runner's page, wrapped to the width of the text, marks kept. */
  #wrapped = '';

  constructor({scheduler, script, context, area, onClosing, onClosed}: StoryWindowOptions) {
    this.#scheduler = scheduler;
    this.#area = area;
    this.#onClosing = onClosing;
    this.#onClosed = onClosed;
    this.#night = context;
    this.dialogue = new Dialogue({script, context});
    this.#panel = new Panel({
      theme: game.theme,
      layout: {flexDirection: 'column', ...WINDOW_PADDING, gap: WINDOW_GAP},
    });
    this.children = [this.#panel];

    this.#cursor = new pixi.Sprite({texture: assets.spriteset('ui').texture('cursor')});
    this.#cursor.visible = false;
    // A tap on the cursor reaches the press surface under it, as a tap on the
    // letter before it does.
    this.#cursor.eventMode = 'none';

    // A sibling of the choice buttons, not their parent, so a tap on a choice
    // does not reach it as well.
    this.#pressSurface.eventMode = 'static';
    this.#pressSurface.on('pointertap', () => {
      this.#continueText();
    });

    // The layer under the panel draws nothing and takes every pointer event, so
    // nothing behind the window can be pressed while it is open. The night
    // screen dims the scene behind its windows.
    let tapBlocker = new pixi.Container();

    tapBlocker.eventMode = 'static';
    tapBlocker.hitArea = {contains: () => true};

    // The view covers the screen; position: 'absolute' keeps it out of the flex
    // flow of the UI root's view. The top padding leaves the top row out, so
    // the panel is centred in the scene area.
    this.view.layout = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: area.top,
    };
    this.view.addChild(tapBlocker, this.#panel.view);
    this.#showNode();
  }

  get state(): StoryWindowState {
    return this.#state;
  }

  /** Text the window shows at the moment, without the marks. */
  get text(): string {
    return this.#text;
  }

  /** @internal Called by `UiRoot`. */
  attach(ui: UiRoot): void {
    if (this.#ui !== null) {
      throw new Error('Story window is already attached to a UI root!');
    }

    this.#ui = ui;
    this.#state = 'opening';
    this.view.alpha = 0;
    this.#fade(1, () => {
      this.#state = 'open';
    });

    // A detach cancelled the fade of these choices; they fade in again.
    if (this.#choicesState === 'fading' && this.#buttonArea !== null) {
      this.#fadeInChoices(this.#buttonArea);
    }
  }

  /** Destroys the window at once, without the fade and without calling `onClosed`. */
  destroy(): void {
    if (this.view.destroyed) {
      return;
    }

    // Leaves the root first, while the buttons are alive: removeOverlay gives
    // the focus back to what had it before the window and calls detach(),
    // which cancels the running fades.
    this.#ui?.removeOverlay(this);
    this.#panel.destroy();
    this.view.destroy({children: true});
  }

  /** @internal Called by `UiRoot`. */
  detach(): void {
    if (this.#ui === null) {
      throw new Error('Story window is not attached to a UI root!');
    }

    this.#cancelFade?.();
    this.#cancelFade = null;
    this.#cancelChoicesFade?.();
    this.#cancelChoicesFade = null;
    this.#ui = null;
    this.#state = 'closed';
  }

  resize(area: SceneArea): void {
    if (this.view.destroyed) {
      return;
    }

    this.#area = area;

    let ui = this.#ui;

    // A window that is not attached has nothing on the screen to lay out; it
    // keeps the area for later.
    if (ui === null) {
      return;
    }

    // The buttons are built again, and the focus stays at the same position:
    // a player who moved to another choice keeps it.
    let previousFocus = ui.focused;
    let focusedIndex = previousFocus instanceof Button ? this.#buttons.indexOf(previousFocus) : -1;

    this.view.layout = {paddingTop: area.top};
    this.#showNode();

    let focusedButton = this.#buttons[focusedIndex];

    if (focusedButton !== undefined) {
      ui.focus(focusedButton);
    }
  }

  update(deltaMS: number): void {
    let ui = this.#ui;

    // The text waits while another overlay, the menu, lies above the window,
    // and a window that fades out takes no press.
    if (ui?.topOverlay !== this || (this.#state !== 'open' && this.#state !== 'opening')) {
      return;
    }

    let isFirstUpdate = !this.#hasUpdated;

    this.#hasUpdated = true;

    // On the first update the frame's press is the one that opened the
    // window. A press that a focused choice took leaves the focus on that
    // choice, so it does not continue the next node's text.
    if (input.focusPressed('activate') && ui.focused === null && !isFirstUpdate) {
      this.#continueText();
    }

    this.dialogue.tick(deltaMS);

    // A count that went down means the runner entered the same node again.
    if (
      this.dialogue.node !== this.#shownNode ||
      this.dialogue.pageIndex !== this.#shownPageIndex ||
      this.dialogue.revealedCount < this.#lastRevealedCount
    ) {
      this.#choicesState = 'none';
      this.#lastRevealedCount = 0;
      this.#blipGlyphs = 0;
      this.#showNode();
    }

    this.#showRevealed();
    this.#playBlips();

    if (this.dialogue.phase === 'choosing' && this.#choicesState === 'none') {
      this.#choicesState = 'fading';
      this.#buildChoices();
    }

    this.#updateCursor(deltaMS);

    if (this.dialogue.phase === 'ended') {
      this.#close();
    }
  }

  // One button per visible choice, in the room the node reserved for them.
  // None is focused: the first arrow or Tab press focuses the first. New
  // choices fade in, and so do choices a resize builds again in their fade;
  // choices a resize builds again once fully shown come back fully shown. A
  // choice that costs more than the night has is greyed out: it takes no tap
  // and the arrows skip it.
  #buildChoices(): void {
    let buttonArea = this.#buttonArea;

    if (buttonArea === null) {
      return;
    }

    this.#buttons = this.#choiceLabels.map((label, index) => {
      let lineCount = label.split('\n').length;
      // The label has an explicit size: a leaf sized by its own bounds is
      // measured again later, and the button would move its label then.
      let button = new Button({
        theme: game.theme,
        children: [
          new Text({
            text: label,
            theme: game.theme,
            layout: {width: this.#labelWidth, height: lineCount * LINE_HEIGHT},
          }),
        ],
        layout: {
          height: lineCount * LINE_HEIGHT + 2 * BUTTON_PADDING_Y,
          justifyContent: 'flex-start',
        },
        onClick: () => {
          this.dialogue.choose(index);
        },
      });

      if ((this.#choices[index]?.price ?? 0) > this.#night.money) {
        button.disable();
      }

      return button;
    });

    buttonArea.addChild(...this.#buttons);

    if (this.#choicesState === 'fading') {
      this.#fadeInChoices(buttonArea);
    }
  }

  // The runner has ended: the owner hears of it, the window fades out, then
  // destroy() takes it off the root and the owner hears of it again.
  #close(): void {
    this.#state = 'closing';
    this.#onClosing?.();
    this.#fade(0, () => {
      this.destroy();
      this.#onClosed();
    });
  }

  // A tap on the text or on the room under it, and Enter or Space with nothing
  // focused. While the runner is choosing, advance() would take the first
  // choice, which only a press on a choice may do, so a tap between two
  // choices, or on choices that are still fading in, does nothing, as a tap on
  // the text does then. While the window fades out, the runner has ended.
  #continueText(): void {
    if (
      this.#state === 'closing' ||
      this.#state === 'closed' ||
      this.dialogue.phase === 'choosing'
    ) {
      return;
    }

    this.dialogue.advance();
  }

  /** Fades the view to `alpha` on the scheduler, then calls `onComplete`. */
  #fade(alpha: number, onComplete: () => void): void {
    this.#cancelFade?.();
    this.#cancelFade = this.#scheduler.tween({
      target: this.view,
      to: {alpha},
      duration: UI_FADE_DURATION,
      easing: easeOutQuad,
      onComplete: () => {
        this.#cancelFade = null;
        onComplete();
      },
    });
  }

  // Fades the choices in on the scheduler, over the duration of every UI fade.
  // The first tap of a double tap under the text can finish it, and the
  // choices then appear under the finger. Until they are fully shown they are
  // no pointer target: a second tap within the fade (about 100 ms after they
  // appear) reaches the press surface under them and does nothing, as a tap on
  // the text does while the runner is choosing. A later second tap takes the
  // choice under it.
  // Keys are not held back: the choices appear with nothing focused, so Enter
  // only takes one after an arrow or Tab press has focused it.
  #fadeInChoices(buttonArea: Container): void {
    let {view} = buttonArea;

    view.alpha = 0;
    view.eventMode = 'none';
    this.#cancelChoicesFade?.();
    this.#cancelChoicesFade = this.#scheduler.tween({
      target: view,
      to: {alpha: 1},
      duration: UI_FADE_DURATION,
      easing: easeOutQuad,
      onComplete: () => {
        this.#cancelChoicesFade = null;
        this.#choicesState = 'shown';
        // Pixi's default: the area itself takes no tap, the buttons in it do.
        view.eventMode = 'passive';
      },
    });
  }

  // Puts the cursor after the last letter shown. A page that another page
  // follows ends with the line end its break took; that line end is dropped,
  // so the cursor stays on the page's last line.
  #placeCursor(): void {
    let text = this.#text.endsWith('\n') ? this.#text.slice(0, -1) : this.#text;
    let lastLineEnd = text.lastIndexOf('\n');
    let line = text.split('\n').length - 1;
    let column = text.length - lastLineEnd - 1;

    this.#cursor.position.set(
      WINDOW_PADDING_X + column * GLYPH_WIDTH + CURSOR_OFFSET,
      WINDOW_PADDING_Y + this.#titleHeight + line * LINE_HEIGHT + CURSOR_OFFSET,
    );
  }

  // Plays the blip once per three revealed characters other than spaces, line
  // ends and marks, which show nothing.
  #playBlips(): void {
    let {revealedCount} = this.dialogue;
    let newCount = revealedCount - this.#lastRevealedCount;

    if (newCount <= 0) {
      return;
    }

    let glyphs = 0;

    for (let character of this.#wrapped.slice(this.#lastRevealedCount, revealedCount)) {
      if (character !== ' ' && character !== '\n' && character !== MARK) {
        glyphs += 1;
      }
    }

    this.#lastRevealedCount = revealedCount;

    if (newCount >= SKIP_THRESHOLD) {
      this.#blipGlyphs = 0;

      if (glyphs > 0) {
        audio.play(assets.sound('blip'), {bus: 'sfx'});
      }

      return;
    }

    this.#blipGlyphs += glyphs;

    if (this.#blipGlyphs >= BLIP_EVERY_GLYPHS) {
      this.#blipGlyphs %= BLIP_EVERY_GLYPHS;
      audio.play(assets.sound('blip'), {bus: 'sfx'});
    }
  }

  // Settles the layout for the runner's node and replaces the panel's content:
  // the title block, the text block and, for a node with choices, the button
  // area.
  #showNode(): void {
    let {node, pageIndex, pageText, visibleChoices} = this.dialogue;

    this.#shownNode = node;
    this.#shownPageIndex = pageIndex;
    // A running fade of the choices tweens the button area, destroyed below.
    this.#cancelChoicesFade?.();
    this.#cancelChoicesFade = null;

    for (let child of [this.#titleBlock, this.#textBlock, this.#buttonArea]) {
      if (child !== null) {
        this.#panel.removeChild(child);
        child.destroy();
      }
    }

    this.#titleBlock = null;
    this.#textBlock = null;
    this.#regularLeaf = null;
    this.#italicLeaf = null;
    this.#buttonArea = null;
    this.#buttons = [];
    this.#shownSlice = null;
    this.#text = '';

    // The runner ended before it showed a node; update() closes the window.
    if (node === null) {
      return;
    }

    let windowWidth = Math.min(WINDOW_WIDTH, Math.floor(this.#area.width - 2 * MARGIN));
    let textWidth = Math.max(1, windowWidth - 2 * WINDOW_PADDING_X);

    this.#labelWidth = Math.max(1, textWidth - 2 * BUTTON_PADDING_X);
    this.#choices = visibleChoices.map(asChoice);
    this.#choiceLabels = this.#choices.map((choice) =>
      wrapText(formatChoice(choice, this.#night), this.#labelWidth, measureLabel),
    );

    // A node with choices reserves the room they need from the start, so the
    // choices later fill room that already exists. A node without choices
    // reserves none.
    let buttonAreaHeight = 0;

    if (this.#choiceLabels.length > 0) {
      buttonAreaHeight = (this.#choiceLabels.length - 1) * BUTTON_GAP;

      for (let label of this.#choiceLabels) {
        buttonAreaHeight += label.split('\n').length * LINE_HEIGHT + 2 * BUTTON_PADDING_Y;
      }
    }

    let choicesHeight = buttonAreaHeight === 0 ? 0 : CHOICES_GAP + buttonAreaHeight;
    let titleHeight = node.speaker === undefined ? 0 : TITLE_HEIGHT + WINDOW_GAP;
    let textRoom =
      this.#area.height - 2 * MARGIN - 2 * WINDOW_PADDING_Y - titleHeight - choicesHeight;
    let linesPerPage = Math.max(1, Math.floor(textRoom / LINE_HEIGHT));

    this.#titleHeight = titleHeight;
    // Marks show nothing, so a line holds as many letters as without them.
    // wrapText adds and removes no character, so the breaks and the runner's
    // revealed count, which both count the marks, point at the same places.
    this.#wrapped = wrapText(pageText, textWidth, (text) => measureText(stripMarks(text)));
    this.#breaks = getPageBreaks(this.#wrapped, linesPerPage);
    // The runner ignores the breaks that lie before its revealed count, which
    // matters after a resize in the middle of a text.
    this.dialogue.setBreaks(this.#breaks);

    // The leaves are as tall as the longest page, not as the text typed so far.
    let textHeight = Math.min(this.#wrapped.split('\n').length, linesPerPage) * LINE_HEIGHT;

    if (node.speaker !== undefined) {
      this.#titleBlock = createWindowTitle(node.speaker, textWidth);
      this.#panel.addChild(this.#titleBlock);
    }

    // Two leaves of the same size at the same place, one per font. Every
    // letter advances by 6 in both, so a letter lands where it would in one
    // text, and each leaf has spaces where the other one draws.
    let leafLayout = {
      position: 'absolute',
      left: 0,
      top: 0,
      width: textWidth,
      height: textHeight,
    } as const;

    this.#regularLeaf = new Text({text: '', theme: game.theme, role: 'body', layout: leafLayout});
    this.#italicLeaf = new Text({
      text: '',
      theme: game.theme,
      role: 'body',
      fontFamily: 'monogram-italic',
      layout: leafLayout,
    });
    this.#textBlock = new Container({
      children: [this.#regularLeaf, this.#italicLeaf],
      layout: {width: textWidth, height: textHeight},
    });
    this.#panel.addChild(this.#textBlock);

    // The press surface and the cursor sit out of the layout flow, in the
    // panel's own coordinates, and are added again after each rebuild. Pixi
    // tests the parts from the top down and stops at the first one under a
    // tap, interactive or not; a tap that stops at a letter goes to the
    // panel, which ignores it. So the surface lies above the title and the
    // text, and under the button area, whose buttons take a tap on them
    // first. The surface spans the panel's width. For a node without choices
    // it reaches the panel's bottom edge, so a tap on the padding around the
    // text continues the text. For a node with choices it reaches the bottom
    // of the room the choices fill, so a tap in that room does what a tap on
    // the text does at the same moment, except on a choice that has fully
    // faded in. The cursor lies on top, takes no pointer events and follows
    // the text: #showRevealed places it after the last letter, and after a
    // full line it lies in the padding on the right, which the surface
    // covers too.
    let panelWidth = textWidth + 2 * WINDOW_PADDING_X;
    let textBottom = WINDOW_PADDING_Y + titleHeight + textHeight;
    let panelHeight = textBottom + choicesHeight + WINDOW_PADDING_Y;
    let surfaceHeight = choicesHeight === 0 ? panelHeight : textBottom + choicesHeight;

    this.#pressSurface.hitArea = new pixi.Rectangle(0, 0, panelWidth, surfaceHeight);
    this.#panel.view.addChild(this.#pressSurface);

    if (buttonAreaHeight > 0) {
      this.#buttonArea = new Container({
        layout: {
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: BUTTON_GAP,
          width: textWidth,
          height: buttonAreaHeight,
          // The panel's gap and this make the room between the text and the
          // first choice.
          marginTop: CHOICES_GAP - WINDOW_GAP,
        },
      });
      this.#panel.addChild(this.#buttonArea);

      // After a resize the choices are built again at once.
      if (this.#choicesState !== 'none') {
        this.#buildChoices();
      }
    }

    this.#panel.view.addChild(this.#cursor);
    this.#showRevealed();
  }

  // Shows the wrapped page from the start of the current page up to the
  // revealed count. The current page starts at the last break that lies before
  // the revealed count: at a pause the finished page stays, and the next page
  // replaces it with its first character.
  #showRevealed(): void {
    let {revealedCount} = this.dialogue;
    let pageStart = 0;

    for (let offset of this.#breaks) {
      if (offset < revealedCount) {
        pageStart = offset;
      }
    }

    let slice = this.#wrapped.slice(pageStart, revealedCount);

    if (slice === this.#shownSlice) {
      return;
    }

    // A page that starts inside an italic passage starts in italic, so the
    // marks are counted from the start of the text, not of the page.
    let {regular, italic} = splitMarked(this.#wrapped, pageStart, revealedCount);

    this.#shownSlice = slice;
    this.#text = stripMarks(slice);
    this.#regularLeaf?.setText(regular);
    this.#italicLeaf?.setText(italic);
    this.#placeCursor();
  }

  // The cursor blinks while the runner is idle, that is while a press would
  // turn the page or close the window. The blink starts in the on state
  // whenever the runner becomes idle.
  #updateCursor(deltaMS: number): void {
    let isIdle = this.dialogue.phase === 'idle';

    this.#blinkTime = isIdle && this.#wasIdle ? this.#blinkTime + deltaMS : 0;
    this.#wasIdle = isIdle;
    this.#cursor.visible = isIdle && Math.floor(this.#blinkTime / CURSOR_BLINK_MS) % 2 === 0;
  }
}
