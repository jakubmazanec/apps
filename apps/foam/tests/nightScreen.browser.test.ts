import {AudioMixer, Button, defineDialogueScript, type Modal, Panel} from 'tellurion';
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

import {samplePlace} from '../source/game/content/samplePlace.js';
import {getSceneArea} from '../source/game/core/getSceneArea.js';
import {getSpotPosition} from '../source/game/core/getSpotPosition.js';
import {type Night} from '../source/game/core/night.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {
  bootGame,
  type Box,
  doBoxesOverlap,
  getBox,
  getButtonLabel,
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
  waitForNoStoryWindow,
} from './nightScreenHelpers.js';

const STARTING_STATUS = '19:40   350 Kč   Sober';

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

// The menu is a Modal holding one Panel: the title, then the buttons Resume,
// Options and Quit to menu.
function getMenuButton(menu: Modal, label: string): Button {
  let [panel] = menu.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The menu has no panel!');
  }

  let button = panel.children.find(
    (child) => child instanceof Button && getButtonLabel(child) === label,
  );

  if (!(button instanceof Button)) {
    throw new TypeError(`The menu has no "${label}" button!`);
  }

  return button;
}

// 960 × 540 CSS pixels are 480 × 270 art pixels: headless Chromium has a
// device pixel ratio of 1, and the engine picks a pixel scale of 2, its
// smallest, so a frame draws as few pixels as the art allows. The frames of a
// headless browser are slow, and several times slower on a busy machine, so
// the tests get a long timeout.
describe('night screen', {timeout: 180_000}, () => {
  let harness: Harness;
  // The spies call through to the real mixer; they only record the calls.
  let play: MockInstance<AudioMixer['play']>;
  let playMusic: MockInstance<AudioMixer['playMusic']>;

  async function openSpot(label: string): Promise<StoryWindow> {
    harness.nightScreen.ui.focus(getSpotButton(harness, label));
    await press('Enter');

    return getStoryWindow(harness);
  }

  function getMenu(): Modal {
    let {menuModal} = harness.nightScreen.contents;

    if (menuModal === null) {
      throw new Error('The menu is not open!');
    }

    return menuModal;
  }

  // The menu closes after a 200 ms fade, so closing is awaited.
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
  }, 60_000);

  afterAll(() => {
    play.mockRestore();
    playMusic.mockRestore();
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

    test('the description opens by itself', () => {
      let storyWindow = getStoryWindow(harness);
      let {title} = getWindowParts(storyWindow);

      expect(harness.nightScreen.ui.topOverlay).toBe(storyWindow.modal);
      expect(storyWindow.dialogue.node?.speaker).toBe(samplePlace.name);
      expect(title === null ? null : readText(title)).toBe(samplePlace.name);
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

      expect(storyWindow.text.length).toBeGreaterThan(0);
      expect(storyWindow.text.length).toBeLessThan(whole.length);

      await press('Enter');

      // wrapText only turns spaces into line ends.
      expect(storyWindow.text.replaceAll('\n', ' ')).toBe(whole);
    });

    test('Continue on the last page closes the window', async () => {
      let {nightScreen} = harness;
      let continueButton = getWindowButton(getStoryWindow(harness), 0);

      expect(getButtonLabel(continueButton)).toBe('Continue');
      expect(nightScreen.ui.focused).toBe(continueButton);

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

    test('the background fills the screen', () => {
      let {view} = harness.nightScreen.contents.background;

      expect(view.width).toBe(480);
      expect(view.height).toBe(270);
    });

    test('every scene button lies inside the screen and under the top row', async () => {
      let {nightScreen} = harness;

      await nextFrame();

      expect(nightScreen.contents.spotButtons).toHaveLength(samplePlace.spots.length);

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

    test('no two scene buttons overlap on a 146 × 262 screen', () => {
      let area = getSceneArea(146, 262);
      let boxes = samplePlace.spots.map((spot) => {
        let size = {width: harness.measureText(spot.label, 'label') + 4, height: 16};

        return {...getSpotPosition({x: spot.x, y: spot.y, ...size, area}), ...size};
      });

      expect(findOverlap(boxes)).toBeNull();
    });

    test('an arrow key moves the focus to the nearest button and plays the click', async () => {
      let {assets, nightScreen} = harness;

      nightScreen.ui.focus(getSpotButton(harness, 'The bartender'));
      play.mockClear();
      await press('ArrowRight');

      expect(nightScreen.ui.focused).toBe(getSpotButton(harness, 'Two women talking'));
      expect(play).toHaveBeenCalledWith(assets.sound('ui-click'), {bus: 'ui'});
    });

    test('a scene button opens its window, and the choices replace Continue', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      expect(storyWindow.dialogue.node?.speaker).toBe('The bartender');
      expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual(['Continue']);

      await press('Enter');

      let {buttons} = getWindowParts(storyWindow);

      expect(storyWindow.dialogue.phase).toBe('choosing');
      expect(buttons.map(getButtonLabel)).toEqual(['Order a beer', 'Leave her alone']);
      expect(nightScreen.ui.focused).toBe(buttons[0]);
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

        expect(storyWindow.text.replaceAll('\n', ' ')).toBe(storyWindow.dialogue.pageText);
        expect(buttons.map(getButtonLabel)).toEqual(['Order a beer', 'Leave her alone']);
        expect(nightScreen.ui.focused).toBe(buttons[0]);
      },
    );

    test('the window keeps its size when the choices replace Continue', async () => {
      let storyWindow = await openSpot('The bartender');
      let {panel} = getWindowParts(storyWindow);

      await nextFrame();

      let before = getBox(harness, panel);

      expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual(['Continue']);

      await press('Enter');

      expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual([
        'Order a beer',
        'Leave her alone',
      ]);
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
      let storyWindow = await openSpot('A patron');
      let firstNode = storyWindow.dialogue.node;

      // Finish the text and take the first choice, "Talk to him".
      await press('Enter');
      await press('Enter');

      expect(storyWindow.dialogue.node).not.toBe(firstNode);
      expect(storyWindow.dialogue.visibleChoices.map((choice) => choice.text)).toEqual([
        'Ask about the ceiling',
        'Let him be',
      ]);
      expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual(['Continue']);
    });

    test('the long text is shown in three pages of at most 15 lines', async () => {
      let storyWindow = await openSpot('A patron');

      // Finish the text and take "Talk to him", then the same for "Ask about
      // the ceiling".
      await press('Enter');
      await press('Enter');
      await press('Enter');
      await press('Enter');

      let whole = storyWindow.dialogue.pageText;
      let pages = await readPages(storyWindow);

      expect(pages).toHaveLength(3);

      for (let shown of pages) {
        expect(shown.trimEnd().split('\n').length).toBeLessThanOrEqual(15);
      }

      // Nothing is lost or repeated where one page ends and the next begins.
      expect(pages.join('').replaceAll('\n', ' ')).toBe(whole);

      await press('Enter');
      await waitForNoStoryWindow(harness);
    });

    test('the window keeps its size on every page of the long text', async () => {
      let storyWindow = await openSpot('A patron');
      let {panel} = getWindowParts(storyWindow);
      let boxes: Box[] = [];

      // Finish the text and take "Talk to him", then the same for "Ask about
      // the ceiling".
      await press('Enter');
      await press('Enter');
      await press('Enter');
      await press('Enter');
      await readPages(storyWindow, () => {
        boxes.push(getBox(harness, panel));
      });

      let [first] = boxes;

      expect(boxes).toHaveLength(3);
      expect(boxes).toEqual([first, first, first]);
    });

    test('ordering a beer changes the status, and the focus returns', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      // Finish the text and take the first choice, "Order a beer".
      await press('Enter');
      await press('Enter');

      expect(nightScreen.contents.night).toEqual({
        minutes: 1190,
        money: 305,
        stateOfMind: 'Sober',
      });
      // The status behind the window follows when the window closes.
      expect(readText(nightScreen.contents.statusText)).toBe(STARTING_STATUS);

      // Finish the text and close the window.
      await press('Enter');
      await press('Enter');
      await waitForNoStoryWindow(harness);

      expect(storyWindow.dialogue.phase).toBe('ended');
      expect(readText(nightScreen.contents.statusText)).toBe('19:50   305 Kč   Sober');
      expect(nightScreen.ui.focused).toBe(getSpotButton(harness, 'The bartender'));
    });

    test('the place button opens the description again', async () => {
      let {nightScreen} = harness;

      nightScreen.ui.focus(nightScreen.contents.placeButton);
      await press('Enter');

      expect(getStoryWindow(harness).dialogue.node?.speaker).toBe(samplePlace.name);
    });

    test('a scene button does nothing while a window is open', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      // The dimmed scene takes no taps and no key presses, so the test calls
      // the buttons themselves.
      getSpotButton(harness, 'The door').activate();
      nightScreen.contents.placeButton.activate();

      expect(nightScreen.contents.storyWindow).toBe(storyWindow);
      expect(storyWindow.modal.state).not.toBe('closed');
      expect(storyWindow.dialogue.node?.speaker).toBe('Two women talking');
    });

    test('Escape closes a window in the middle of a text', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      expect(storyWindow.text.length).toBeLessThan(storyWindow.dialogue.pageText.length);

      await press('Escape');
      await waitForNoStoryWindow(harness);

      expect(storyWindow.dialogue.phase).not.toBe('ended');
      expect(nightScreen.ui.topOverlay).toBeNull();
      expect(nightScreen.ui.focused).toBe(getSpotButton(harness, 'Two women talking'));
    });

    test('a press during the closing fade does not reach the choices', async () => {
      let {nightScreen} = harness;
      let before = {...nightScreen.contents.night};
      let storyWindow = await openSpot('The bartender');

      await press('Enter');

      let orderButton = getWindowButton(storyWindow, 0);

      expect(getButtonLabel(orderButton)).toBe('Order a beer');
      expect(nightScreen.ui.focused).toBe(orderButton);

      // What Escape and then Enter do, without a frame between them: on a slow
      // machine the whole fade can pass between two key presses of a test.
      nightScreen.ui.cancel();

      expect(storyWindow.modal.state).toBe('closing');

      nightScreen.ui.activate();

      expect(storyWindow.dialogue.phase).toBe('choosing');
      expect(nightScreen.contents.night).toEqual(before);

      await waitForNoStoryWindow(harness);

      expect(nightScreen.contents.night).toEqual(before);
    });

    test('a resize in the middle of a text keeps the place and wraps the text again', async () => {
      let {measureText} = harness;
      let storyWindow = await openSpot('A patron');

      // To the long text: finish the text and take "Talk to him", then the
      // same for "Ask about the ceiling". Then finish the first page and turn
      // it, and wait for the second page to start typing.
      await press('Enter');
      await press('Enter');
      await press('Enter');
      await press('Enter');
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

      try {
        // 300 × 270 art pixels: the window is 292 wide and its text 276.
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

          expect(lines.length).toBeLessThanOrEqual(15);

          for (let line of lines) {
            expect(measureText(line)).toBeLessThanOrEqual(276);
          }
        }

        // The pages after the resize end with the end of the text.
        expect(whole.endsWith(pages.join('').replaceAll('\n', ' '))).toBe(true);
        expect(storyWindow.dialogue.revealedCount).toBe(whole.length);
      } finally {
        await restoreViewport();
      }
    });

    test('a resize keeps the focus on the choice that had it', async () => {
      let {nightScreen} = harness;
      let storyWindow = await openSpot('The bartender');

      // Finish the text and move to the second choice.
      await press('Enter');
      nightScreen.ui.focus(getWindowButton(storyWindow, 1));

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
        expect(nightScreen.ui.focused).toBe(secondChoice);
      } finally {
        await restoreViewport();
      }
    });

    test('a node without a speaker has no title, and the window is shorter by it', async () => {
      let {contents, scheduler, ui} = harness.nightScreen;
      let text = 'The lamp over the counter flickers once and then burns steady again.';
      let opened: StoryWindow[] = [];

      // The screen ticks the window it holds, so the window types and closes
      // as one the screen opened.
      function openWindow(speaker: string | undefined): StoryWindow {
        let storyWindow = new harness.StoryWindow({
          ui,
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
        expect(panel.children).toHaveLength(2);
        // The title's line of 12 and the gap of 4 under it.
        expect(box.height).toBe(heightWithTitle - 16);
        expect(box.top).toBeGreaterThanOrEqual(24 + 4);
        expect(box.top + box.height).toBeLessThanOrEqual(270 - 4);

        await press('Enter');

        expect(storyWindow.text.replaceAll('\n', ' ')).toBe(text);

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

    test('no word in the sample place is longer than 16 characters', () => {
      let scripts = [samplePlace.description, ...samplePlace.spots.map((spot) => spot.script)];
      let texts = [samplePlace.name, ...samplePlace.spots.map((spot) => spot.label)];

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

      let words = texts.flatMap((text) => text.split(/\s+/u));

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

      expect(nightScreen.ui.topOverlay).toBe(menu);
      expect(nightScreen.ui.focused).toBe(getMenuButton(menu, 'Resume'));

      await press('Enter');
      await waitForNoMenu();

      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    test('Escape closes the menu', async () => {
      await press('Escape');

      expect(harness.nightScreen.ui.topOverlay).toBe(getMenu());

      await press('Escape');
      await waitForNoMenu();

      expect(harness.nightScreen.ui.topOverlay).toBeNull();
    });

    test('Escape in a story window closes the window and opens no menu', async () => {
      let {nightScreen} = harness;

      await openSpot('Two women talking');
      await press('Escape');
      await waitForNoStoryWindow(harness);
      await nextFrame();

      expect(nightScreen.contents.menuModal).toBeNull();
      expect(nightScreen.ui.topOverlay).toBeNull();
    });

    test('a tap on the Menu button opens the menu, and a tap on Resume closes it', async () => {
      let {nightScreen} = harness;
      // The UI root holds the place button, the status text, the Menu button
      // and the scene buttons, in that order.
      let menuButton = nightScreen.ui.children[2];

      if (!(menuButton instanceof Button) || getButtonLabel(menuButton) !== 'Menu') {
        throw new TypeError('The third child of the UI root is not the Menu button!');
      }

      await tap(harness, getBox(harness, menuButton));

      let menu = getMenu();

      expect(nightScreen.ui.topOverlay).toBe(menu);

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
      expect(nightScreen.ui.focused).toBe(optionsButton);
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

    test('Quit to menu shows the main menu and starts its music again', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;

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
      expect(getStoryWindow(harness).dialogue.node?.speaker).toBe(samplePlace.name);
    });

    test('hiding the screen with a window open destroys the window at once', async () => {
      let {game, mainMenuScreen, nightScreen} = harness;
      let storyWindow = await openSpot('Two women talking');

      // What the engine does when the error screen takes over.
      await game.showScreen(mainMenuScreen);

      expect(storyWindow.modal.state).toBe('closed');
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

      // The description opens on arrival, and Escape closes it.
      await startNewGame(harness);
      await press('Escape');
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
