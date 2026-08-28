import * as pixi from 'pixi.js';

import {attachHitArea} from '../ui/attachHitArea.js';
import {Button} from '../ui/Button.js';
import {Panel} from '../ui/Panel.js';
import {Text} from '../ui/Text.js';
import {type UiChild, type UiParent} from '../ui/UiChild.js';
import {type UiRoot} from '../ui/UiRoot.js';
import {type UiTheme} from '../ui/UiTheme.js';
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

  /**
   * The node's visible choice texts, known at node entry. The bar reserves
   * their column from the first frame of every page, so setChoices with the
   * same texts fills it in place and nothing on screen moves or grows.
   */
  choices?: string[] | undefined;
};

export type DialogueBoxOptions = {
  theme: UiTheme;
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
// Inner padding of a choice button; #getChoicesHeight budgets against it.
const CHOICE_PADDING = 1;

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
 *
 * The layout is settled at showNode from the FINAL content, never from what
 * is on screen: the page is wrapped and windowed up front, the content leaf
 * is given the whole window's size, and the node's choice column is reserved
 * before the first character shows. The typewriter and the choices then only
 * fill boxes that already exist, so nothing moves or grows mid-node.
 */
export class DialogueBox implements UiParent {
  /** TBD */
  readonly view: pixi.Container = new pixi.Container();

  /** Whether setChoices has built the button column for the current node. */
  #areChoicesShown = false;

  /** TBD */
  #box: Panel | null = null;

  /** The bar's height for the node: the authored height, grown to fit the header, the text window and the reserved choice column. */
  #boxHeight = 0;

  /** TBD */
  #breaks: number[] = [];

  /** TBD */
  #choiceButtons: Button[] = [];

  /** TBD */
  #choiceLabels: Text[] = [];

  /** Wrap width for a choice label: the text column inside the button's padding. */
  #choiceLabelWidth = 1;

  /** TBD */
  #choicesPanel: Panel | null = null;

  /** TBD */
  #choiceTexts: string[] = [];

  /** TBD */
  #content: Text | null = null;

  /** TBD */
  readonly #font: {fontFamily: string; fontSize: number; fill: pixi.ColorSource};

  /** TBD */
  #isCollapsed = false;

  /** TBD */
  readonly #marker: pixi.Sprite;

  /** TBD */
  readonly #measure: (text: string) => number;

  /** TBD */
  readonly #metrics: DialogueBoxMetrics;

  /** TBD */
  #node: DialogueBoxNode | null = null;

  /** TBD */
  readonly #onAdvanceTap: () => void;

  /** TBD */
  readonly #onChoiceHover: (index: number) => void;

  /** TBD */
  readonly #onChooseTap: (index: number) => void;

  /** TBD */
  #revealedCount = 0;

  /** TBD */
  #screenHeight = 0;

  /** TBD */
  #screenWidth = 0;

  /** TBD */
  #selectedIndex = 0;

  /** TBD */
  #textPanel: Panel | null = null;

  /** TBD */
  readonly #theme: UiTheme;

  /** TBD */
  #ui: UiRoot | null = null;

  /** TBD */
  #wrapped = '';

  constructor({
    theme,
    font,
    metrics,
    markerTexture,
    measure,
    onAdvanceTap,
    onChooseTap,
    onChoiceHover,
  }: DialogueBoxOptions) {
    this.#theme = theme;
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

  /** Pause offsets for the current page (window boundaries), in page-character space. */
  get breaks(): readonly number[] {
    return this.#breaks;
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

  /** Whether the current layout dropped the portrait panel. */
  get isCollapsed(): boolean {
    return this.#isCollapsed;
  }

  /** TBD */
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

  /**
   * Screen art-px dimensions. Re-wraps the current page, recomputes the
   * remaining breaks and re-applies the revealed substring, so rotation or a
   * window resize mid-reveal cannot strand stale wrapping.
   */
  resize(width: number, height: number): void {
    this.#screenWidth = width;
    this.#screenHeight = height;

    if (this.#node === null) {
      // Nothing to measure yet, so the bar sits at its authored height; the
      // rebuild repositions it once a node arrives.
      this.#boxHeight = this.#metrics.height;
      this.view.position.set(
        this.#metrics.margin,
        height - this.#metrics.height - this.#metrics.margin,
      );

      return;
    }

    this.#rebuild();
  }

  /** Per-frame call; mutates only on an actual change. */
  setAdvanceMarker(visible: boolean): void {
    if (this.#marker.visible !== visible) {
      this.#marker.visible = visible;
    }
  }

  /** Builds the button column. Node change only; hover and press state survive per-frame sync. */
  setChoices(texts: string[], selectedIndex: number): void {
    this.#selectedIndex = selectedIndex;
    this.#areChoicesShown = true;

    if (
      texts.length === this.#choiceTexts.length &&
      texts.every((text, index) => text === this.#choiceTexts[index])
    ) {
      // The column was reserved at showNode: fill it in place, so the bar
      // keeps the size and position it has had since the first character.
      this.#buildChoices();

      return;
    }

    // Choices the node did not announce: the only way to fit them is to grow
    // the bar after the fact. The line budget does not depend on the choice
    // count, so the breaks the owner already pushed to the runner come back
    // identical.
    this.#choiceTexts = [...texts];
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

  /** Touches only the prefix labels; monospaced fonts make the swap jitter-free. */
  setSelected(index: number): void {
    if (index === this.#selectedIndex) {
      return;
    }

    this.#selectedIndex = index;
    this.#applySelected();
  }

  /** The expensive call: wraps the page and rebuilds the panel row. Node or page change only. */
  showNode(node: DialogueBoxNode): void {
    this.#node = node;
    this.#revealedCount = 0;
    // Reserved, not shown: the column's height is budgeted from these texts
    // now; the buttons themselves arrive with setChoices.
    this.#choiceTexts = [...(node.choices ?? [])];
    this.#areChoicesShown = false;
    this.#choiceLabels = [];
    this.#choiceButtons = [];
    this.#choicesPanel = null;
    this.#selectedIndex = 0;
    this.#rebuild();
  }

  /** TBD */
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

  /** TBD */
  #applySelected(): void {
    for (let [index, label] of this.#choiceLabels.entries()) {
      let prefix = index === this.#selectedIndex ? SELECTED_PREFIX : UNSELECTED_PREFIX;

      label.setText(this.#wrapChoice(index, prefix));
    }

    // Focus follows the selection (programmatic, no ring), so hover, W/S and
    // keyboard focus can never disagree about which choice activation confirms.
    let selected = this.#choiceButtons[this.#selectedIndex];

    if (selected !== undefined) {
      this.#ui?.focus(selected);
    }
  }

  /** TBD */
  #buildChoices(): void {
    if (this.#textPanel === null) {
      return;
    }

    if (this.#choicesPanel !== null) {
      this.#textPanel.removeChild(this.#choicesPanel);
      this.#choicesPanel.destroy();
    }

    this.#choiceLabels = [];

    let buttons = [...this.#choiceTexts.keys()].map((index) => {
      let label = new Text({
        // #applySelected overwrites this a few lines down; wrapping here keeps
        // the label from ever existing at its unwrapped width.
        text: this.#wrapChoice(index, UNSELECTED_PREFIX),
        fontFamily: this.#font.fontFamily,
        fontSize: this.#font.fontSize,
        fill: this.#font.fill,
        layout: true,
      });

      this.#choiceLabels.push(label);

      let button = new Button({
        theme: this.#theme,
        children: [label],
        onClick: () => {
          this.#onChooseTap(index);
        },
        layout: {
          padding: CHOICE_PADDING,
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

  /** Builds the panel row for the geometry #rebuild settled: the bar, its text panel and the text window inside it, all in art px. */
  #buildPanels(
    node: DialogueBoxNode,
    geometry: {
      boxWidth: number;
      textPanelWidth: number;
      contentWidth: number;
      contentHeight: number;
    },
  ): void {
    let {boxWidth, textPanelWidth, contentWidth, contentHeight} = geometry;
    let {padding, gap, portraitSize} = this.#metrics;
    let font = this.#font;
    let height = this.#boxHeight;

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

    // The leaf is the size of the whole text window, not of the revealed
    // substring: a leaf sized by its own bounds is re-measured by the layout
    // system on a throttle, and everything stacked under it (the choice
    // column) would settle only once that measurement caught up with the last
    // line typed. Sized up front, the column's geometry is fixed from the
    // first frame and the typewriter only fills it.
    this.#content = new Text({
      text: '',
      fontFamily: font.fontFamily,
      fontSize: font.fontSize,
      fill: font.fill,
      layout: {width: contentWidth, height: contentHeight},
    });
    textChildren.push(this.#content);

    this.#textPanel = new Panel({
      theme: this.#theme,
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
          theme: this.#theme,
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

  /** The natural height of the choice column, 0 when the node offers no choices. */
  #getChoicesHeight(): number {
    let count = this.#choiceTexts.length;

    if (count === 0) {
      return 0;
    }

    let {choiceMinHeight, choiceGap} = this.#metrics;
    let total = (count - 1) * choiceGap;

    for (let index of this.#choiceTexts.keys()) {
      // The selected and unselected prefixes are the same width in a
      // monospaced font, but budgeting the taller of the two means a font that
      // breaks that assumption costs a spare line rather than an overlap.
      let lines = Math.max(
        this.#wrapChoice(index, SELECTED_PREFIX).split('\n').length,
        this.#wrapChoice(index, UNSELECTED_PREFIX).split('\n').length,
      );

      // The button box model #buildChoices asks for: the label's lines plus the
      // button's own padding, floored by the tap-target minimum.
      total += Math.max(choiceMinHeight, lines * this.#font.fontSize + 2 * CHOICE_PADDING);
    }

    return total;
  }

  /** TBD */
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
    // A choice label wraps inside the button, which sits in the same column as
    // the page text and adds its own padding.
    this.#choiceLabelWidth = Math.max(1, textWidth - 2 * CHOICE_PADDING);

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

    // The authored height budgets the header and the windowed text; a node's
    // choices stack UNDER them, so the bar grows upward to fit rather than
    // overflowing. The growth happens here, at showNode, from the choices the
    // node announced: the bar is already its final size while the page types,
    // and the buttons later fill a column that was empty, not one that has to
    // be made. Overflow here is not clipping: yoga shrinks the children to
    // fit the fixed height, and a Text leaf renders at native glyph size
    // (objectFit 'none'), so a shrunk text box spills its lines over the first
    // choice button while the last button lands off the bottom of the screen.
    let choicesHeight = this.#getChoicesHeight();
    let contentHeight = lineBudget * lineHeight;

    this.#boxHeight = Math.max(
      height,
      2 * padding +
        (hasHeader ? lineHeight + gap : 0) +
        contentHeight +
        (choicesHeight === 0 ? 0 : gap + choicesHeight),
    );

    this.view.position.set(margin, this.#screenHeight - this.#boxHeight - margin);

    this.#buildPanels(node, {boxWidth, textPanelWidth, contentWidth: textWidth, contentHeight});
    this.#applyRevealed();

    // A resize mid-choosing rebuilds the buttons too; before setChoices the
    // reserved column stays empty.
    if (this.#areChoicesShown) {
      this.#buildChoices();
    }
  }

  /**
   * A choice label wrapped to the button's inner width. Long choices wrap onto
   * another line instead of running past the edge of the bar: like the page
   * text, a label is an objectFit:'none' leaf, so yoga narrowing its box would
   * not narrow the glyphs.
   */
  #wrapChoice(index: number, prefix: string): string {
    return wrapText(
      prefix + (this.#choiceTexts[index] ?? ''),
      this.#choiceLabelWidth,
      this.#measure,
    );
  }
}
