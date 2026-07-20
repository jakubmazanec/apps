import * as pixi from 'pixi.js';

import {attachHitArea} from '../ui/attachHitArea.js';
import {Button, type ButtonOptions} from '../ui/Button.js';
import {Panel} from '../ui/Panel.js';
import {Text} from '../ui/Text.js';
import {type UiChild, type UiParent} from '../ui/UiChild.js';
import {type UiRoot} from '../ui/UiRoot.js';
import {wrapText} from './wrapText.js';

export type DialogueBoxMetrics = {
  /** Box inset from the screen edges, art px (all metrics are art px). */
  margin: number;
  /** Inner padding of both panels. */
  padding: number;
  /** Gap between the portrait panel and the text panel, and inside the text column. */
  gap: number;
  /** Edge of the square portrait sprite. */
  portraitSize: number;
  /** Gap between choice buttons; generous keeps adjacent choices tappable. */
  choiceGap: number;
  /** Tap-target floor per choice button. */
  choiceMinHeight: number;
  /** Fixed box height; the box is a bottom bar. */
  height: number;
  /** Below this screen width the layout always collapses to the text panel alone. */
  collapseWidth: number;
};

export type DialogueBoxNode = {
  speaker?: string | undefined;
  portraitTexture?: pixi.Texture | undefined;
  /** The current page's authored text; the owner calls showNode again on page turns. */
  page: string;
};

export type DialogueBoxOptions = {
  /** Fresh instance per call: widgets own and destroy their backgrounds. */
  panelBackground: () => pixi.Container;
  choiceBackgrounds: () => ButtonOptions['backgrounds'];
  font: {fontFamily: string; fontSize: number; fill: pixi.ColorSource};
  metrics: DialogueBoxMetrics;
  markerTexture: pixi.Texture;
  /**
   * Rendered width of a string in art px; injectable for headless tests.
   * Defaults to bitmap-font measurement of `font`.
   */
  measure?: (text: string) => number;
  onAdvanceTap: () => void;
  onChooseTap: (index: number) => void;
  onChoiceHover: (index: number) => void;
};

const SELECTED_PREFIX = '▶ ';
const UNSELECTED_PREFIX = '  ';

/**
 * The dialogue display widget in the Modal idiom: a flat class owning a view,
 * composed from the existing UI widgets, no inheritance, no ECS and no
 * channels. The root positions itself as a bottom bar in screen art px; a
 * LayoutContainer subtree under a plain container computes as an independent
 * layout root because its width and height are numbers.
 *
 * Like Modal, the box opens INTO a ui root and holds a focus scope while it
 * lives: choice buttons are ordinary focusables inside the scope, and with no
 * choices on screen the scope is empty, so focus commands cannot wander to
 * HUD widgets behind the box.
 */
export class DialogueBox implements UiParent {
  readonly view: pixi.Container = new pixi.Container();

  readonly #panelBackground: () => pixi.Container;
  readonly #choiceBackgrounds: () => ButtonOptions['backgrounds'];
  readonly #font: {fontFamily: string; fontSize: number; fill: pixi.ColorSource};
  readonly #metrics: DialogueBoxMetrics;
  readonly #marker: pixi.Sprite;
  readonly #measure: (text: string) => number;
  readonly #onAdvanceTap: () => void;
  readonly #onChooseTap: (index: number) => void;
  readonly #onChoiceHover: (index: number) => void;

  #screenWidth = 0;
  #node: DialogueBoxNode | null = null;
  #box: Panel | null = null;
  #textPanel: Panel | null = null;
  #content: Text | null = null;
  #choicesPanel: Panel | null = null;
  #choiceLabels: Text[] = [];
  #choiceButtons: Button[] = [];
  #choiceTexts: string[] = [];
  #ui: UiRoot | null = null;
  #selectedIndex = 0;
  #isCollapsed = false;
  #wrapped = '';
  #breaks: number[] = [];
  #revealedCount = 0;

  constructor({
    panelBackground,
    choiceBackgrounds,
    font,
    metrics,
    markerTexture,
    measure,
    onAdvanceTap,
    onChooseTap,
    onChoiceHover,
  }: DialogueBoxOptions) {
    this.#panelBackground = panelBackground;
    this.#choiceBackgrounds = choiceBackgrounds;
    this.#font = font;
    this.#metrics = metrics;
    this.#onAdvanceTap = onAdvanceTap;
    this.#onChooseTap = onChooseTap;
    this.#onChoiceHover = onChoiceHover;

    this.#marker = new pixi.Sprite({texture: markerTexture});
    this.#marker.visible = false;

    if (measure === undefined) {
      let style = new pixi.TextStyle({fontFamily: font.fontFamily, fontSize: font.fontSize});

      this.#measure = (value) => {
        let measured = pixi.BitmapFontManager.measureText(value, style);

        return measured.width * measured.scale;
      };
    } else {
      this.#measure = measure;
    }
  }

  /** Focus discovery recurses through this (the UiParent contract). */
  get children(): UiChild[] {
    return this.#choicesPanel === null ? [] : [this.#choicesPanel];
  }

  /** Index of the focused choice button, -1 when focus is elsewhere or the box is not open. */
  get focusedChoiceIndex(): number {
    if (this.#ui === null) {
      return -1;
    }

    let {focused} = this.#ui;

    // eslint-disable-next-line unicorn/prefer-array-index-of -- indexOf narrows to Button; focused is any Focusable
    return focused === null ? -1 : this.#choiceButtons.findIndex((button) => button === focused);
  }

  /** Pause offsets for the current page (window boundaries), in page-character space. */
  get breaks(): readonly number[] {
    return this.#breaks;
  }

  /** Whether the current layout dropped the portrait panel. */
  get isCollapsed(): boolean {
    return this.#isCollapsed;
  }

  /**
   * The Modal precedent: attach into the screen's ui as the last UI child and
   * take the focus scope for the box's lifetime; destroy releases both.
   */
  open(ui: UiRoot): void {
    if (this.#ui !== null || this.view.destroyed) {
      return;
    }

    this.#ui = ui;
    ui.addChild(this);
    ui.pushFocusScope(this);
  }

  /** The expensive call: wraps the page and rebuilds the panel row. Node or page change only. */
  showNode(node: DialogueBoxNode): void {
    this.#node = node;
    this.#revealedCount = 0;
    this.#choiceTexts = [];
    this.#choiceLabels = [];
    this.#choiceButtons = [];
    this.#choicesPanel = null;
    this.#selectedIndex = 0;
    this.#rebuild();
  }

  /** Per-frame call; mutates only on an actual change. */
  setRevealed(count: number): void {
    if (this.#node === null || count === this.#revealedCount) {
      return;
    }

    this.#revealedCount = count;
    this.#applyRevealed();
  }

  /** Rebuilds the button column. Node change only; hover and press state survive per-frame sync. */
  setChoices(texts: string[], selectedIndex: number): void {
    this.#choiceTexts = [...texts];
    this.#selectedIndex = selectedIndex;
    this.#buildChoices();
  }

  /** Touches only the prefix labels; monospaced fonts make the swap jitter-free. */
  setSelected(index: number): void {
    if (index === this.#selectedIndex) {
      return;
    }

    this.#selectedIndex = index;
    this.#applySelected();
  }

  /** Per-frame call; mutates only on an actual change. */
  setAdvanceMarker(visible: boolean): void {
    if (this.#marker.visible !== visible) {
      this.#marker.visible = visible;
    }
  }

  /**
   * Screen art-px dimensions. Re-wraps the current page, recomputes the
   * remaining breaks and re-applies the revealed substring, so rotation or a
   * window resize mid-reveal cannot strand stale wrapping.
   */
  resize(width: number, height: number): void {
    this.#screenWidth = width;
    this.view.position.set(
      this.#metrics.margin,
      height - this.#metrics.height - this.#metrics.margin,
    );

    if (this.#node !== null) {
      this.#rebuild();
    }
  }

  destroy(): void {
    // The scope is popped BEFORE removeChild (the Modal precedent): removing
    // first would let UiRoot's scope self-heal drop it as stale and lose the
    // previousFocus restoration.
    let ui = this.#ui;

    this.#ui = null;

    if (ui !== null && !ui.view.destroyed) {
      ui.popFocusScope();
      ui.removeChild(this);
    }

    this.#choiceButtons = [];
    this.#box?.destroy();
    this.#box = null;
    this.view.destroy({children: true});
  }

  #rebuild(): void {
    let node = this.#node;

    if (node === null) {
      return;
    }

    let {padding, gap, portraitSize, height, collapseWidth, margin} = this.#metrics;
    let boxWidth = Math.max(1, this.#screenWidth - 2 * margin);
    let portraitPanelWidth = portraitSize + 2 * padding;

    this.#isCollapsed = node.portraitTexture === undefined || this.#screenWidth < collapseWidth;

    let textPanelWidth = this.#isCollapsed ? boxWidth : boxWidth - portraitPanelWidth - gap;
    let textWidth = Math.max(1, textPanelWidth - 2 * padding);

    this.#wrapped = wrapText(node.page, textWidth, this.#measure);

    // Window the wrapped lines into the panel's line budget; the offset just
    // after the newline ending each full window becomes a runner break (the
    // newline is an authored character because wrapping is length-preserving).
    let lines = this.#wrapped.split('\n');
    let lineHeight = this.#font.fontSize; // bitmap fonts render at native size
    let hasHeader = this.#isCollapsed && node.speaker !== undefined;
    let lineBudget = Math.max(
      1,
      Math.floor((height - 2 * padding) / lineHeight) - 1 - (hasHeader ? 1 : 0),
    );

    this.#breaks = [];

    let offset = 0;

    for (let [index, line] of lines.entries()) {
      offset += line.length + 1; // + the following newline; the last line has none but is never a break

      if ((index + 1) % lineBudget === 0 && index < lines.length - 1) {
        this.#breaks.push(offset);
      }
    }

    this.#buildPanels(node, boxWidth, textPanelWidth);
    this.#applyRevealed();

    if (this.#choiceTexts.length > 0) {
      this.#buildChoices();
    }
  }

  #buildPanels(node: DialogueBoxNode, boxWidth: number, textPanelWidth: number): void {
    let {padding, gap, height, portraitSize} = this.#metrics;
    let font = this.#font;

    this.#box?.destroy();
    this.#choicesPanel = null;
    this.#choiceLabels = [];
    this.#choiceButtons = [];

    let textChildren: UiChild[] = [];

    if (this.#isCollapsed && node.speaker !== undefined) {
      textChildren.push(
        new Text({
          text: node.speaker,
          fontFamily: font.fontFamily,
          fontSize: font.fontSize,
          fill: font.fill,
          layout: true,
        }),
      );
    }

    this.#content = new Text({
      text: '',
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fill: font.fill,
      layout: true,
    });
    textChildren.push(this.#content);

    this.#textPanel = new Panel({
      background: this.#panelBackground(),
      children: textChildren,
      layout: {flexDirection: 'column', padding, gap, width: textPanelWidth, height},
    });

    // The tap surface: a bare Panel has no eventMode and no hit area, so the
    // advance tap installs both; stopPropagation keeps dialogue taps away
    // from the view-level move-to listener.
    let textView = this.#textPanel.view;

    textView.eventMode = 'static';
    attachHitArea(textView);
    textView.on('pointertap', (event) => {
      event.stopPropagation();
      this.#onAdvanceTap();
    });

    let boxChildren: UiChild[] = [];

    if (!this.#isCollapsed) {
      let portrait = new pixi.Sprite({texture: node.portraitTexture!});

      portrait.layout = {
        isLeaf: true,
        width: portraitSize,
        height: portraitSize,
      };

      let portraitChildren: UiChild[] = [portrait];

      if (node.speaker !== undefined) {
        portraitChildren.push(
          new Text({
            text: node.speaker,
            fontFamily: font.fontFamily,
            fontSize: font.fontSize,
            fill: font.fill,
            layout: true,
          }),
        );
      }

      boxChildren.push(
        new Panel({
          background: this.#panelBackground(),
          children: portraitChildren,
          layout: {flexDirection: 'column', alignItems: 'center', padding, gap: 1, height},
        }),
      );
    }

    boxChildren.push(this.#textPanel);

    this.#box = new Panel({
      children: boxChildren,
      layout: {flexDirection: 'row', gap, width: boxWidth, height},
    });

    this.view.addChild(this.#box.view);

    // The marker sits out of flow at the box's bottom-right corner, re-added
    // on top after each rebuild.
    this.#marker.position.set(
      boxWidth - padding - this.#marker.width,
      height - padding - this.#marker.height,
    );
    this.view.addChild(this.#marker);
  }

  #buildChoices(): void {
    if (this.#textPanel === null) {
      return;
    }

    if (this.#choicesPanel !== null) {
      this.#textPanel.removeChild(this.#choicesPanel);
      this.#choicesPanel.destroy();
    }

    this.#choiceLabels = [];

    let buttons = this.#choiceTexts.map((text, index) => {
      let label = new Text({
        text: UNSELECTED_PREFIX + text,
        fontFamily: this.#font.fontFamily,
        fontSize: this.#font.fontSize,
        fill: this.#font.fill,
        layout: true,
      });

      this.#choiceLabels.push(label);

      let button = new Button({
        backgrounds: this.#choiceBackgrounds(),
        children: [label],
        onClick: () => {
          this.#onChooseTap(index);
        },
        layout: {
          padding: 1,
          minHeight: this.#metrics.choiceMinHeight,
          justifyContent: 'flex-start',
        },
      });

      // Hover feeds the selection channel, so the highlight and the confirmed
      // row can never disagree.
      button.view.on('pointerover', () => {
        this.#onChoiceHover(index);
      });

      return button;
    });

    this.#choiceButtons = buttons;
    this.#choicesPanel = new Panel({
      children: buttons,
      layout: {flexDirection: 'column', gap: this.#metrics.choiceGap},
    });
    this.#textPanel.addChild(this.#choicesPanel);
    this.#applySelected();
  }

  #applySelected(): void {
    for (let [index, label] of this.#choiceLabels.entries()) {
      let prefix = index === this.#selectedIndex ? SELECTED_PREFIX : UNSELECTED_PREFIX;

      label.setText(prefix + (this.#choiceTexts[index] ?? ''));
    }

    // Focus follows the selection (programmatic, no ring), so hover, W/S and
    // keyboard focus can never disagree about which choice activation confirms.
    let selected = this.#choiceButtons[this.#selectedIndex];

    if (selected !== undefined) {
      this.#ui?.focus(selected);
    }
  }

  #applyRevealed(): void {
    let windowStart = 0;

    for (let offset of this.#breaks) {
      // Strictly below: at the pause moment (revealedCount === offset) the
      // completed window stays on screen; the flip happens on resume.
      if (offset < this.#revealedCount) {
        windowStart = offset;
      }
    }

    this.#content?.setText(this.#wrapped.slice(windowStart, this.#revealedCount));
  }
}
