import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, beforeEach, describe, expect, test, vitest} from 'vitest';

import {Dialogue} from '../source/dialogue/Dialogue.js';
import {wrapText} from '../source/dialogue/wrapText.js';
import {type Focusable} from '../source/ui/Focusable.js';
import {type UiParent} from '../source/ui/UiChild.js';
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

vitest.mock(import('../source/ui/Text.js'), async () => {
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

const {DialogueBox} = await import('../source/dialogue/DialogueBox.js');
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
  let {UiRoot} = await import('../source/ui/UiRoot.js');
  let {Button} = await import('../source/ui/Button.js');
  // Headless pixi containers lack the federated addEventListener mixin;
  // UiRoot only uses it for pointer plumbing, irrelevant to focus logic.
  let prototype = pixi.Container.prototype as unknown as {
    addEventListener?: unknown;
    removeEventListener?: unknown;
  };

  prototype.addEventListener ??= () => {};
  prototype.removeEventListener ??= () => {};

  let ui = new UiRoot({theme: createTestTheme()});
  let outside = new Button({
    backgrounds: {
      normal: new pixi.Container(),
      hovered: new pixi.Container(),
      active: new pixi.Container(),
      disabled: new pixi.Container(),
    },
  });

  ui.addChild(outside);

  return {ui, outside};
}

describe('DialogueBox focus integration', () => {
  beforeEach(() => {
    mockTexts.length = 0;
  });

  test('an added box takes a focus scope: no choices means nothing is focusable', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});

    // The regression: focus commands must not escape to HUD widgets while the
    // box is attached with plain text.
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
    ui.addOverlay(box);
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
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);

    box.setSelected(1);

    expect(box.focusedChoiceIndex).toBe(1);
  });

  test('the cancel command passes over the box, which stays open and keeps its scope', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    ui.cancel();

    // No close declared: the world screen reads this as nothing dismissible
    // being open and opens the pause menu over the box instead.
    expect(ui.topOverlay).toBe(box);
    expect(ui.topOverlay?.close).toBeUndefined();
    expect(box.view.destroyed).toBe(false);
  });

  test('adding an attached box throws', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    ui.addOverlay(box);

    expect(() => {
      ui.addOverlay(box);
    }).toThrow('Overlay was already added to the UI root!');

    expect(ui.children.filter((child) => child === box)).toHaveLength(1);
    expect(ui.topOverlay).toBe(box);
  });

  test('a box is attached to one root at a time', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {ui: other} = await createUiWithOutsideButton();
    let {box} = createBox();

    ui.addOverlay(box);

    expect(() => {
      other.addOverlay(box);
    }).toThrow('Dialogue box is already attached to a UI root!');
  });

  test('detach() throws for a box that is not attached', () => {
    let {box} = createBox();

    expect(() => {
      box.detach();
    }).toThrow('Dialogue box is not attached to a UI root!');
  });

  test('ui.removeOverlay(box) keeps the box alive, and it can be added again', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let chosen = vitest.fn<(index: number) => void>();
    let {box} = createBox({onChooseTap: chosen});

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);
    ui.removeOverlay(box);

    expect(box.view.destroyed).toBe(false);
    expect(ui.children).not.toContain(box);
    expect(ui.topOverlay).toBeNull();
    // Detached, the box no longer asks the root which choice is focused.
    expect(box.focusedChoiceIndex).toBe(-1);

    ui.focusNext();

    expect(ui.focused).toBe(outside);

    // The same instance across dialogues: the scope and the focus sync are back.
    ui.addOverlay(box);
    box.showNode({page: 'Again'});
    box.setChoices(['Yes', 'No'], 1);

    expect(ui.topOverlay).toBe(box);
    expect(box.focusedChoiceIndex).toBe(1);

    ui.activate();

    expect(chosen).toHaveBeenCalledWith(1);
  });

  test('destroy() after ui.removeOverlay(box) leaves the root alone', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    ui.removeOverlay(box);

    expect(() => {
      box.destroy();
    }).not.toThrow();

    expect(box.view.destroyed).toBe(true);
    expect(ui.children).toEqual([outside]);
  });

  test('destroy() survives a root that was destroyed first', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    // Not through ui.destroy(), which would cascade into box.destroy(): the
    // root's view is gone while the box still points at the root.
    ui.view.destroy();

    expect(() => {
      box.destroy();
    }).not.toThrow();

    expect(box.view.destroyed).toBe(true);
    expect(box.focusedChoiceIndex).toBe(-1);
  });

  test('destroy() leaves the root before the views go, so the choices are deactivated', async () => {
    let {ui} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);

    // Button has nothing to end on deactivate; the spy stands in for an engine
    // user's focusable that does.
    let deactivate = vitest.fn<() => void>();
    let [choicesPanel] = box.children as [UiParent];

    for (let choice of choicesPanel.children as Focusable[]) {
      choice.deactivate = deactivate;
    }

    box.destroy();

    expect(deactivate).toHaveBeenCalledTimes(2);
    expect(box.view.destroyed).toBe(true);
  });

  test('destroy releases the scope back to the screen', async () => {
    let {ui, outside} = await createUiWithOutsideButton();
    let {box} = createBox();

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: 'Q'});
    box.setChoices(['Yes', 'No'], 0);
    box.destroy();

    ui.focusNext();

    expect(ui.focused).toBe(outside);
  });

  test('a choice confirmed in the box runs its onChoose through the runner', async () => {
    let {ui} = await createUiWithOutsideButton();
    let onChoose = vitest.fn<() => void>();
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'Yes', onChoose}, {text: 'No'}]}},
      context: {},
    });
    let {box} = createBox({
      onChooseTap: (index) => {
        dialogue.choose(index);
      },
    });

    box.resize(10, 100);
    ui.addOverlay(box);
    box.showNode({page: dialogue.pageText});
    dialogue.advance();
    box.setChoices(
      dialogue.visibleChoices.map((choice) => choice.text),
      dialogue.selectedIndex,
    );
    ui.activate();

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(dialogue.phase).toBe('ended');
  });
});
