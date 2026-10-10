import * as pixi from 'pixi.js';
import {AudioMixer, defineDialogueScript, type Modal, Panel} from 'tellurion';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vitest,
} from 'vitest';
import {page} from 'vitest/browser';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {getSceneArea} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {stripMarks} from '../source/game/core/markedText.js';
import {type Night} from '../source/game/core/night.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {FIXED_BAR, getFixedPlace} from './fixedWorld.js';
import {
  bootGame,
  type Box,
  describeFocus,
  doBoxesOverlap,
  getBox,
  getButtonLabel,
  getMenuButton,
  getPicture,
  getPlaceButton,
  getSpotButton,
  getStoryWindow,
  getWindowButton,
  getWindowParts,
  type Harness,
  nextFrame,
  press,
  readPages,
  readText,
  startNewGame,
  tap,
  tapNow,
  useFixedWorld,
  waitForChoices,
  waitForNoStoryWindow,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check placement, speed and windows,
// not the picture's pixels (tests/placePicture.browser.test.ts does), so the
// main menu, which shows the bar, gets the pipeline's proof, a shader of a few
// lines, as the fixed world's places do. The bar's GLSL has its text as its
// type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// The tests run in the fixed world's bar, which has the sample bar's text.
const sampleBar = getFixedPlace(FIXED_BAR);
const STARTING_STATUS = '19:40   350 Kč   0.0';
const BEER_LABEL = 'Order a beer  10 min  45 Kč';
// Ten lines of 46 letters at most: one page under a title and two choices.
const LAMP_PAGE =
  'The lamp over the counter hums to itself. Its light is the colour of weak tea, and it ' +
  'falls on the glasses, the taps and the hands of the bartender, and on nothing else. ' +
  'Moths come and go. One of them has been circling the bulb since you sat down, and it ' +
  'does not seem to get any closer or any further away. Somewhere behind the lamp a wire ' +
  'ticks as it warms. Nobody else looks up at it. Perhaps they all know something about ' +
  'it that you do not.';
// The thing of the bar's picture that each scene button lies on, in the design
// of 480 × 270, which stretches to the screen.
const THINGS = new Map<string, Box>([
  ['A patron', {left: 20, top: 244, width: 98, height: 26}],
  // The first lamp's light above the counter.
  ['The bartender', {left: 60, top: 110, width: 88, height: 77}],
  ['The door', {left: 418, top: 70, width: 40, height: 106}],
  ['Two women talking', {left: 300, top: 222, width: 72, height: 48}],
]);

function getThing(label: string, width: number, height: number): Box {
  let thing = THINGS.get(label);

  if (thing === undefined) {
    throw new Error(`No thing for "${label}"!`);
  }

  return {
    left: (thing.left * width) / 480,
    top: (thing.top * height) / 270,
    width: (thing.width * width) / 480,
    height: (thing.height * height) / 270,
  };
}

function findOverlap(boxes: Box[]): [Box, Box] | null {
  for (let [index, first] of boxes.entries()) {
    for (let second of boxes.slice(index + 1)) {
      if (doBoxesOverlap(first, second)) {
        return [first, second];
      }
    }
  }

  return null;
}

// 960 × 540 CSS pixels are 480 × 270 art pixels: headless Chromium has a
// device pixel ratio of 1, and the engine picks a pixel scale of 2, its
// smallest, so a frame draws as few pixels as the art allows. The frames of a
// headless browser are slow, and several times slower on a busy machine, so
// the tests get a long timeout.
describe('night screen', {timeout: 180_000}, () => {
  let harness: Harness;
  let restore: () => void;
  // The spies call through to the real mixer; they only record the calls.
  let play: MockInstance<AudioMixer['play']>;
  let playMusic: MockInstance<AudioMixer['playMusic']>;

  async function openSpot(label: string): Promise<StoryWindow> {
    harness.nightScreen.ui.focus(getSpotButton(harness, label));
    await press('Enter');

    return getStoryWindow(harness);
  }

  // Opens "A patron" and takes "Talk to him" and then "Ask about the ceiling",
  // finishing each text, to the long text of a node without choices. Its first
  // page takes more than ten seconds to type.
  async function openLongText(): Promise<StoryWindow> {
    let storyWindow = await openSpot('A patron');

    for (let count = 0; count < 2; count += 1) {
      await press('Enter');
      harness.nightScreen.ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
    }

    return storyWindow;
  }

  // Opens a window of the test's own, as one the screen opened: the screen
  // ticks the window it holds. Its node has two pages and two choices, and
  // each page takes more than ten seconds to type.
  function openPagesWithChoices(): StoryWindow {
    let {contents, scheduler, ui} = harness.nightScreen;
    let storyWindow = new harness.StoryWindow({
      scheduler,
      script: defineDialogueScript<Night>()({
        start: {
          speaker: 'A lamp',
          text: [LAMP_PAGE, LAMP_PAGE],
          choices: [{text: 'Look closer'}, {text: 'Look away'}],
        },
      }),
      context: contents.night,
      area: getSceneArea(480, 270),
      onClosed: () => {
        contents.storyWindow = null;
      },
    });

    contents.storyWindow = storyWindow;
    ui.addOverlay(storyWindow);

    return storyWindow;
  }

  // The room a node with choices reserves for them under its text, where they
  // appear: as wide as the text, from its bottom edge to the panel's bottom
  // padding of 8.
  function getRoomUnderText(storyWindow: StoryWindow): Box {
    let {panel, textBlock} = getWindowParts(storyWindow);
    let panelBox = getBox(harness, panel);
    let textBox = getBox(harness, textBlock);
    let top = textBox.top + textBox.height;

    return {
      left: textBox.left,
      top,
      width: textBox.width,
      height: panelBox.top + panelBox.height - 8 - top,
    };
  }

  // Names what Pixi's hit test finds at the middle of a box, out of the named
  // parts, so a failed check prints a name and not a whole Pixi container.
  function getTapTarget(box: Box, parts: Record<string, pixi.Container>): string {
    let {game} = harness;
    let target = game.app.renderer.events.rootBoundary.hitTest(
      (box.left + box.width / 2) * game.pixelScale,
      (box.top + box.height / 2) * game.pixelScale,
    );

    return Object.entries(parts).find(([, part]) => part === target)?.[0] ?? 'another part';
  }

  function getMenu(): Modal {
    let {menuModal} = harness.nightScreen.contents;

    if (menuModal === null) {
      throw new Error('The menu is not open!');
    }

    return menuModal;
  }

  // The menu closes after a 100 ms fade, so closing is awaited.
  async function waitForNoMenu(): Promise<void> {
    await vitest.waitFor(
      () => {
        if (harness.nightScreen.contents.menuModal !== null) {
          throw new Error('The menu is still open.');
        }
      },
      {timeout: 10_000},
    );
  }

  // The cursor's box in art pixels. It lies out of the layout flow, so its
  // position comes from its transform.
  function getCursorBox(cursor: pixi.Sprite): Box {
    let origin = cursor.toGlobal({x: 0, y: 0});

    return {
      left: origin.x / harness.game.pixelScale,
      top: origin.y / harness.game.pixelScale,
      width: cursor.width,
      height: cursor.height,
    };
  }

  // Expects the cursor to sit after the last letter of the shown text, which
  // has no line end at its end: 6 per letter and 12 per line, and 2 from the
  // letter cell's top left corner.
  function expectCursorAfter(storyWindow: StoryWindow, shown: string): void {
    let {cursor, textBlock} = getWindowParts(storyWindow);
    let textBox = getBox(harness, textBlock);
    let cursorBox = getCursorBox(cursor);
    let lines = stripMarks(shown).split('\n');

    expect(cursorBox.left).toBe(textBox.left + (lines.at(-1) ?? '').length * 6 + 2);
    expect(cursorBox.top).toBe(textBox.top + (lines.length - 1) * 12 + 2);
  }

  // The boxes of the scene buttons on a screen of the given size in art
  // pixels, as the night screen places them.
  function getSpotBoxes(width: number, height: number): Array<{label: string; box: Box}> {
    let area = getSceneArea(width, height);

    return sampleBar.spots.map((spot) => {
      let size = {width: harness.measureText(spot.label, 'label') + 12, height: 16};

      return {
        label: spot.label,
        box: {...getSpotPosition({x: spot.x, y: spot.y, ...size, area}), ...size},
      };
    });
  }

  // Back to 960 × 540 after a test that changed the viewport.
  async function restoreViewport(): Promise<void> {
    await page.viewport(960, 540);
    await vitest.waitFor(
      () => {
        if (harness.game.app.screen.width !== 960) {
          throw new Error('The screen is not back at its size yet.');
        }
      },
      {timeout: 10_000},
    );
  }

  // Leaves the scene with no window open, whatever the test before did.
  function clearScene(): void {
    let {contents} = harness.nightScreen;

    contents.optionsModal?.destroy();
    contents.menuModal?.destroy();
    contents.storyWindow?.destroy();

    contents.optionsModal = null;
    contents.menuModal = null;
    contents.storyWindow = null;
  }

  beforeAll(async () => {
    // Installed before the route's dynamic imports evaluate audio.ts.
    play = vitest.spyOn(AudioMixer.prototype, 'play');
    playMusic = vitest.spyOn(AudioMixer.prototype, 'playMusic');

    harness = await bootGame(960, 540);
    restore = useFixedWorld();
  }, 60_000);

  afterAll(() => {
    play.mockRestore();
    playMusic.mockRestore();
    restore();
    harness.unmount();
    localStorage.clear();
  });

  // These tests follow the arrival in order: each starts where the one before
  // it ended.
  describe('arrival', () => {
    test('New Game shows the night screen, and the menu music plays on', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;

      expect(mainMenuScreen.contents.newGameButton.isDisabled).toBe(false);

      await startNewGame(harness);

      expect(game.currentScreen).toBe(nightScreen);
      expect(game.app.screen.width / game.pixelScale).toBe(480);
      expect(game.app.screen.height / game.pixelScale).toBe(270);
      // Once, by the main menu: the night screen starts no music of its own.
      expect(playMusic).toHaveBeenCalledTimes(1);
    });

    test('the description opens by itself, as an overlay without close', () => {
      let {ui} = harness.nightScreen;
      let storyWindow = getStoryWindow(harness);
      let {title} = getWindowParts(storyWindow);

      expect(ui.topOverlay).toBe(storyWindow);
      expect(ui.topOverlay?.close).toBeUndefined();
      expect(storyWindow.dialogue.node?.speaker).toBe(sampleBar.name);
      expect(title === null ? null : readText(title)).toBe(sampleBar.name);
    });

    test('the text types out with the blip, and Enter finishes the page', async () => {
      let {assets} = harness;
      let storyWindow = getStoryWindow(harness);
      let whole = storyWindow.dialogue.pageText;

      await vitest.waitFor(
        () => {
          expect(play).toHaveBeenCalledWith(assets.sound('blip'), {bus: 'sfx'});
        },
        {timeout: 10_000},
      );

      let {buttons, cursor} = getWindowParts(storyWindow);

      expect(storyWindow.text.length).toBeGreaterThan(0);
      expect(storyWindow.text.length).toBeLessThan(stripMarks(whole).length);
      expect(buttons).toEqual([]);
      expect(cursor.visible).toBe(false);

      await press('Enter');

      // wrapText only turns spaces into line ends.
      expect(storyWindow.text.replaceAll('\n', ' ')).toBe(stripMarks(whole));
    });

    // The description is one page, so the shown text has no line end at its end.
    test('the cursor shows after the last letter of the complete page, inside the window', async () => {
      let storyWindow = getStoryWindow(harness);
      let {cursor, panel} = getWindowParts(storyWindow);
      let shown = storyWindow.text;

      expect(storyWindow.dialogue.phase).toBe('idle');
      expect(shown.endsWith('\n')).toBe(false);

      // It blinks: on for 500 ms of game time, then off for as long.
      await vitest.waitFor(
        () => {
          expect(cursor.visible).toBe(true);
        },
        {timeout: 10_000},
      );

      let panelBox = getBox(harness, panel);
      let cursorBox = getCursorBox(cursor);

      expectCursorAfter(storyWindow, shown);

      expect(cursorBox.left).toBeGreaterThanOrEqual(panelBox.left);
      expect(cursorBox.top).toBeGreaterThanOrEqual(panelBox.top);
      expect(cursorBox.left + cursorBox.width).toBeLessThanOrEqual(panelBox.left + panelBox.width);
      expect(cursorBox.top + cursorBox.height).toBeLessThanOrEqual(panelBox.top + panelBox.height);
    });

    test('Enter on the last page closes the window', async () => {
      let {nightScreen} = harness;

      await press('Enter');
      await waitForNoStoryWindow(harness);

      expect(nightScreen.ui.topOverlay).toBeNull();
      expect(readText(nightScreen.contents.statusText)).toBe(STARTING_STATUS);
    });
  });

  describe('scene', () => {
    beforeEach(() => {
      clearScene();
    });

    test('the picture fills the screen under the top row and the buttons', () => {
      let {nightScreen} = harness;
      let {view} = getPicture(harness);

      expect(view.width).toBe(480);
      expect(view.height).toBe(270);
      expect(nightScreen.view.children.indexOf(view)).toBeGreaterThanOrEqual(0);
      expect(nightScreen.view.children.indexOf(view)).toBeLessThan(
        nightScreen.view.children.indexOf(nightScreen.ui.view),
      );
    });

    test('every scene button lies inside the screen and under the top row', async () => {
      let {nightScreen} = harness;

      await nextFrame();

      expect(nightScreen.contents.spotButtons).toHaveLength(sampleBar.spots.length);

      for (let button of nightScreen.contents.spotButtons) {
        let box = getBox(harness, button);

        expect(box.left).toBeGreaterThanOrEqual(4);
        expect(box.left + box.width).toBeLessThanOrEqual(480 - 4);
        // The scene area starts 24 from the top.
        expect(box.top).toBeGreaterThanOrEqual(24);
        expect(box.top + box.height).toBeLessThanOrEqual(270 - 4);
      }
    });

    test('no two scene buttons overlap', async () => {
      await nextFrame();

      let boxes = harness.nightScreen.contents.spotButtons.map((button) => getBox(harness, button));

      expect(findOverlap(boxes)).toBeNull();
    });

    test('the centre of every scene button lies on its thing', async () => {
      await nextFrame();

      for (let button of harness.nightScreen.contents.spotButtons) {
        let box = getBox(harness, button);
        let thing = getThing(getButtonLabel(button), 480, 270);
        let x = box.left + box.width / 2;
        let y = box.top + box.height / 2;

        expect(x).toBeGreaterThanOrEqual(thing.left);
        expect(x).toBeLessThanOrEqual(thing.left + thing.width);
        expect(y).toBeGreaterThanOrEqual(thing.top);
        expect(y).toBeLessThanOrEqual(thing.top + thing.height);
      }
    });

    test('no two scene buttons overlap on a 195 × 350 screen', () => {
      expect(findOverlap(getSpotBoxes(195, 350).map(({box}) => box))).toBeNull();
    });

    test('no two scene buttons overlap on a 146 × 262 screen', () => {
      expect(findOverlap(getSpotBoxes(146, 262).map(({box}) => box))).toBeNull();
    });

    test("every button's box overlaps its thing at 195 × 350 and 146 × 262", () => {
      for (let [width, height] of [
        [195, 350],
        [146, 262],
      ] as const) {
        for (let {label, box} of getSpotBoxes(width, height)) {
          expect(doBoxesOverlap(box, getThing(label, width, height))).toBe(true);
        }
      }
    });

    test('an arrow key moves the focus to the nearest button and plays the click', async () => {
      let {assets, nightScreen} = harness;

      nightScreen.ui.focus(getSpotButton(harness, 'The bartender'));
      play.mockClear();
      await press('ArrowRight');

      // The door is a little farther to the right than the women's table,
      // but much nearer in height.
      expect(describeFocus(nightScreen.ui.focused)).toBe('The door');
      expect(play).toHaveBeenCalledWith(assets.sound('ui-click'), {bus: 'ui'});
    });

    test('the press that opens a window does not finish its first page', async () => {
      let storyWindow = await openSpot('The bartender');

      expect(storyWindow.dialogue.node?.speaker).toBe('The bartender');
      expect(storyWindow.dialogue.phase).toBe('revealing');
      expect(storyWindow.dialogue.revealedCount).toBeLessThan(storyWindow.dialogue.pageText.length);
    });

    test('Enter finishes the text, and the choices appear with nothing focused', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      expect(getWindowParts(storyWindow).buttons).toEqual([]);

      await press('Enter');

      let {buttons, cursor} = getWindowParts(storyWindow);

      expect(storyWindow.dialogue.phase).toBe('choosing');
      expect(buttons.map(getButtonLabel)).toEqual([BEER_LABEL, 'Leave her alone']);
      expect(describeFocus(nightScreen.ui.focused)).toBe('nothing');
      expect(cursor.visible).toBe(false);

      await nextFrame();
      await nextFrame();

      expect(cursor.visible).toBe(false);
    });

    test('Enter with no choice focused does nothing', async () => {
      let {nightScreen} = harness;
      let before = {...nightScreen.contents.night};
      let storyWindow = await openSpot('The bartender');

      await press('Enter');

      expect(storyWindow.dialogue.phase).toBe('choosing');

      await press('Enter');
      await press('Space');

      expect(storyWindow.dialogue.phase).toBe('choosing');
      expect(nightScreen.contents.storyWindow).toBe(storyWindow);
      expect(nightScreen.contents.night).toEqual(before);
    });

    test(
      'the choices appear when the text has typed to its end, with no press',
      {timeout: 240_000},
      async () => {
        let {nightScreen} = harness;
        let storyWindow = await openSpot('The bartender');

        expect(storyWindow.dialogue.phase).toBe('revealing');

        // Game time advances by at most 100 ms per frame, so the text takes
        // seconds to type.
        await vitest.waitFor(
          () => {
            expect(storyWindow.dialogue.phase).toBe('choosing');
          },
          {timeout: 120_000},
        );

        let {buttons} = getWindowParts(storyWindow);

        expect(storyWindow.text.replaceAll('\n', ' ')).toBe(
          stripMarks(storyWindow.dialogue.pageText),
        );
        expect(buttons.map(getButtonLabel)).toEqual([BEER_LABEL, 'Leave her alone']);
        expect(describeFocus(nightScreen.ui.focused)).toBe('nothing');
      },
    );

    // The test of a second tap under the text checks the size in the fade.
    test('the window keeps its size when the choices appear and once they have faded in', async () => {
      let storyWindow = await openSpot('The bartender');
      let {panel} = getWindowParts(storyWindow);

      await nextFrame();

      let before = getBox(harness, panel);

      expect(getWindowParts(storyWindow).buttons).toEqual([]);

      await press('Enter');

      expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
        BEER_LABEL,
        'Leave her alone',
      ]);
      expect(getBox(harness, panel)).toEqual(before);

      await waitForChoices(storyWindow);

      expect(getBox(harness, panel)).toEqual(before);
    });

    test('a choice without a next node closes the window', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      await press('Enter');
      nightScreen.ui.focus(getWindowButton(storyWindow, 1));
      await press('Enter');
      await waitForNoStoryWindow(harness);

      expect(readText(nightScreen.contents.statusText)).toBe(STARTING_STATUS);
    });

    test('a choice leads to its node', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('A patron');
      let firstNode = storyWindow.dialogue.node;

      // Finish the text and take the first choice, "Talk to him".
      await press('Enter');
      nightScreen.ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');

      expect(storyWindow.dialogue.node).not.toBe(firstNode);
      expect(storyWindow.dialogue.visibleChoices.map((choice) => choice.text)).toEqual([
        'Ask about the ceiling',
        'Let him be',
      ]);
      expect(getWindowParts(storyWindow).buttons).toEqual([]);
    });

    test('a choice taken with Enter does not also finish the next text', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('A patron');

      // Finish the text and take "Talk to him", then finish its text.
      await press('Enter');
      nightScreen.ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
      await press('Enter');

      expect(storyWindow.dialogue.phase).toBe('choosing');

      // An arrow key focuses "Ask about the ceiling", and Enter takes it.
      await press('ArrowDown');

      expect(describeFocus(nightScreen.ui.focused)).toBe('Ask about the ceiling');

      await press('Enter');

      // The first page of the long text takes more than ten seconds to type.
      expect(storyWindow.dialogue.node?.choices).toBeUndefined();
      expect(storyWindow.dialogue.phase).toBe('revealing');
      expect(storyWindow.text.length).toBeLessThan(200);
    });

    test('a tap on a choice does not also finish the next text', async () => {
      let storyWindow = await openSpot('A patron');

      // Finish the text and tap "Talk to him", then finish its text, if a tap
      // left it typing, and tap "Ask about the ceiling". A choice takes a tap
      // once it has faded in.
      await press('Enter');
      await waitForChoices(storyWindow);
      await tap(harness, getBox(harness, getWindowButton(storyWindow, 0)));

      if (storyWindow.dialogue.phase === 'revealing') {
        await press('Enter');
      }

      expect(getButtonLabel(getWindowButton(storyWindow, 0))).toBe('Ask about the ceiling');

      await waitForChoices(storyWindow);
      await tap(harness, getBox(harness, getWindowButton(storyWindow, 0)));

      // The first page of the long text takes more than ten seconds to type.
      expect(storyWindow.dialogue.node?.choices).toBeUndefined();
      expect(storyWindow.dialogue.phase).toBe('revealing');
    });

    test('a tap on the text finishes the page, and the next tap turns it', async () => {
      let storyWindow = await openLongText();

      await tap(harness, getBox(harness, getWindowParts(storyWindow).textBlock));

      // The first page takes more than ten seconds to type, so the tap
      // finished it, and the runner waits at the page end.
      let pageEnd = storyWindow.dialogue.revealedCount;

      expect(storyWindow.dialogue.phase).toBe('idle');
      expect(pageEnd).toBeLessThan(storyWindow.dialogue.pageText.length);
      expect(storyWindow.text.trimEnd().split('\n')).toHaveLength(16);

      await tap(harness, getBox(harness, getWindowParts(storyWindow).textBlock));

      expect(storyWindow.dialogue.phase).toBe('revealing');
      expect(storyWindow.dialogue.revealedCount).toBeGreaterThan(pageEnd);
    });

    test('the cursor sits after the last letter of a page that has a next page', async () => {
      let storyWindow = await openLongText();

      // Finish the first page.
      await press('Enter');

      let shown = storyWindow.text;

      expect(storyWindow.dialogue.phase).toBe('idle');
      expect(storyWindow.dialogue.revealedCount).toBeLessThan(storyWindow.dialogue.pageText.length);
      // A page followed by another ends with the line end the page break took.
      expect(shown.endsWith('\n')).toBe(true);

      let withoutEnd = shown.slice(0, -1);

      // On the page's 16th line, not on a new line after it.
      expect(withoutEnd.split('\n')).toHaveLength(16);

      expectCursorAfter(storyWindow, withoutEnd);
    });

    test(
      'the cursor is hidden while the text types and blinks when the page is complete',
      {timeout: 120_000},
      async () => {
        // A node without choices: the runner waits at the end of its text.
        let storyWindow = await openSpot('Two women talking');
        let {cursor} = getWindowParts(storyWindow);

        // Two frames are at most 200 ms (Tellurion caps a frame at 100 ms): 8 of 177 letters typed.
        expect(storyWindow.dialogue.phase).toBe('revealing');
        expect(cursor.visible).toBe(false);

        await press('Enter');

        expect(storyWindow.dialogue.phase).toBe('idle');

        // On for 500 ms of game time, then off for as long, then on again.
        for (let isVisible of [true, false, true]) {
          await vitest.waitFor(
            () => {
              expect(cursor.visible).toBe(isVisible);
            },
            {timeout: 10_000},
          );
        }
      },
    );

    test('the italic word is drawn by the italic leaf', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('A patron');

      // Finish the text, take "Talk to him" and finish its text.
      await press('Enter');
      nightScreen.ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
      await press('Enter');

      let {italicLeaf, regularLeaf, textBlock} = getWindowParts(storyWindow);
      let shown = storyWindow.text;
      let regular = readText(regularLeaf);
      let italic = readText(italicLeaf);
      let index = shown.indexOf('better');

      expect(storyWindow.dialogue.revealedCount).toBe(storyWindow.dialogue.pageText.length);
      expect(italic.trim()).toBe('better');
      expect(regular).not.toContain('better');
      expect(regular).toHaveLength(shown.length);
      expect(italic).toHaveLength(shown.length);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(regular.slice(index, index + 6)).toBe('      ');
      expect(italic.slice(index, index + 6)).toBe('better');

      // Both fonts advance every character, the space too, by 6, so the word
      // starts where its column of the line starts.
      let lineStart = shown.lastIndexOf('\n', index) + 1;
      let italicStyle = new pixi.TextStyle({fontFamily: 'monogram-italic', fontSize: 12});
      let italicMeasure = pixi.BitmapFontManager.measureText(
        italic.slice(lineStart, index + 1),
        italicStyle,
      );

      expect(italicMeasure.width * italicMeasure.scale).toBe(
        harness.measureText(shown.slice(lineStart, index + 1)),
      );

      let blockBox = getBox(harness, textBlock);

      expect(getBox(harness, regularLeaf)).toEqual(blockBox);
      expect(getBox(harness, italicLeaf)).toEqual(blockBox);
    });

    test('the long text has its italic word on the right page, and later pages are not italic', async () => {
      let storyWindow = await openLongText();
      let italics: string[] = [];
      // The leaves are made again for each page, so each page reads its own.
      let pages = await readPages(storyWindow, () => {
        italics.push(readText(getWindowParts(storyWindow).italicLeaf));
      });
      let italicIndex = pages.findIndex((shown) =>
        shown.replaceAll('\n', ' ').includes('Nobody upstairs'),
      );

      expect(italicIndex).toBeGreaterThan(0);
      expect(italics).toHaveLength(pages.length);

      expect(italics[italicIndex]?.trim()).toBe('Nobody');

      // Spaces and line ends only: nothing before or after the word is italic.
      for (let italic of italics.toSpliced(italicIndex, 1)) {
        expect(italic).toMatch(/^[ \n]*$/u);
      }
    });

    test('a tap on the cursor turns the page', async () => {
      let storyWindow = await openLongText();

      // Finish the first page.
      await press('Enter');

      let pageEnd = storyWindow.dialogue.revealedCount;

      expect(storyWindow.dialogue.phase).toBe('idle');

      await tap(harness, getCursorBox(getWindowParts(storyWindow).cursor));

      expect(storyWindow.dialogue.phase).toBe('revealing');
      expect(storyWindow.dialogue.revealedCount).toBeGreaterThan(pageEnd);
    });

    test('a tap on the padding under the text turns the page', async () => {
      let storyWindow = await openLongText();

      // Finish the first page.
      await press('Enter');

      let pageEnd = storyWindow.dialogue.revealedCount;
      let {panel, textBlock} = getWindowParts(storyWindow);
      let panelBox = getBox(harness, panel);
      let textBox = getBox(harness, textBlock);
      let textBottom = textBox.top + textBox.height;

      // Under the text's first column, between the bottom edges of the text
      // and the panel.
      await tap(harness, {
        left: textBox.left,
        top: textBottom,
        width: 12,
        height: panelBox.top + panelBox.height - textBottom,
      });

      expect(storyWindow.dialogue.phase).toBe('revealing');
      expect(storyWindow.dialogue.revealedCount).toBeGreaterThan(pageEnd);
    });

    test('a tap under the text finishes the page, as a tap on the text does', async () => {
      let storyWindow = openPagesWithChoices();

      try {
        await nextFrame();
        await nextFrame();

        // The first page takes more than ten seconds to type, so the tap in
        // the room of the choices finished it, and the runner waits at the
        // page end.
        await tap(harness, getRoomUnderText(storyWindow));

        expect(storyWindow.dialogue.pageIndex).toBe(0);
        expect(storyWindow.dialogue.phase).toBe('idle');
        expect(storyWindow.dialogue.revealedCount).toBe(storyWindow.dialogue.pageText.length);
      } finally {
        // Read after the awaits, so the current contents are cleared.
        let {contents} = harness.nightScreen;

        storyWindow.destroy();
        contents.storyWindow = null;
      }
    });

    test('a tap under the text turns a complete page that another page follows', async () => {
      let storyWindow = openPagesWithChoices();

      try {
        await nextFrame();
        await nextFrame();
        // Finish the first page.
        await press('Enter');

        expect(storyWindow.dialogue.pageIndex).toBe(0);
        expect(storyWindow.dialogue.phase).toBe('idle');

        await tap(harness, getRoomUnderText(storyWindow));

        // The second page takes more than ten seconds to type, so it is still
        // typing after the tap.
        expect(storyWindow.dialogue.pageIndex).toBe(1);
        expect(storyWindow.dialogue.phase).toBe('revealing');
      } finally {
        // Read after the awaits, so the current contents are cleared.
        let {contents} = harness.nightScreen;

        storyWindow.destroy();
        contents.storyWindow = null;
      }
    });

    test('a second tap under the text takes no choice while the choices fade in', async () => {
      let {game} = harness;
      let storyWindow = await openSpot('A patron');
      let firstNode = storyWindow.dialogue.node;

      await nextFrame();

      let {panel, pressSurface, textBlock} = getWindowParts(storyWindow);
      let panelBox = getBox(harness, panel);
      let textBox = getBox(harness, textBlock);
      // Where the first choice appears: 8 under the text, one line of 12 and 2
      // of padding on both sides.
      let firstChoice = {
        left: textBox.left,
        top: textBox.top + textBox.height + 8,
        width: textBox.width,
        height: 16,
      };

      // No await until the second tap: no frame runs in between, so the fade
      // does not advance. The first tap finishes the text, and the runner
      // offers the choices at once; update() builds them, as the window's next
      // frame would, and render() lays them out.
      tapNow(harness, firstChoice);

      expect(storyWindow.dialogue.phase).toBe('choosing');

      storyWindow.update(0);
      game.app.render();

      let button = getWindowButton(storyWindow, 0);
      let parts = {pressSurface, firstChoice: button.view};

      expect(getButtonLabel(button)).toBe('Talk to him');
      expect(getBox(harness, button)).toEqual(firstChoice);
      expect(getBox(harness, panel)).toEqual(panelBox);
      // The second tap reaches the press surface, not the choice under the
      // finger, and does nothing, as a tap on the text does then.
      expect(getTapTarget(firstChoice, parts)).toBe('pressSurface');

      tapNow(harness, firstChoice);

      expect(storyWindow.dialogue.phase).toBe('choosing');
      expect(storyWindow.dialogue.node).toBe(firstNode);

      // Fully shown, the choice takes the tap.
      await waitForChoices(storyWindow);

      expect(getTapTarget(firstChoice, parts)).toBe('firstChoice');

      tapNow(harness, firstChoice);

      expect(storyWindow.dialogue.node).not.toBe(firstNode);
      expect(storyWindow.dialogue.visibleChoices.map((choice) => choice.text)).toEqual([
        'Ask about the ceiling',
        'Let him be',
      ]);
    });

    test('a second tap on a choice before the next frame logs nothing', async () => {
      let {log} = harness.nightScreen.contents.night;
      let storyWindow = await openSpot('A patron');

      // Finish the text, and wait until the choices take a tap.
      await press('Enter');
      await waitForChoices(storyWindow);

      let firstNode = storyWindow.dialogue.node;
      let firstChoice = getBox(harness, getWindowButton(storyWindow, 0));
      // The scene's tests share one night, so only the entries of this test count.
      let logStart = log.length;

      // No frame runs between the taps, so the second finds the button still there, but the
      // runner is past its choices and takes nothing.
      tapNow(harness, firstChoice);
      tapNow(harness, firstChoice);

      expect(storyWindow.dialogue.node).not.toBe(firstNode);
      expect(log.slice(logStart)).toMatchObject([{kind: 'choice', text: 'Talk to him'}]);
    });

    test('the long text is shown in pages of at most 16 lines', async () => {
      let storyWindow = await openLongText();
      let whole = storyWindow.dialogue.pageText;
      let pages = await readPages(storyWindow);

      expect(pages.length).toBeGreaterThan(1);
      // A node without choices reserves no room under the text.
      expect(pages[0]?.trimEnd().split('\n')).toHaveLength(16);

      for (let shown of pages) {
        expect(shown.trimEnd().split('\n').length).toBeLessThanOrEqual(16);
      }

      // Nothing is lost or repeated where one page ends and the next begins.
      expect(pages.join('').replaceAll('\n', ' ')).toBe(stripMarks(whole));

      await press('Enter');
      await waitForNoStoryWindow(harness);
    });

    test('the window keeps its size on every page of the long text', async () => {
      let storyWindow = await openLongText();
      let {panel} = getWindowParts(storyWindow);
      let boxes: Box[] = [];

      await readPages(storyWindow, () => {
        boxes.push(getBox(harness, panel));
      });

      let [first] = boxes;

      expect(boxes.length).toBeGreaterThan(1);
      expect(boxes).toEqual(boxes.map(() => first));
    });

    test('an arrow key focuses the first choice, and Enter orders a beer', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      // Finish the text, focus "Order a beer" and take it.
      await press('Enter');
      await press('ArrowDown');

      expect(describeFocus(nightScreen.ui.focused)).toBe(BEER_LABEL);
      expect(nightScreen.ui.isRingVisible).toBe(true);

      await press('Enter');

      expect(nightScreen.contents.night).toEqual({
        minutes: 1190,
        money: 305,
        place: FIXED_BAR,
        leaving: null,
        drunkenness: {level: 1, at: 1190},
        roll: null,
        random: Math.random,
        log: expect.any(Array) as unknown,
      });
      // The choice at the press, before its ten minutes; its text at 19:50.
      expect(nightScreen.contents.night.log.slice(-2)).toMatchObject([
        {kind: 'choice', minutes: 1180, text: BEER_LABEL},
        {
          kind: 'text',
          minutes: 1190,
          speaker: 'The bartender',
          text: expect.stringContaining('She pulls a beer') as unknown,
        },
      ]);
      // The status changes while the window is still open.
      expect(readText(nightScreen.contents.statusText)).toBe('19:50   305 Kč   1.0');

      // Finish the text and close the window.
      await press('Enter');
      await press('Enter');
      await waitForNoStoryWindow(harness);

      // The status stays when the window closes, and the focus returns.
      expect(storyWindow.dialogue.phase).toBe('ended');
      expect(readText(nightScreen.contents.statusText)).toBe('19:50   305 Kč   1.0');
      expect(describeFocus(nightScreen.ui.focused)).toBe('The bartender');
    });

    test('a choice the night cannot pay is greyed out, takes no tap and the arrows skip it', async () => {
      let {nightScreen} = harness;
      let {night} = nightScreen.contents;
      let {money} = night;

      try {
        // A price equal to the money is affordable.
        night.money = 45;

        let affordable = await openSpot('The bartender');

        await press('Enter');

        expect(getWindowButton(affordable, 0).isDisabled).toBe(false);

        clearScene();
        night.money = 40;

        let storyWindow = await openSpot('The bartender');

        await press('Enter');

        let beer = getWindowButton(storyWindow, 0);

        expect(getButtonLabel(beer)).toBe(BEER_LABEL);
        expect(beer.isDisabled).toBe(true);
        expect(getWindowButton(storyWindow, 1).isDisabled).toBe(false);

        await press('ArrowDown');

        expect(describeFocus(nightScreen.ui.focused)).toBe('Leave her alone');

        // A resize builds the buttons again.
        storyWindow.resize(getSceneArea(480, 270));

        expect(getWindowButton(storyWindow, 0)).not.toBe(beer);
        expect(getWindowButton(storyWindow, 0).isDisabled).toBe(true);
        expect(describeFocus(nightScreen.ui.focused)).toBe('Leave her alone');

        await waitForChoices(storyWindow);

        let before = {...night};

        await tap(harness, getBox(harness, getWindowButton(storyWindow, 0)));

        expect(storyWindow.dialogue.phase).toBe('choosing');
        expect(night).toEqual(before);
      } finally {
        night.money = money;
      }
    });

    test('a rolling choice enters the node of its outcome', async () => {
      let {nightScreen} = harness;
      let {night} = nightScreen.contents;
      let script = sampleBar.spots.find((spot) => spot.label === 'The door')?.script;

      try {
        for (let [value, won, node] of [
          [0.2, true, script?.nodes?.answered],
          [0.9, false, script?.nodes?.unanswered],
        ] as const) {
          clearScene();
          night.random = () => value;

          let storyWindow = await openSpot('The door');

          await press('Enter');

          expect(getButtonLabel(getWindowButton(storyWindow, 1))).toBe(
            'Knock on the glass  5 min  60%',
          );

          nightScreen.ui.focus(getWindowButton(storyWindow, 1));
          await press('Enter');

          expect(night.roll).toEqual({value, odds: 0.6, won});
          expect(storyWindow.dialogue.node).toBe(node);
        }
      } finally {
        night.random = Math.random;
      }
    });

    test('the place button opens the description again', async () => {
      let {nightScreen} = harness;

      nightScreen.ui.focus(getPlaceButton(harness));
      await press('Enter');

      expect(getStoryWindow(harness).dialogue.node?.speaker).toBe(sampleBar.name);
    });

    test('a scene button does nothing while a window is open', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      // The dimmed scene takes no taps and no key presses, so the test calls
      // the buttons themselves.
      getSpotButton(harness, 'The door').activate();
      getPlaceButton(harness).activate();

      expect(nightScreen.contents.storyWindow).toBe(storyWindow);
      expect(storyWindow.state).not.toBe('closed');
      expect(storyWindow.dialogue.node?.speaker).toBe('Two women talking');
    });

    // A real tap on Menu, which the window does not cover: the window's layer under its panel
    // takes it, though the layer draws nothing, so no menu opens.
    test('a tap on Menu behind a window does nothing', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      await tap(harness, getBox(harness, nightScreen.contents.menuButton));

      expect(nightScreen.contents.menuModal).toBeNull();
      expect(nightScreen.contents.storyWindow).toBe(storyWindow);
    });

    test('a resize in the middle of a text keeps the place and wraps the text again', async () => {
      let {measureText, nightScreen} = harness;
      let {log} = nightScreen.contents.night;
      // The scene's tests share one night, so only the entries of this test count.
      let logStart = log.length;
      // The patron's pages this test has logged.
      let countPatronPages = () =>
        log.slice(logStart).filter((entry) => entry.kind === 'text' && entry.speaker === 'A patron')
          .length;
      let storyWindow = await openLongText();

      // Finish the first page and turn it, and wait for the second page to
      // start typing.
      await press('Enter');
      await press('Enter');
      await vitest.waitFor(
        () => {
          expect(storyWindow.text.length).toBeGreaterThan(0);
          expect(storyWindow.text.endsWith('\n')).toBe(false);
        },
        {timeout: 10_000},
      );

      let whole = storyWindow.dialogue.pageText;
      let revealedBefore = storyWindow.dialogue.revealedCount;

      // The table, the talk and the ceiling, whose long text is one page of the runner.
      expect(countPatronPages()).toBe(3);

      try {
        // 300 × 270 art pixels: the window is 292 wide and its text 268.
        await page.viewport(600, 540);
        await vitest.waitFor(
          () => {
            expect(getBox(harness, getWindowParts(storyWindow).panel).width).toBe(292);
          },
          {timeout: 10_000},
        );

        expect(storyWindow.dialogue.revealedCount).toBeGreaterThanOrEqual(revealedBefore);
        expect(storyWindow.dialogue.revealedCount).toBeLessThan(whole.length);

        let pages = await readPages(storyWindow);

        for (let shown of pages) {
          let lines = shown.trimEnd().split('\n');

          expect(lines.length).toBeLessThanOrEqual(16);

          for (let line of lines) {
            expect(measureText(line)).toBeLessThanOrEqual(268);
          }
        }

        // The pages after the resize end with the end of the text.
        expect(stripMarks(whole).endsWith(pages.join('').replaceAll('\n', ' '))).toBe(true);
        expect(storyWindow.dialogue.revealedCount).toBe(whole.length);
        // The window's own pages and the resize log nothing.
        expect(countPatronPages()).toBe(3);
      } finally {
        await restoreViewport();
      }
    });

    test('a resize keeps the focus on the choice that had it', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      // Finish the text, focus the first choice and move to the second.
      await press('Enter');
      await press('ArrowDown');
      await press('ArrowDown');

      expect(describeFocus(nightScreen.ui.focused)).toBe('Leave her alone');

      try {
        // 300 × 270 art pixels: the window is 292 wide.
        await page.viewport(600, 540);
        await vitest.waitFor(
          () => {
            expect(getBox(harness, getWindowParts(storyWindow).panel).width).toBe(292);
          },
          {timeout: 10_000},
        );

        let secondChoice = getWindowButton(storyWindow, 1);

        expect(getButtonLabel(secondChoice)).toBe('Leave her alone');
        expect(describeFocus(nightScreen.ui.focused)).toBe('Leave her alone');
      } finally {
        await restoreViewport();
      }
    });

    test('a resize starts the fade of fading choices again and brings shown ones back at once', async () => {
      let storyWindow = await openSpot('The bartender');
      let area = getSceneArea(480, 270);

      function getChoicesView(): pixi.Container {
        let {buttonArea, buttons} = getWindowParts(storyWindow);

        if (buttonArea === null || buttons.length === 0) {
          throw new Error('The story window offers no choices!');
        }

        return buttonArea.view;
      }

      // No frame runs between these calls: the text is finished, update()
      // builds the choices and starts their fade, and the resize builds them
      // again in it.
      storyWindow.dialogue.advance();
      storyWindow.update(0);
      storyWindow.resize(area);

      expect(getChoicesView().alpha).toBe(0);
      expect(getChoicesView().eventMode).toBe('none');

      await waitForChoices(storyWindow);
      storyWindow.resize(area);

      expect(getChoicesView().alpha).toBe(1);
      expect(getChoicesView().eventMode).not.toBe('none');
    });

    test('a window attached again fades in the choices whose fade its detach cut short', async () => {
      let {ui} = harness.nightScreen;
      let storyWindow = await openSpot('The bartender');

      // No frame runs between these calls: the choices start their fade, and
      // the window leaves the root and comes back before the fade advances.
      storyWindow.dialogue.advance();
      storyWindow.update(0);
      ui.removeOverlay(storyWindow);
      ui.addOverlay(storyWindow);

      await waitForChoices(storyWindow);

      expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
        BEER_LABEL,
        'Leave her alone',
      ]);
    });

    test('a node without a speaker has no title, and the window is shorter by it', async () => {
      let {contents, scheduler, ui} = harness.nightScreen;
      let text = 'The lamp over the counter flickers once and then burns steady again.';
      let opened: StoryWindow[] = [];

      // The screen ticks the window it holds, so the window types and closes
      // as one the screen opened.
      function openWindow(speaker: string | undefined): StoryWindow {
        let storyWindow = new harness.StoryWindow({
          scheduler,
          script: defineDialogueScript<Night>()({
            start: speaker === undefined ? {text} : {speaker, text},
          }),
          context: contents.night,
          area: getSceneArea(480, 270),
          onClosed: () => {
            contents.storyWindow = null;
          },
        });

        opened.push(storyWindow);
        contents.storyWindow = storyWindow;
        ui.addOverlay(storyWindow);

        return storyWindow;
      }

      try {
        let withSpeaker = openWindow('A lamp');

        await nextFrame();
        await nextFrame();

        let heightWithTitle = getBox(harness, getWindowParts(withSpeaker).panel).height;

        withSpeaker.destroy();
        contents.storyWindow = null;

        let storyWindow = openWindow(undefined);

        await nextFrame();
        await nextFrame();

        let {panel, title} = getWindowParts(storyWindow);
        let box = getBox(harness, panel);

        expect(title).toBeNull();
        expect(panel.children).toHaveLength(1);
        // The title block of 15 and the gap of 4 under it.
        expect(box.height).toBe(heightWithTitle - 19);
        expect(box.top).toBeGreaterThanOrEqual(24 + 4);
        expect(box.top + box.height).toBeLessThanOrEqual(270 - 4);

        await press('Enter');

        expect(storyWindow.text.replaceAll('\n', ' ')).toBe(text);

        // Without a title the cursor still follows the last letter.
        expectCursorAfter(storyWindow, storyWindow.text);

        await press('Enter');
        await waitForNoStoryWindow(harness);

        expect(storyWindow.dialogue.phase).toBe('ended');
      } finally {
        for (let storyWindow of opened) {
          storyWindow.destroy();
        }

        contents.storyWindow = null;
      }
    });

    test('the cursor after a line that fills the text width stays inside the panel', async () => {
      let {contents, scheduler, ui} = harness.nightScreen;
      // 46 letters of 6 are the text width of 276 exactly.
      let text = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst';
      let storyWindow = new harness.StoryWindow({
        scheduler,
        script: defineDialogueScript<Night>()({start: {text}}),
        context: contents.night,
        area: getSceneArea(480, 270),
        onClosed: () => {
          contents.storyWindow = null;
        },
      });

      contents.storyWindow = storyWindow;
      ui.addOverlay(storyWindow);

      try {
        await nextFrame();
        await nextFrame();
        await press('Enter');

        expect(text).toHaveLength(46);
        expect(storyWindow.text).toBe(text);

        let {cursor, panel, textBlock} = getWindowParts(storyWindow);
        let panelBox = getBox(harness, panel);
        let textBox = getBox(harness, textBlock);
        let cursorBox = getCursorBox(cursor);

        expect(textBox.width).toBe(276);
        expect(cursorBox.left).toBe(textBox.left + 276 + 2);
        expect(cursorBox.left).toBeGreaterThanOrEqual(panelBox.left);
        expect(cursorBox.top).toBeGreaterThanOrEqual(panelBox.top);
        expect(cursorBox.left + cursorBox.width).toBeLessThanOrEqual(
          panelBox.left + panelBox.width,
        );
        expect(cursorBox.top + cursorBox.height).toBeLessThanOrEqual(
          panelBox.top + panelBox.height,
        );
      } finally {
        // Read after the awaits, so the current contents are cleared.
        let {contents: currentContents} = harness.nightScreen;

        storyWindow.destroy();
        currentContents.storyWindow = null;
      }
    });

    test('no word in the sample bar is longer than 16 characters', () => {
      let scripts = [sampleBar.description, ...sampleBar.spots.map((spot) => spot.script)];
      let texts = [sampleBar.name, ...sampleBar.spots.map((spot) => spot.label)];

      for (let script of scripts) {
        let nodes = Object.values(script.nodes ?? {});

        if (typeof script.start === 'object') {
          nodes.push(script.start);
        }

        for (let node of nodes) {
          // Every node sets a speaker, and its text is one string.
          expect(node?.speaker).toBeTypeOf('string');
          expect(node?.text).toBeTypeOf('string');

          texts.push(String(node?.text), ...(node?.choices ?? []).map((choice) => choice.text));
        }
      }

      let words = texts.flatMap((text) => stripMarks(text).split(/\s+/u));

      expect(words.length).toBeGreaterThan(500);
      expect(words.filter((word) => word.length > 16)).toEqual([]);
    });
  });

  describe('menu', () => {
    beforeEach(() => {
      clearScene();
    });

    test('Escape on the scene opens the menu with Resume focused, and Resume closes it', async () => {
      let {nightScreen} = harness;

      await press('Escape');

      let menu = getMenu();
      let resumeButton = getMenuButton(menu, 'Resume');

      expect(nightScreen.ui.topOverlay).toBe(menu);
      expect(menu.initialFocus).toBe(resumeButton);
      expect(describeFocus(nightScreen.ui.focused)).toBe('Resume');
      expect(nightScreen.ui.isRingVisible).toBe(true);

      await press('Enter');
      await waitForNoMenu();

      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    // A frame of 100 ms, the length of a UI fade, finishes the close of the menu inside the frame
    // of the Escape that closes it. Both frames are direct calls, with the cancel command latched,
    // so no real frame decides the outcome.
    test('Escape in a 100 ms frame closes the menu and opens no new one', async () => {
      let {nightScreen} = harness;
      let {input} = await import('../source/game/core/input.js');
      let focusPressed = vitest
        .spyOn(input, 'focusPressed')
        .mockImplementation((command) => command === 'cancel');

      try {
        nightScreen.ui.cancel();
        nightScreen.update({deltaMS: 100} as pixi.Ticker);

        // Escape on the scene opens the menu.
        expect(nightScreen.contents.menuModal).not.toBeNull();

        nightScreen.ui.cancel();
        nightScreen.update({deltaMS: 100} as pixi.Ticker);

        // The menu took the command, closed within the frame and is gone, and no menu reopens.
        expect(nightScreen.contents.menuModal).toBeNull();
        expect(nightScreen.ui.topOverlay).toBeNull();
      } finally {
        focusPressed.mockRestore();
      }
    });

    // Quit to menu hides the screen inside its click; the Escape test below covers it with real
    // keys, which the screen's lastTopOverlay already turns away. This pins openMenu's own state
    // guard, which the error path of actOnNight also relies on.
    test('the cancel command opens no menu while the screen is not shown', async () => {
      let {nightScreen} = harness;
      let {input} = await import('../source/game/core/input.js');
      let state = vitest.spyOn(nightScreen, 'state', 'get').mockReturnValue('attached');
      let focusPressed = vitest
        .spyOn(input, 'focusPressed')
        .mockImplementation((command) => command === 'cancel');

      try {
        nightScreen.update({deltaMS: 16} as pixi.Ticker);

        expect(nightScreen.contents.menuModal).toBeNull();
      } finally {
        focusPressed.mockRestore();
        state.mockRestore();
      }
    });

    test('two buttons in the menu are 4 apart', async () => {
      await press('Escape');

      let menu = getMenu();
      let resume = getBox(harness, getMenuButton(menu, 'Resume'));
      let options = getBox(harness, getMenuButton(menu, 'Options'));
      let quit = getBox(harness, getMenuButton(menu, 'Quit to menu'));
      let [panel] = menu.children;

      expect(options.top - (resume.top + resume.height)).toBeCloseTo(4);
      expect([resume.width, options.width, quit.width]).toEqual([84, 84, 84]);
      expect(panel instanceof Panel ? getBox(harness, panel).width : 0).toBe(108);

      await press('Escape');
      await waitForNoMenu();
    });

    test('Escape closes the menu', async () => {
      await press('Escape');

      expect(harness.nightScreen.ui.topOverlay).toBe(getMenu());

      await press('Escape');
      await waitForNoMenu();

      expect(harness.nightScreen.ui.topOverlay).toBeNull();
    });

    test('Escape in a story window opens the menu above it, and the text waits', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      await press('Escape');

      let menu = getMenu();

      expect(nightScreen.contents.storyWindow).toBe(storyWindow);
      expect(storyWindow.state).not.toBe('closed');
      expect(nightScreen.ui.topOverlay).toBe(menu);
      expect(describeFocus(nightScreen.ui.focused)).toBe('Resume');
      expect(nightScreen.ui.isRingVisible).toBe(true);

      let revealed = storyWindow.dialogue.revealedCount;

      expect(revealed).toBeLessThan(storyWindow.dialogue.pageText.length);

      for (let count = 0; count < 5; count += 1) {
        await nextFrame();
      }

      expect(storyWindow.dialogue.revealedCount).toBe(revealed);

      // Resume closes the menu, and the text goes on.
      await press('Enter');
      await waitForNoMenu();

      expect(nightScreen.ui.topOverlay).toBe(storyWindow);

      await vitest.waitFor(
        () => {
          expect(storyWindow.dialogue.revealedCount).toBeGreaterThan(revealed);
        },
        {timeout: 10_000},
      );
    });

    test('a tap on the Menu button opens the menu, and a tap on Resume closes it', async () => {
      let {nightScreen} = harness;
      let {menuButton} = nightScreen.contents;

      await tap(harness, getBox(harness, menuButton));

      let menu = getMenu();

      expect(nightScreen.ui.topOverlay).toBe(menu);
      expect(describeFocus(nightScreen.ui.focused)).toBe('Resume');
      expect(nightScreen.ui.isRingVisible).toBe(true);

      await tap(harness, getBox(harness, getMenuButton(menu, 'Resume')));
      await waitForNoMenu();

      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    test('Options opens over the menu, and closing it returns to the menu', async () => {
      let {nightScreen} = harness;

      await press('Escape');

      let menu = getMenu();
      let optionsButton = getMenuButton(menu, 'Options');

      nightScreen.ui.focus(optionsButton);
      await press('Enter');

      let options = nightScreen.contents.optionsModal;

      expect(options).not.toBeNull();
      expect(nightScreen.ui.topOverlay).toBe(options);

      await press('Escape');
      await vitest.waitFor(
        () => {
          expect(nightScreen.contents.optionsModal).toBeNull();
        },
        {timeout: 10_000},
      );

      expect(nightScreen.contents.menuModal).toBe(menu);
      expect(nightScreen.ui.topOverlay).toBe(menu);
      expect(describeFocus(nightScreen.ui.focused)).toBe('Options');
    });

    test('the picture runs at half speed while a window is open', async () => {
      let {nightScreen} = harness;

      await nextFrame();

      expect(getPicture(harness).speed).toBe(1);

      await press('Escape');

      let menu = getMenu();

      await nextFrame();

      expect(getPicture(harness).speed).toBe(0.5);

      nightScreen.ui.focus(getMenuButton(menu, 'Options'));
      await press('Enter');

      expect(nightScreen.contents.optionsModal).not.toBeNull();

      await nextFrame();

      expect(getPicture(harness).speed).toBe(0.5);

      await press('Escape');
      await vitest.waitFor(
        () => {
          expect(nightScreen.contents.optionsModal).toBeNull();
        },
        {timeout: 10_000},
      );
      await press('Escape');
      await waitForNoMenu();
      await nextFrame();

      expect(nightScreen.ui.topOverlay).toBeNull();
      expect(getPicture(harness).speed).toBe(1);

      await openSpot('Two women talking');
      await nextFrame();

      expect(getPicture(harness).speed).toBe(0.5);
    });

    test('Options does nothing once the menu is closing', async () => {
      let {nightScreen} = harness;

      await press('Escape');

      let menu = getMenu();

      nightScreen.ui.focus(getMenuButton(menu, 'Options'));
      // What Escape and then Enter do, without a frame between them: on a slow
      // machine the whole fade can pass between two key presses of a test.
      nightScreen.ui.cancel();

      expect(menu.state).toBe('closing');

      nightScreen.ui.activate();

      expect(nightScreen.contents.optionsModal).toBeNull();

      await waitForNoMenu();

      expect(nightScreen.contents.optionsModal).toBeNull();
      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    test('Quit to menu does nothing once the menu is closing', async () => {
      let {game, nightScreen} = harness;

      await press('Escape');

      let menu = getMenu();

      nightScreen.ui.focus(getMenuButton(menu, 'Quit to menu'));
      nightScreen.ui.cancel();

      expect(menu.state).toBe('closing');

      nightScreen.ui.activate();

      // Hiding a screen starts inside the click, so a quit shows at once.
      expect(nightScreen.state).toBe('shown');

      await waitForNoMenu();

      expect(game.currentScreen).toBe(nightScreen);
      expect(nightScreen.state).toBe('shown');
    });
  });

  // These tests leave the night screen, in order.
  describe('leaving', () => {
    beforeEach(() => {
      clearScene();
    });

    test('Quit to menu above a story window shows the main menu and its music', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;

      await openSpot('Two women talking');
      await press('Escape');
      nightScreen.ui.focus(getMenuButton(getMenu(), 'Quit to menu'));
      await press('Enter');
      await vitest.waitFor(
        () => {
          expect(mainMenuScreen.state).toBe('shown');
        },
        {timeout: 10_000},
      );

      expect(game.currentScreen).toBe(mainMenuScreen);
      expect(nightScreen.contents.storyWindow).toBeNull();
      expect(nightScreen.contents.menuModal).toBeNull();
      expect(nightScreen.contents.optionsModal).toBeNull();
      expect(nightScreen.ui.topOverlay).toBeNull();
      expect(playMusic).toHaveBeenCalledTimes(2);
    });

    // A beer was ordered in the night before this one.
    test('a second New Game shows the starting status and the description', async () => {
      let {nightScreen} = harness;

      await startNewGame(harness);

      expect(readText(nightScreen.contents.statusText)).toBe(STARTING_STATUS);
      expect(getStoryWindow(harness).dialogue.node?.speaker).toBe(sampleBar.name);
    });

    test('hiding the screen with a window open destroys the window at once', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      // What the engine does when the error screen takes over.
      await game.showScreen(mainMenuScreen);

      expect(storyWindow.state).toBe('closed');
      expect(nightScreen.contents.storyWindow).toBeNull();
      expect(nightScreen.ui.topOverlay).toBeNull();

      // The screen still works after it: the description opens and closes.
      await startNewGame(harness);
      await press('Enter');
      await press('Enter');
      await waitForNoStoryWindow(harness);

      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    test('Escape in the frame of Quit to menu opens no menu on the hidden screen', async () => {
      let {mainMenuScreen, nightScreen} = harness;

      await press('Escape');
      nightScreen.ui.focus(getMenuButton(getMenu(), 'Quit to menu'));

      // Both keys in one frame: Quit to menu hides the screen inside its
      // click, and the same frame's onUpdate then reads the cancel command.
      for (let code of ['Enter', 'Escape']) {
        globalThis.dispatchEvent(new KeyboardEvent('keydown', {code, cancelable: true}));
        globalThis.dispatchEvent(new KeyboardEvent('keyup', {code, cancelable: true}));
      }

      await vitest.waitFor(
        () => {
          expect(mainMenuScreen.state).toBe('shown');
        },
        {timeout: 10_000},
      );

      expect(nightScreen.contents.menuModal).toBeNull();
      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    test('a tap on Quit to menu shows the main menu', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;

      // The description opens on arrival, and its text ends it.
      await startNewGame(harness);
      await press('Enter');
      await press('Enter');
      await waitForNoStoryWindow(harness);
      await press('Escape');
      await tap(harness, getBox(harness, getMenuButton(getMenu(), 'Quit to menu')));
      await vitest.waitFor(
        () => {
          expect(mainMenuScreen.state).toBe('shown');
        },
        {timeout: 10_000},
      );

      expect(game.currentScreen).toBe(mainMenuScreen);
      expect(nightScreen.contents.storyWindow).toBeNull();
      expect(nightScreen.contents.menuModal).toBeNull();
      expect(nightScreen.contents.optionsModal).toBeNull();
    });
  });
});
