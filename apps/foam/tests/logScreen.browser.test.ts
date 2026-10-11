import {AudioMixer, type Modal, Text} from 'tellurion';
import {afterAll, beforeAll, describe, expect, type MockInstance, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type createNight as createNightValue} from '../source/game/core/night.js';
import {type logScreen as logScreenValue} from '../source/game/screens/logScreen.js';
import {FIXED_BAR} from './fixedWorld.js';
import {
  bootGame,
  describeFocus,
  getBox,
  getMenuButton,
  type Harness,
  nextFrame,
  press,
  readText,
  setViewport,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check the log screen, which shows no
// picture, so the main menu, which shows the bar, gets the pipeline's proof, a
// shader of a few lines. The bar's GLSL has its text as its type, so the stub's
// text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 960 × 540 CSS pixels are 480 × 270 art pixels, and 292 × 524 are 146 × 262,
// the narrowest screen: headless Chromium has a device pixel ratio of 1, and
// the engine picks a pixel scale of 2. The frames of a headless browser are
// slow, and several times slower on a busy machine, so the tests get a long
// timeout. They follow each other in order: each starts where the one before
// it ended.
describe('log screen', {timeout: 180_000}, () => {
  let harness: Harness;
  let logScreen: typeof logScreenValue;
  let createNight: typeof createNightValue;
  // The spy calls through to the real mixer; it only records the calls.
  let playMusic: MockInstance<AudioMixer['playMusic']>;

  // The text block's two children: the regular leaf and the italic leaf.
  function getLeaves(): {regular: Text; italic: Text} {
    let [regular, italic] = logScreen.contents.textBlock?.children ?? [];

    if (!(regular instanceof Text) || !(italic instanceof Text)) {
      throw new TypeError('The log screen has no text block!');
    }

    return {regular, italic};
  }

  function getMenu(): Modal {
    let {menuModal} = logScreen.contents;

    if (menuModal === null) {
      throw new Error('The menu is not open!');
    }

    return menuModal;
  }

  async function waitForNoMenu(): Promise<void> {
    await vitest.waitFor(
      () => {
        if (logScreen.contents.menuModal !== null) {
          throw new Error('The menu is still open.');
        }
      },
      {timeout: 10_000},
    );
  }

  function getTitle(): string {
    return readText(logScreen.contents.title);
  }

  beforeAll(async () => {
    // Installed before the route's dynamic imports evaluate audio.ts.
    playMusic = vitest.spyOn(AudioMixer.prototype, 'playMusic');
    harness = await bootGame(960, 540);
    ({logScreen} = await import('../source/game/screens/logScreen.js'));
    ({createNight} = await import('../source/game/core/night.js'));

    let {logChoice, logText} = await import('../source/game/core/log.js');
    let night = createNight({place: FIXED_BAR, minutes: 1180, money: 350});

    for (let index = 0; index < 12; index += 1) {
      logText(
        night,
        'The bar',
        `Page ${index}: the bartender dries a glass and watches the room over its rim, and *nobody* is in a hurry.`,
      );
      logChoice(night, 'Ask about the better beer of the winter the pipes froze, and listen');
      night.minutes += 10;
    }

    night.money = 120;
    logScreen.contents.showLog(night);
    await harness.game.showScreen(logScreen);
    // The layout is computed when a frame renders; two frames cover both orders
    // in which the browser may run the engine's frame and this one.
    await nextFrame();
    await nextFrame();
  }, 60_000);

  afterAll(() => {
    playMusic.mockRestore();
    harness.unmount();
    localStorage.clear();
  });

  test('shows the final status, the first page, Back disabled and nothing focused', () => {
    let {back, next, pageStarts, statusText} = logScreen.contents;
    let {italic, regular} = getLeaves();

    expect(logScreen.state).toBe('shown');
    expect(readText(statusText)).toBe('21:40   120 Kč   0.0');
    expect(pageStarts.length).toBeGreaterThan(2);
    expect(getTitle()).toBe(`The night  1 of ${pageStarts.length}`);
    expect(back.isDisabled).toBe(true);
    expect(next.isDisabled).toBe(false);
    expect(logScreen.ui.focused).toBeNull();
    expect(readText(regular).startsWith('19:40  The bar')).toBe(true);
    expect(readText(italic)).toContain('nobody');
  });

  test('Tab focuses Next first', () => {
    let {ui} = logScreen;

    ui.focusNext();

    expect(describeFocus(ui.focused)).toBe('Next');
    expect(ui.isRingVisible).toBe(true);
  });

  test('Enter on Next reads the log through, the window keeps its height, and the focus moves to Back at the end', async () => {
    let {next, pageStarts, panel} = logScreen.contents;
    let box = getBox(harness, panel);
    let firstPage = readText(getLeaves().regular);

    for (let count = 1; count <= 40 && !next.isDisabled; count += 1) {
      await press('Enter');

      expect(getTitle()).toBe(`The night  ${count + 1} of ${pageStarts.length}`);
      expect(getBox(harness, panel)).toEqual(box);
    }

    expect(next.isDisabled).toBe(true);
    expect(describeFocus(logScreen.ui.focused)).toBe('Back');
    expect(readText(getLeaves().regular)).not.toBe(firstPage);
  });

  test('Enter on Back reads it back', async () => {
    let {back, pageStarts} = logScreen.contents;

    for (let count = 0; count < 40 && !back.isDisabled; count += 1) {
      await press('Enter');
    }

    expect(back.isDisabled).toBe(true);
    expect(getTitle()).toBe(`The night  1 of ${pageStarts.length}`);
    expect(describeFocus(logScreen.ui.focused)).toBe('Next');
  });

  test("a page that starts inside a choice's line is italic", async () => {
    let {formatted, pageStarts} = logScreen.contents;
    let target = pageStarts.findIndex(
      (start, index) => index > 0 && formatted.slice(0, start).split('*').length % 2 === 0,
    );

    expect(target).toBeGreaterThan(0);

    for (let count = 0; count < target; count += 1) {
      await press('Enter');
    }

    let {italic, regular} = getLeaves();

    expect(getTitle()).toBe(`The night  ${target + 1} of ${pageStarts.length}`);
    expect(readText(regular).split('\n')[0]).toMatch(/^ *$/u);
    expect(readText(italic).split('\n')[0]).toMatch(/\p{L}/u);
  });

  test('a resize keeps the page and the title fits the narrowest screen', async () => {
    await press('Enter');
    await press('Enter');

    let offset = logScreen.contents.pageStarts[logScreen.contents.page] ?? 0;

    try {
      await setViewport(harness, 292, 524);
      await vitest.waitFor(
        () => {
          expect(getBox(harness, logScreen.contents.panel).width).toBe(138);
        },
        {timeout: 10_000},
      );

      let {page, pageStarts, statusText} = logScreen.contents;

      expect(pageStarts[page]).toBeLessThanOrEqual(offset);
      expect(offset).toBeLessThan(pageStarts[page + 1] ?? Infinity);
      expect(getTitle().length).toBeLessThanOrEqual(19);
      expect(getBox(harness, statusText)).toMatchObject({left: 4, top: 24});
    } finally {
      await setViewport(harness, 960, 540);
    }
  });

  test('a resize while the menu is open keeps the menu above', async () => {
    let {menuButton, panel} = logScreen.contents;

    menuButton.activate();

    let menu = getMenu();

    try {
      await setViewport(harness, 292, 524);
      await vitest.waitFor(
        () => {
          expect(getBox(harness, panel).width).toBe(138);
        },
        {timeout: 10_000},
      );

      expect(logScreen.ui.topOverlay).toBe(menu);
    } finally {
      await setViewport(harness, 960, 540);
    }

    menu.close();
    await waitForNoMenu();
  });

  test("Menu and Escape open the night's menu above the window, and Escape closes it", async () => {
    let {contents, ui} = logScreen;

    contents.menuButton.activate();

    expect(contents.menuModal).not.toBeNull();
    expect(ui.topOverlay).toBe(contents.menuModal);

    await press('Escape');
    await waitForNoMenu();
    await press('Escape');

    let menu = getMenu();

    expect(ui.topOverlay).toBe(menu);

    menu.close();
    await waitForNoMenu();
  });

  test('Quit to menu shows the main menu and plays its music', async () => {
    let {mainMenuScreen} = harness;

    await press('Escape');
    logScreen.ui.focus(getMenuButton(getMenu(), 'Quit to menu'));
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(logScreen.contents.menuModal).toBeNull();
    // Once at the boot and once now, by the main menu: the log screen starts no music of its own.
    expect(playMusic).toHaveBeenCalledTimes(2);
  });

  test('an empty log is one empty page with both buttons disabled, and Tab reaches Menu', async () => {
    let {game, mainMenuScreen} = harness;

    logScreen.contents.showLog(createNight({place: FIXED_BAR, minutes: 1920, money: 0}));
    await game.showScreen(logScreen);

    let {back, next} = logScreen.contents;

    expect(getTitle()).toBe('The night  1 of 1');
    expect(back.isDisabled).toBe(true);
    expect(next.isDisabled).toBe(true);
    expect(readText(getLeaves().regular)).toBe('');

    logScreen.ui.focusNext();

    expect(describeFocus(logScreen.ui.focused)).toBe('Menu');

    await game.showScreen(mainMenuScreen);
  });
});
