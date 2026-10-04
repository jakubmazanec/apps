import * as pixi from 'pixi.js';
import {
  Button,
  Container,
  Dialogue,
  type DialogueNode,
  Modal,
  Panel,
  type RunnableDialogueScript,
  type Scheduler,
  Text,
  type UiRoot,
  wrapText,
} from 'tellurion';

import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {getPageBreaks} from '../core/getPageBreaks.js';
import {BUTTON_HEIGHT, LINE_HEIGHT, MARGIN, type SceneArea} from '../core/getSceneArea.js';
import {measureText} from '../core/measureText.js';
import {type Night} from '../core/night.js';

export type StoryWindowOptions = {
  /** UI root of the screen that opens the window. */
  ui: UiRoot;

  /** Scheduler of that screen; it drives the fade. */
  scheduler: Scheduler;

  script: RunnableDialogueScript<Night>;
  context: Night;
  area: SceneArea;

  /** Called once the window has closed. */
  onClosed: () => void;
};

// Sizes in art pixels.
const WINDOW_WIDTH = 300;
const WINDOW_PADDING = 8;
const WINDOW_GAP = 4;
const BUTTON_GAP = 2;
// Padding of a button, as in the theme. A label is wrapped to the button's
// width minus this padding on both sides.
const BUTTON_PADDING = 2;
const BLIP_EVERY_GLYPHS = 3;
// A frame that reveals this many characters is a skip: one blip at most.
const SKIP_THRESHOLD = 4;

function measureLabel(text: string): number {
  return measureText(text, 'label');
}

/**
 * The window all text appears in, over the dimmed scene. A `Dialogue` runner
 * drives it: the window shows the runner's node, types its text, cuts it into
 * pages and offers its choices.
 *
 * The layout is settled when a node is shown, from the whole text and the
 * node's choices, so nothing moves while the text types or the pages turn.
 * The buttons only tell the runner what was pressed; `update` then brings the
 * window in line with the runner.
 */
export class StoryWindow {
  readonly dialogue: Dialogue<Night>;
  readonly modal: Modal;

  #area: SceneArea;

  /** Whether the choice buttons have replaced Continue for the shown node. */
  #areChoicesShown = false;

  /** Characters revealed since the last blip, spaces and line ends not counted. */
  #blipGlyphs = 0;

  /** Offsets in the wrapped text where a page ends. */
  #breaks: number[] = [];

  #buttonArea: Container | null = null;
  #buttons: Button[] = [];

  /** The visible choices' texts, each wrapped to the inside of its button. */
  #choiceLabels: string[] = [];

  /** Width of a button's label. */
  #labelWidth = 1;

  #lastRevealedCount = 0;
  readonly #panel: Panel;
  #shownNode: DialogueNode<Night, string> | null = null;
  #shownPageIndex = 0;
  #text = '';
  #textLeaf: Text | null = null;
  #title: Text | null = null;
  readonly #ui: UiRoot;

  /** The runner's page, wrapped to the width of the text. */
  #wrapped = '';

  constructor({ui, scheduler, script, context, area, onClosed}: StoryWindowOptions) {
    this.#ui = ui;
    this.#area = area;
    this.dialogue = new Dialogue({script, context});
    this.#panel = new Panel({
      theme: game.theme,
      layout: {flexDirection: 'column', padding: WINDOW_PADDING, gap: WINDOW_GAP},
    });
    // The top padding leaves the top row out, so the panel is centred in the
    // scene area.
    this.modal = new Modal({
      theme: game.theme,
      children: [this.#panel],
      layout: {justifyContent: 'center', alignItems: 'center', paddingTop: area.top},
      scheduler,
      fadeDuration: 200,
      onClosed,
    });

    ui.addOverlay(this.modal);
    this.#showNode();
  }

  /** Text the window shows at the moment. */
  get text(): string {
    return this.#text;
  }

  /** Destroys the window at once, without the fade and without calling `onClosed`. */
  destroy(): void {
    this.modal.destroy();
  }

  resize(area: SceneArea): void {
    if (this.modal.state === 'closed') {
      return;
    }

    this.#area = area;
    this.modal.view.layout = {paddingTop: area.top};
    this.#showNode();
  }

  update(deltaMS: number): void {
    if (this.#isClosing()) {
      return;
    }

    this.dialogue.tick(deltaMS);

    // A count that went down means the runner entered the same node again.
    if (
      this.dialogue.node !== this.#shownNode ||
      this.dialogue.pageIndex !== this.#shownPageIndex ||
      this.dialogue.revealedCount < this.#lastRevealedCount
    ) {
      this.#areChoicesShown = false;
      this.#lastRevealedCount = 0;
      this.#blipGlyphs = 0;
      this.#showNode();
    }

    this.#showRevealed();
    this.#playBlips();

    if (this.dialogue.phase === 'choosing' && !this.#areChoicesShown) {
      this.#areChoicesShown = true;
      this.#buildButtons();
    }

    if (this.dialogue.phase === 'ended') {
      this.modal.close();
    }
  }

  // Continue and a tap on the text. While the runner is choosing, advance()
  // would confirm the first choice, so a second press that arrives before the
  // choice buttons are built must not reach the runner.
  #advance(): void {
    if (this.#isClosing() || this.dialogue.phase === 'choosing') {
      return;
    }

    this.dialogue.advance();
  }

  // Replaces the buttons with Continue, or with one button per choice once the
  // runner is choosing, and focuses the first.
  #buildButtons(): void {
    let buttonArea = this.#buttonArea;

    if (buttonArea === null) {
      return;
    }

    for (let button of this.#buttons) {
      buttonArea.removeChild(button);
      button.destroy();
    }

    let labels = this.#areChoicesShown ? this.#choiceLabels : ['Continue'];

    this.#buttons = labels.map((label, index) => {
      let lineCount = label.split('\n').length;

      // The label has an explicit size: a leaf sized by its own bounds is
      // measured again later, and the button would move its label then.
      return new Button({
        theme: game.theme,
        children: [
          new Text({
            text: label,
            theme: game.theme,
            layout: {width: this.#labelWidth, height: lineCount * LINE_HEIGHT},
          }),
        ],
        layout: {
          padding: BUTTON_PADDING,
          height: lineCount * LINE_HEIGHT + 2 * BUTTON_PADDING,
          justifyContent: 'flex-start',
        },
        onClick: () => {
          if (this.#areChoicesShown) {
            this.#choose(index);
          } else {
            this.#advance();
          }
        },
      });
    });

    buttonArea.addChild(...this.#buttons);

    let [firstButton] = this.#buttons;

    if (firstButton !== undefined) {
      this.#ui.focus(firstButton);
    }
  }

  #choose(index: number): void {
    if (this.#isClosing()) {
      return;
    }

    this.dialogue.choose(index);
  }

  // A press can still arrive during the fade, and after Escape the runner has
  // not ended: such a press must not move the runner, whose nodes change the
  // night's state.
  #isClosing(): boolean {
    return this.modal.state === 'closing' || this.modal.state === 'closed';
  }

  // Plays the blip once per three revealed characters other than spaces and
  // line ends.
  #playBlips(): void {
    let {revealedCount} = this.dialogue;
    let newCount = revealedCount - this.#lastRevealedCount;

    if (newCount <= 0) {
      return;
    }

    let glyphs = 0;

    for (let character of this.#wrapped.slice(this.#lastRevealedCount, revealedCount)) {
      if (character !== ' ' && character !== '\n') {
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
  // the title, the text leaf and the button area.
  #showNode(): void {
    let {node, pageIndex, pageText, visibleChoices} = this.dialogue;

    this.#shownNode = node;
    this.#shownPageIndex = pageIndex;

    for (let child of [this.#title, this.#textLeaf, this.#buttonArea]) {
      if (child !== null) {
        this.#panel.removeChild(child);
        child.destroy();
      }
    }

    this.#title = null;
    this.#textLeaf = null;
    this.#buttonArea = null;
    this.#buttons = [];
    this.#text = '';

    // The runner ended before it showed a node; update() closes the window.
    if (node === null) {
      return;
    }

    let windowWidth = Math.min(WINDOW_WIDTH, Math.floor(this.#area.width - 2 * MARGIN));
    let textWidth = Math.max(1, windowWidth - 2 * WINDOW_PADDING);

    this.#labelWidth = Math.max(1, textWidth - 2 * BUTTON_PADDING);
    this.#choiceLabels = visibleChoices.map((choice) =>
      wrapText(choice.text, this.#labelWidth, measureLabel),
    );

    // The button area is as tall as the choices need, from the start, so the
    // choices later fill room that already exists. A node without choices
    // needs room for Continue only.
    let buttonAreaHeight = BUTTON_HEIGHT;

    if (this.#choiceLabels.length > 0) {
      buttonAreaHeight = (this.#choiceLabels.length - 1) * BUTTON_GAP;

      for (let label of this.#choiceLabels) {
        buttonAreaHeight += label.split('\n').length * LINE_HEIGHT + 2 * BUTTON_PADDING;
      }
    }

    let titleHeight = node.speaker === undefined ? 0 : LINE_HEIGHT + WINDOW_GAP;
    let textRoom =
      this.#area.height -
      2 * MARGIN -
      2 * WINDOW_PADDING -
      titleHeight -
      WINDOW_GAP -
      buttonAreaHeight;
    let linesPerPage = Math.max(1, Math.floor(textRoom / LINE_HEIGHT));

    this.#wrapped = wrapText(pageText, textWidth, measureText);
    this.#breaks = getPageBreaks(this.#wrapped, linesPerPage);
    // The runner ignores the breaks that lie before its revealed count, which
    // matters after a resize in the middle of a text.
    this.dialogue.setBreaks(this.#breaks);

    // The leaf is as tall as the longest page, not as the text typed so far.
    let textHeight = Math.min(this.#wrapped.split('\n').length, linesPerPage) * LINE_HEIGHT;

    if (node.speaker !== undefined) {
      this.#title = new Text({
        text: node.speaker,
        theme: game.theme,
        layout: {width: textWidth, height: LINE_HEIGHT},
      });
      this.#panel.addChild(this.#title);
    }

    this.#textLeaf = new Text({
      text: '',
      theme: game.theme,
      role: 'body',
      layout: {width: textWidth, height: textHeight},
    });
    this.#textLeaf.view.eventMode = 'static';
    this.#textLeaf.view.hitArea = new pixi.Rectangle(0, 0, textWidth, textHeight);
    this.#textLeaf.view.on('pointertap', () => {
      this.#advance();
    });

    this.#buttonArea = new Container({
      layout: {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: BUTTON_GAP,
        width: textWidth,
        height: buttonAreaHeight,
      },
    });
    this.#panel.addChild(this.#textLeaf, this.#buttonArea);
    this.#buildButtons();
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

    let text = this.#wrapped.slice(pageStart, revealedCount);

    if (text !== this.#text) {
      this.#text = text;
      this.#textLeaf?.setText(text);
    }
  }
}
