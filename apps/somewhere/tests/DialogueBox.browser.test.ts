import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {wrapText} from '../source/engine/dialogue/wrapText.js';
import {createTestTheme} from './createTestTheme.js';

let layoutSystem: LayoutSystem;

// eslint-disable-next-line vitest/require-top-level-describe -- global beforeAll shared by all describe blocks
beforeAll(async () => {
  layoutSystem = new LayoutSystem();

  await layoutSystem.init({
    layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
  });
});

const mockTexts = vitest.hoisted(() => [] as Array<{text: string}>);

vitest.mock(import('../source/engine/ui/Text.js'), async () => {
  let {Container} = await import('pixi.js');

  class Text {
    text: string;
    view = new Container();

    constructor({text}: {text: string}) {
      this.text = text;
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

      return this;
    }
  }

  // `as never`: the real Text is nominally typed (it has #private fields), so no
  // structural stand-in can satisfy the mocked module's declared shape.
  return {Text: Text as never};
});

const {DialogueBox} = await import('../source/engine/dialogue/DialogueBox.js');
// 1 art px per character makes every width a character count.
let measure = (text: string) => text.length;
// margin/padding/gap zero so the numbers stay literal: with height 36 and
// fontSize 12 the budget is floor(36/12) - 1 = 2 lines per window (1 with a
// header row).
const METRICS = {
  margin: 0,
  padding: 0,
  gap: 0,
  portraitSize: 4,
  choiceGap: 0,
  choiceMinHeight: 0,
  height: 36,
  collapseWidth: 100,
};

function createBox(
  overrides: {
    onAdvanceTap?: () => void;
    onChooseTap?: (index: number) => void;
    onChoiceHover?: (index: number) => void;
  } = {},
) {
  let box = new DialogueBox({
    theme: createTestTheme(),
    font: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
    metrics: METRICS,
    markerTexture: pixi.Texture.WHITE,
    measure,
    onAdvanceTap: overrides.onAdvanceTap ?? (() => {}),
    onChooseTap: overrides.onChooseTap ?? (() => {}),
    onChoiceHover: overrides.onChoiceHover ?? (() => {}),
  });

  return {box};
}

function findTapSurfaces(root: pixi.Container): pixi.Container[] {
  let surfaces: pixi.Container[] = [];
  let walk = (container: pixi.Container) => {
    if (container.listenerCount('pointertap') > 0) {
      surfaces.push(container);
    }

    for (let child of container.children) {
      walk(child);
    }
  };

  walk(root);

  return surfaces;
}

const PAGE = 'aaa bbb ccc ddd eee'; // wraps at width 10 into 'aaa bbb' / 'ccc ddd' / 'eee'

describe('DialogueBox windowing', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('showNode wraps the page and exposes window breaks', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: PAGE});

    // Two lines per window; the break sits just after 'aaa bbb\nccc ddd\n'.
    expect(box.breaks).toEqual([16]);
    expect(box.isCollapsed).toBe(true); // no portrait
  });

  test('setRevealed windows the wrapped substring', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: PAGE});

    box.setRevealed(5);

    expect(mockTexts.some((text) => text.text === 'aaa b')).toBe(true);

    box.setRevealed(16); // the pause moment: the full first window stays

    expect(mockTexts.some((text) => text.text === 'aaa bbb\nccc ddd\n')).toBe(true);

    box.setRevealed(17); // past the break: the second window begins

    expect(mockTexts.some((text) => text.text === 'e')).toBe(true);
  });

  test('a collapsed speaker header costs one line of budget', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({speaker: 'Mira', page: PAGE});

    // Budget 1: a break after every full window line except the last.
    expect(box.breaks).toEqual([8, 16]);
    expect(mockTexts.some((text) => text.text === 'Mira')).toBe(true);
  });

  test('resize re-wraps and preserves the revealed count', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: PAGE});
    box.setRevealed(5);

    box.resize(4, 100); // 'aaa' / 'bbb' / 'ccc' / 'ddd' / 'eee'

    let rewrapped = wrapText(PAGE, 4, measure);

    expect(box.breaks).toEqual([8, 16]);
    expect(mockTexts.some((text) => text.text === rewrapped.slice(0, 5))).toBe(true);
  });

  test('the portrait collapses below collapseWidth and expands above it', () => {
    let {box} = createBox();

    box.resize(300, 100);
    box.showNode({page: PAGE, portraitTexture: pixi.Texture.WHITE});

    expect(box.isCollapsed).toBe(false);

    box.resize(50, 100);

    expect(box.isCollapsed).toBe(true);
  });
});

describe('DialogueBox choices and marker', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('setChoices builds prefixed labels and setSelected flips them without rebuilding', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);

    let textCountAfterChoices = mockTexts.length;

    expect(mockTexts.some((text) => text.text === '▶ Yes')).toBe(true);
    expect(mockTexts.some((text) => text.text === '  No')).toBe(true);

    box.setSelected(1);

    // No new Text instances: setSelected mutates the existing labels rather
    // than rebuilding the choice buttons.
    expect(mockTexts).toHaveLength(textCountAfterChoices);
    expect(mockTexts.some((text) => text.text === '  Yes')).toBe(true);
    expect(mockTexts.some((text) => text.text === '▶ No')).toBe(true);
  });

  test('taps reach the advance and choose callbacks', () => {
    let advanced = vitest.fn<() => void>();
    let chosen = vitest.fn<(index: number) => void>();
    let {box} = createBox({onAdvanceTap: advanced, onChooseTap: chosen});

    box.resize(10, 100);
    box.showNode({page: 'Q'});
    box.setChoices(['A', 'B'], 0);

    let surfaces = findTapSurfaces(box.view);

    // The text panel plus one surface per choice button.
    expect(surfaces).toHaveLength(3);

    for (let surface of surfaces) {
      surface.emit('pointertap', {stopPropagation: () => {}} as never);
    }

    expect(advanced).toHaveBeenCalledTimes(1);
    expect(chosen).toHaveBeenCalledWith(0);
    expect(chosen).toHaveBeenCalledWith(1);
  });

  test('the advance marker toggles visibility', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: 'Q'});

    let marker = box.view.children.find(
      (child) => child instanceof pixi.Sprite && child.texture === pixi.Texture.WHITE,
    ) as pixi.Sprite;

    expect(marker.visible).toBe(false);

    box.setAdvanceMarker(true);

    expect(marker.visible).toBe(true);

    box.setAdvanceMarker(false);

    expect(marker.visible).toBe(false);
  });

  test('destroy tears the whole tree down', () => {
    let {box} = createBox();

    box.resize(10, 100);
    box.showNode({page: 'Q'});
    box.destroy();

    expect(box.view.destroyed).toBe(true);
  });
});

async function createUiWithOutsideButton() {
  let {UiRoot} = await import('../source/engine/ui/UiRoot.js');
  let {Button} = await import('../source/engine/ui/Button.js');
  // Headless pixi containers lack the federated addEventListener mixin;
  // UiRoot only uses it for pointer plumbing, irrelevant to focus logic.
  let prototype = pixi.Container.prototype as unknown as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };

  prototype.addEventListener ??= () => {};
  prototype.removeEventListener ??= () => {};

  let ui = new UiRoot({theme: createTestTheme()});
  let outside = new Button({backgrounds: {normal: new pixi.Container()}});

  ui.addChild(outside);

  return {ui, outside};
}

describe('DialogueBox focus integration', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('open takes a focus scope: no choices means nothing is focusable', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    box.open(ui);
    box.showNode({page: 'Q'});

    // The regression: focus commands must not escape to HUD widgets while the
    // box is open with plain text.
    ui.focusNext();
    ui.moveFocus('down');

    expect(ui.focused).toBeNull();
    expect(ui.focused).not.toBe(outside);
  });

  test('choices are focusable in the scope and activation confirms the focused one', async () => {
    let {ui} = await createUiWithOutsideButton();
    let chosen = vitest.fn<(index: number) => void>();
    let {box} = createBox({onChooseTap: chosen});

    box.resize(10, 100);
    box.open(ui);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);

    // Building choices focuses the selected one, so activate works at once.
    expect(box.focusedChoiceIndex).toBe(0);

    ui.focusNext();

    expect(box.focusedChoiceIndex).toBe(1);

    ui.activate();

    expect(chosen).toHaveBeenCalledWith(1);
  });

  test('setSelected pulls focus along, so hover and keyboard stay in lockstep', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    box.open(ui);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);

    box.setSelected(1);

    expect(box.focusedChoiceIndex).toBe(1);
  });

  test('destroy releases the scope back to the screen', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    box.open(ui);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);
    box.destroy();

    ui.focusNext();

    expect(ui.focused).toBe(outside);
  });
});
