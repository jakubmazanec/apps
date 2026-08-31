import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {createTestTheme} from './createTestTheme.js';

let layoutSystem: LayoutSystem;

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeAll shared by all describe blocks
beforeAll(async () => {
  layoutSystem = new LayoutSystem();

  await layoutSystem.init({
    layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
  });
});

const FONT_SIZE = 12;
// monogram at fontSize 12 advances ~6 art px per glyph, so the ~121 px text
// column a phone gets holds ~20 characters.
const GLYPH_WIDTH = 6;
const mockTexts = vitest.hoisted(
  () =>
    [] as Array<{
      text: string;
      view: {
        destroyed: boolean;
        layout: {computedLayout: {height: number; width: number}} | null;
      };
    }>,
);

// A geometric stand-in for Text: a leaf whose bounds are exactly
// (longest line x glyph width, lines x fontSize), so yoga measures it the way
// the real bitmap font would without needing the 'monogram' atlas. Like the
// real Text it is an objectFit:'none' leaf, so shrinking its yoga box does NOT
// shrink the glyphs -- which is the whole point of these tests.
vitest.mock(import('../source/engine/ui/Text.js'), async () => {
  let {Container, Graphics} = await import('pixi.js');

  class Text {
    text: string;
    view = new Container();
    readonly #rect = new Graphics();

    constructor({text, layout}: {text: string; layout?: unknown}) {
      this.text = text;
      this.view.addChild(this.#rect);
      this.#draw(text);

      if (layout !== undefined) {
        let leafLayout = {
          isLeaf: true,
          objectFit: 'none',
          objectPosition: 'left top',
          ...(typeof layout === 'object' && layout !== null ? layout : {}),
        };

        this.view.layout = leafLayout as never;
      }

      mockTexts.push(this);
    }

    destroy() {
      this.view.destroy();
    }

    setAnchor() {
      return this;
    }

    setText(value: string) {
      this.text = value;
      this.#draw(value);

      return this;
    }

    #draw(text: string) {
      let lines = text.split('\n');
      let width = Math.max(1, ...lines.map((line) => line.length));

      // The factory runs on first import of the mocked module, which is after
      // this file's consts initialize, so it can close over them.
      this.#rect
        .clear()
        .rect(0, 0, width * GLYPH_WIDTH, lines.length * FONT_SIZE)
        .fill(0xffffff);
    }
  }

  return {Text: Text as never};
});

const {DialogueBox} = await import('../source/engine/dialogue/DialogueBox.js');
// The shipping metrics, verbatim from source/game/systems/dialogueBoxSystem.ts.
const BOX_METRICS = {
  margin: 4,
  padding: 3,
  gap: 3,
  portraitSize: 32,
  choiceGap: 2,
  choiceMinHeight: 10,
  height: 64,
  collapseWidth: 200,
};
// A Pixel-class phone: 412x915 CSS px at DPR 2.625 gives pixelScale 8, so the
// art-px screen is ~135x300 -- below collapseWidth, hence the collapsed layout.
const PHONE_WIDTH = 135;
const PHONE_HEIGHT = 300;
// dialogueRegistry's `greeting` node, which is what the reported bug was seen on.
const GREETING = {speaker: 'Mira', page: 'Welcome to Somewhere.'};
const GREETING_CHOICES = ['Sure, show me around.', 'Maybe later.'];
let measure = (text: string) => text.length * GLYPH_WIDTH;

function createBox() {
  return new DialogueBox({
    theme: createTestTheme(),
    font: {fontFamily: 'monogram', fontSize: FONT_SIZE, fill: 0xffffff},
    metrics: BOX_METRICS,
    markerTexture: pixi.Texture.WHITE,
    measure,
    onAdvanceTap: () => {},
    onChooseTap: () => {},
    onChoiceHover: () => {},
  });
}

function layOut(box: {view: pixi.Container}) {
  // prerender re-measures the leaf intrinsic sizes, which is what the renderer
  // does each frame; update() alone would run yoga against stale sizes.
  layoutSystem.prerender({container: box.view});
  layoutSystem.update(box.view);
}

function getComputedLayout(container: pixi.Container | undefined) {
  let layout = container?.layout;

  if (!layout) {
    throw new Error('Expected a container with a computed layout!');
  }

  return layout.computedLayout;
}

/** The box Panel's own yoga box: the bar's real size after layout. */
function getBoxHeight(box: {view: pixi.Container}): number {
  return getComputedLayout(box.view.children[0]).height;
}

/**
 * Every live text leaf with the size it was given against the size its glyphs
 * actually need. A leaf renders objectFit:'none', so a yoga box smaller than
 * the glyphs does not scale them down -- it lets them spill over whatever sits
 * beside or below.
 */
function getLiveTexts() {
  return mockTexts.flatMap((mock) => {
    let {destroyed, layout} = mock.view;

    // setChoices rebuilds the panels, so earlier passes leave destroyed Texts
    // behind; only the live tree is laid out.
    if (destroyed || layout === null) {
      return [];
    }

    let lines = mock.text.split('\n');

    return [
      {
        text: mock.text,
        naturalHeight: lines.length * FONT_SIZE,
        naturalWidth: Math.max(1, ...lines.map((line) => line.length)) * GLYPH_WIDTH,
        height: layout.computedLayout.height,
        width: layout.computedLayout.width,
      },
    ];
  });
}

describe('DialogueBox vertical budget', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('a node with choices lays every text out at its natural height', () => {
    let box = createBox();

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);
    box.showNode(GREETING);
    box.setRevealed(1000); // the whole page is revealed before choices appear
    box.setChoices(GREETING_CHOICES, 0);
    layOut(box);

    // On the reported bug the page's box came back 11 px tall holding 24 px of
    // glyphs, which put its second line over the first choice button.
    let squashed = getLiveTexts().filter((entry) => entry.height < entry.naturalHeight);

    expect(squashed).toEqual([]);
  });

  test('a choice label wider than the column wraps instead of spilling sideways', () => {
    let box = createBox();

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);
    box.showNode(GREETING);
    box.setRevealed(1000);
    // '▶ Sure, show me around.' is 23 glyphs -- 138 art px in a column that is
    // only ~119 px wide inside the button padding.
    box.setChoices(GREETING_CHOICES, 0);
    layOut(box);

    let overflowing = getLiveTexts().filter((entry) => entry.width < entry.naturalWidth);

    expect(overflowing).toEqual([]);
  });

  test('a node with choices keeps the choice column inside the box', () => {
    let box = createBox();

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);
    box.showNode(GREETING);
    box.setRevealed(1000);
    box.setChoices(GREETING_CHOICES, 0);
    layOut(box);

    // The box's UiParent children are exactly [choicesPanel], whose own widget
    // children are the choice Buttons in order.
    let choicesPanel = box.children[0] as unknown as {
      children: Array<{view: pixi.Container}>;
      view: pixi.Container;
    };
    let panelLayout = getComputedLayout(choicesPanel.view);
    let lastChoice = getComputedLayout(choicesPanel.children.at(-1)?.view);
    // yoga reports `top` against the parent's border box, so the panel's own
    // top already carries the text panel's padding; the text panel is flush
    // with the box, so this sum is an offset from the top of the bar.
    let lastChoiceBottom = panelLayout.top + lastChoice.top + lastChoice.height;

    expect(choicesPanel.children).toHaveLength(GREETING_CHOICES.length);
    expect(lastChoiceBottom).toBeLessThanOrEqual(getBoxHeight(box) - BOX_METRICS.padding);
  });

  test('the whole box stays on screen above the bottom margin', () => {
    let box = createBox();

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);
    box.showNode(GREETING);
    box.setRevealed(1000);
    box.setChoices(GREETING_CHOICES, 0);
    layOut(box);

    expect(box.view.y).toBeGreaterThanOrEqual(0);
    expect(box.view.y + getBoxHeight(box)).toBeLessThanOrEqual(PHONE_HEIGHT - BOX_METRICS.margin);
  });

  test('adding choices leaves the page breaks the runner was given untouched', () => {
    let box = createBox();
    // Long enough to window: the line budget does not depend on the choice
    // count, so growing the bar for choices must not re-window the page. The
    // owner pushes breaks to the runner on showNode and never again.
    let page = 'Welcome to Somewhere. Mind the well on your way past the old chapel gate.';

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);
    box.showNode({speaker: 'Mira', page});

    let breaksBeforeChoices = [...box.breaks];

    box.setChoices(GREETING_CHOICES, 0);

    expect(breaksBeforeChoices.length).toBeGreaterThan(0);
    expect([...box.breaks]).toEqual(breaksBeforeChoices);
  });

  test('a node without choices still renders the fixed-height bar', () => {
    let box = createBox();

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);
    box.showNode(GREETING);
    box.setRevealed(1000);
    layOut(box);

    // No choices means no extra content, so the bar keeps its authored height
    // and its authored position -- this fix must not move the common case.
    expect(getBoxHeight(box)).toBe(BOX_METRICS.height);
    expect(box.view.y).toBe(PHONE_HEIGHT - BOX_METRICS.height - BOX_METRICS.margin);
  });
});
