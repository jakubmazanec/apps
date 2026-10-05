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
import {LINE_HEIGHT, MARGIN, type SceneArea} from '../core/getSceneArea.js';
import {input} from '../core/input.js';
import {measureText} from '../core/measureText.js';
import {type Night} from '../core/night.js';

export type StoryWindowOptions = {
  /** Scheduler of the screen that opens the window; it drives the fade. */
  scheduler: Scheduler;

  script: RunnableDialogueScript<Night>;
  context: Night;
  area: SceneArea;

  /** Called once the window has closed. */
  onClosed: () => void;
};

export type StoryWindowState = 'closed' | 'closing' | 'open' | 'opening';

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
const FADE_DURATION = 200;
const MARKER_BLINK_MS = 500;

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
 * it with `ui.addOverlay`, and the window draws its own scrim and runs its own
 * fade, as a `Modal` would.
 *
 * The layout is settled when a node is shown, from the whole text and the
 * node's choices, so nothing moves while the text types or the pages turn.
 * A press on the text and the choice buttons only tell the runner what was
 * pressed; `update` then brings the window in line with the runner.
 */
export class StoryWindow implements Overlay {
  readonly children: UiChild[];
  readonly dialogue: Dialogue<Night>;
  readonly view: pixi.Container = new pixi.Container();

  #area: SceneArea;

  /** Whether the choice buttons are built for the shown node. */
  #areChoicesShown = false;

  /** Time in ms the marker has blinked since the runner became idle. */
  #blinkTime = 0;

  /** Characters revealed since the last blip, spaces and line ends not counted. */
  #blipGlyphs = 0;

  /** Offsets in the wrapped text where a page ends. */
  #breaks: number[] = [];

  /** Room for the choices; a node without choices has none. */
  #buttonArea: Container | null = null;

  #buttons: Button[] = [];

  /** Cancels the running fade. */
  #cancelFade: (() => void) | null = null;

  /** The visible choices' texts, each wrapped to the inside of its button. */
  #choiceLabels: string[] = [];

  /** Whether an `update` has got past its guard: the window open or opening, and topmost. */
  #hasUpdated = false;

  /** Width of a button's label. */
  #labelWidth = 1;

  #lastRevealedCount = 0;

  /** Shows that a press turns the page or closes the window. */
  readonly #marker: pixi.Sprite;

  readonly #onClosed: () => void;
  readonly #panel: Panel;

  /** Takes the presses on the window above the choices. */
  readonly #pressSurface: pixi.Container = new pixi.Container();

  readonly #scheduler: Scheduler;
  #shownNode: DialogueNode<Night, string> | null = null;
  #shownPageIndex = 0;
  #state: StoryWindowState = 'closed';
  #text = '';
  #textLeaf: Text | null = null;
  #title: Text | null = null;
  #ui: UiRoot | null = null;

  /** Whether the runner was idle at the last `update`. */
  #wasIdle = false;

  /** The runner's page, wrapped to the width of the text. */
  #wrapped = '';

  constructor({scheduler, script, context, area, onClosed}: StoryWindowOptions) {
    this.#scheduler = scheduler;
    this.#area = area;
    this.#onClosed = onClosed;
    this.dialogue = new Dialogue({script, context});
    this.#panel = new Panel({
      theme: game.theme,
      layout: {flexDirection: 'column', padding: WINDOW_PADDING, gap: WINDOW_GAP},
    });
    this.children = [this.#panel];

    this.#marker = new pixi.Sprite({texture: assets.spriteset('ui').texture('advance-marker')});
    this.#marker.visible = false;

    // A sibling of the choice buttons, not their parent, so a tap on a choice
    // does not reach it as well.
    this.#pressSurface.eventMode = 'static';
    this.#pressSurface.on('pointertap', () => {
      this.#continueText();
    });

    // The scrim takes every pointer event, so nothing behind the window can be
    // pressed while it is open.
    let scrim = new pixi.Graphics();

    scrim.rect(0, 0, 1, 1).fill(game.theme.modal.scrimColor);
    scrim.alpha = game.theme.modal.scrimAlpha;
    scrim.eventMode = 'static';
    scrim.hitArea = {contains: () => true};
    scrim.layout = {position: 'absolute', left: 0, top: 0, width: '100%', height: '100%'};

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
    this.view.addChild(scrim, this.#panel.view);
    this.#showNode();
  }

  get state(): StoryWindowState {
    return this.#state;
  }

  /** Text the window shows at the moment. */
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
  }

  /** Destroys the window at once, without the fade and without calling `onClosed`. */
  destroy(): void {
    if (this.view.destroyed) {
      return;
    }

    // Leaves the root first, while the buttons are alive: removeOverlay gives
    // the focus back to what had it before the window and calls detach(),
    // which cancels a running fade.
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
      this.#areChoicesShown = false;
      this.#lastRevealedCount = 0;
      this.#blipGlyphs = 0;
      this.#showNode();
    }

    this.#showRevealed();
    this.#playBlips();

    if (this.dialogue.phase === 'choosing' && !this.#areChoicesShown) {
      this.#areChoicesShown = true;
      this.#buildChoices();
    }

    this.#updateMarker(deltaMS);

    if (this.dialogue.phase === 'ended') {
      this.#close();
    }
  }

  // One button per visible choice, in the room the node reserved for them.
  // None is focused: the first arrow or Tab press focuses the first.
  #buildChoices(): void {
    let buttonArea = this.#buttonArea;

    if (buttonArea === null) {
      return;
    }

    this.#buttons = this.#choiceLabels.map((label, index) => {
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
          this.dialogue.choose(index);
        },
      });
    });

    buttonArea.addChild(...this.#buttons);
  }

  // The runner has ended: the window fades out, then destroy() takes it off
  // the root and the owner hears of it.
  #close(): void {
    this.#state = 'closing';
    this.#fade(0, () => {
      this.destroy();
      this.#onClosed();
    });
  }

  // A press on the text, and Enter or Space with nothing focused. While the
  // runner is choosing, advance() would take the first choice, which only a
  // press on a choice may do. While the window fades out, the runner has ended.
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
      duration: FADE_DURATION,
      easing: easeOutQuad,
      onComplete: () => {
        this.#cancelFade = null;
        onComplete();
      },
    });
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
  // the title, the text leaf and, for a node with choices, the button area.
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

    // A node with choices reserves the room they need from the start, so the
    // choices later fill room that already exists. A node without choices
    // reserves none.
    let buttonAreaHeight = 0;

    if (this.#choiceLabels.length > 0) {
      buttonAreaHeight = (this.#choiceLabels.length - 1) * BUTTON_GAP;

      for (let label of this.#choiceLabels) {
        buttonAreaHeight += label.split('\n').length * LINE_HEIGHT + 2 * BUTTON_PADDING;
      }
    }

    let choicesHeight = buttonAreaHeight === 0 ? 0 : WINDOW_GAP + buttonAreaHeight;
    let titleHeight = node.speaker === undefined ? 0 : LINE_HEIGHT + WINDOW_GAP;
    let textRoom =
      this.#area.height - 2 * MARGIN - 2 * WINDOW_PADDING - titleHeight - choicesHeight;
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
    this.#panel.addChild(this.#textLeaf);

    if (buttonAreaHeight > 0) {
      this.#buttonArea = new Container({
        layout: {
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: BUTTON_GAP,
          width: textWidth,
          height: buttonAreaHeight,
        },
      });
      this.#panel.addChild(this.#buttonArea);

      // After a resize the choices are built again at once.
      if (this.#areChoicesShown) {
        this.#buildChoices();
      }
    }

    // The press surface and the marker sit out of the layout flow, in the
    // panel's own coordinates, and are added again on top after each rebuild.
    // The surface spans the panel's width. For a node without choices it
    // reaches the panel's bottom edge, so a tap on the marker or on the
    // padding around it continues the text; for a node with choices it ends at
    // the bottom edge of the text, and a press in the room of the choices does
    // nothing. The marker sits in the bottom right corner, inside the padding.
    let panelWidth = textWidth + 2 * WINDOW_PADDING;
    let textBottom = WINDOW_PADDING + titleHeight + textHeight;
    let panelHeight = textBottom + choicesHeight + WINDOW_PADDING;
    let surfaceHeight = choicesHeight === 0 ? panelHeight : textBottom;

    this.#pressSurface.hitArea = new pixi.Rectangle(0, 0, panelWidth, surfaceHeight);
    this.#marker.position.set(
      panelWidth - WINDOW_PADDING - this.#marker.width,
      panelHeight - WINDOW_PADDING - this.#marker.height,
    );
    this.#panel.view.addChild(this.#pressSurface, this.#marker);
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

  // The marker blinks while the runner is idle, that is while a press would
  // turn the page or close the window. The blink starts in the on state
  // whenever the runner becomes idle.
  #updateMarker(deltaMS: number): void {
    let isIdle = this.dialogue.phase === 'idle';

    this.#blinkTime = isIdle && this.#wasIdle ? this.#blinkTime + deltaMS : 0;
    this.#wasIdle = isIdle;
    this.#marker.visible = isIdle && Math.floor(this.#blinkTime / MARKER_BLINK_MS) % 2 === 0;
  }
}
