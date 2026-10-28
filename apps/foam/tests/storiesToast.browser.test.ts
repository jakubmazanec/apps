import {type Modal} from 'tellurion';
import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {type collection as collectionValue} from '../source/game/core/stories.js';
import {type StoryWindow} from '../source/game/screens/storyWindow.js';
import {type Toast as ToastClass} from '../source/game/screens/toast.js';
import {getStoriesParts} from './listParts.js';
import {
  bootGame,
  closeStory,
  describeEntry,
  describeFocus,
  endStory,
  getBox,
  getButtonLabel,
  getMenuButton,
  getStoriesWindow,
  getToastParts,
  getWindowButton,
  getWindowParts,
  type Harness,
  nextFrame,
  openSpot,
  press,
  setViewport,
  startNewGame,
  tap,
  useFixedWorld,
  waitForNoStoriesWindow,
  waitForNoStoryWindow,
  waitForToast,
} from './nightScreenHelpers.js';
import {readText} from './readText.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check the toast, not what the picture
// draws, so the main menu, which shows the bar, gets the pipeline's proof, a
// shader of a few lines, as the fixed world's places do. The bar's GLSL has its
// text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 960 × 540 CSS pixels are 480 × 270 art pixels. The night starts in the fixed
// bar at 19:40, with no story found: the storage is cleared before the boot,
// which loads the collection. The frames of a headless browser are slow, and
// several times slower on a busy machine, so the tests get a long timeout.
// They follow each other in order: each starts where the one before it ended.
describe('the toast of a story', {timeout: 180_000}, () => {
  let collection: typeof collectionValue;
  let harness: Harness;
  let restore: () => void;
  let storyWindow: StoryWindow;
  let toast: ToastClass;
  let Toast: typeof ToastClass;

  function getMenu(): Modal {
    let {menuModal} = harness.nightScreen.contents;

    if (menuModal === null) {
      throw new Error('The menu is not open!');
    }

    return menuModal;
  }

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

  beforeAll(async () => {
    localStorage.clear();
    // The fixed world goes in before the boot: the night screen builds its travel window when it
    // is attached, from the world nightStart holds then.
    restore = useFixedWorld();
    harness = await bootGame(960, 540);
    ({collection} = await import('../source/game/core/stories.js'));
    ({Toast} = await import('../source/game/screens/toast.js'));
  }, 60_000);

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('before any find the Stories window reads 0 found and None yet', async () => {
    let {nightScreen} = harness;
    let {ui} = nightScreen;

    await startNewGame(harness);
    await closeStory(harness);
    await press('Escape');
    ui.focus(getMenuButton(getMenu(), 'Stories'));
    await press('Enter');

    let {back, next, regularLeaf, title} = getStoriesParts(getStoriesWindow(nightScreen));

    expect(readText(title)).toBe('Stories  0 found');
    expect(readText(regularLeaf)).toBe('None yet');
    expect(back).toBeNull();
    expect(next).toBeNull();
    expect(ui.focused).toBeNull();

    await press('Escape');
    await waitForNoStoriesWindow(nightScreen);
    await press('Escape');
    await waitForNoMenu();
  });

  test("the toast shows the title above the window, and the find waits for the window's end to reach the store", async () => {
    let {nightScreen} = harness;

    storyWindow = await openSpot(harness, 'A patron');
    // Enter finishes the text, and Enter on the second choice ignores him.
    await press('Enter');
    nightScreen.ui.focus(getWindowButton(storyWindow, 1));
    await press('Enter');
    toast = await waitForToast(harness);

    let {text, title} = getToastParts(toast);
    let {night} = nightScreen.contents;

    expect(readText(title)).toBe('A story');
    expect(readText(text)).toBe('The shrug');
    expect(nightScreen.ui.children.at(-1)).toBe(toast);
    expect(night.stories).toEqual([
      {title: 'The shrug', minutes: 1180},
      {title: 'The glass', minutes: 1180},
    ]);
    expect(collection.titles).toEqual(['The shrug', 'The glass']);
    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({titles: []});
    expect(night.log.slice(-4).map(describeEntry)).toEqual([
      ['choice', 1180, 'Ignore him'],
      ['story', 1180, 'The shrug'],
      ['story', 1180, 'The glass'],
      ['text', 1180, 'A patron'],
    ]);
  });

  test('a tap on the toast reaches the window under it and continues the text', async () => {
    let {dialogue} = storyWindow;

    expect(dialogue.phase).toBe('revealing');

    await tap(harness, getBox(harness, getToastParts(toast).panel));

    // The page waits at its first stop: the text runs on to a second page.
    expect(dialogue.phase).toBe('idle');
    expect(dialogue.revealedCount).toBeGreaterThan(0);
    expect(dialogue.revealedCount).toBeLessThan(dialogue.pageText.length);
  });

  test('the toast goes after its time, and the second find follows it', async () => {
    let {contents} = harness.nightScreen;

    await vitest.waitFor(
      () => {
        let {toast: shown} = contents;

        expect(shown === null ? null : readText(getToastParts(shown).text)).toBe('The glass');
      },
      {timeout: 10_000},
    );
    await vitest.waitFor(
      () => {
        expect(contents.toast).toBeNull();
        expect(contents.toastQueue).toEqual([]);
      },
      {timeout: 10_000},
    );
    await endStory(storyWindow);
    await waitForNoStoryWindow(harness);

    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({
      titles: ['The shrug', 'The glass'],
    });
  });

  test('a toast on the narrowest width is two lines and 59 tall', async () => {
    let {nightScreen} = harness;
    let narrowToast = new Toast({
      scheduler: nightScreen.scheduler,
      heading: 'A story',
      title: 'The guitarist who plays for one',
      textWidth: 114,
      onDone: () => {},
    });

    nightScreen.ui.addChild(narrowToast);
    narrowToast.show();
    await nextFrame();
    await nextFrame();

    let {panel, text} = getToastParts(narrowToast);
    let box = getBox(harness, panel);

    // As wide as its longest line plus the paddings: "The guitarist who" is 17 glyphs, 102 + 24.
    expect(box.width).toBe(126);
    expect(box.height).toBe(59);
    // The strip stands the bottom row above the edge, one margin above the Phone button.
    expect(box.top + box.height).toBe(270 - 24);
    expect(readText(text).split('\n')).toHaveLength(2);

    nightScreen.ui.removeChild(narrowToast);
    narrowToast.destroy();
  });

  test("the menu's Stories window lists the night's finds, and Escape returns to the menu with Stories focused", async () => {
    let {nightScreen} = harness;
    let {ui} = nightScreen;

    await press('Escape');

    let menu = getMenu();

    ui.focus(getMenuButton(menu, 'Stories'));
    await press('Enter');

    let storiesWindow = getStoriesWindow(nightScreen);
    let {regularLeaf, title} = getStoriesParts(storiesWindow);

    expect(ui.topOverlay).toBe(storiesWindow.modal);
    expect(readText(title)).toBe('Stories  2 found');
    expect(readText(regularLeaf)).toBe('19:40  The shrug\n19:40  The glass');

    await press('Escape');
    await waitForNoStoriesWindow(nightScreen);

    expect(ui.topOverlay).toBe(menu);
    expect(describeFocus(ui.focused)).toBe('Stories');
  });

  test('a resize keeps the Stories window above the menu and fits the narrowest screen', async () => {
    let {nightScreen} = harness;

    // Stories has the focus.
    await press('Enter');

    let storiesWindow = getStoriesWindow(nightScreen);
    let {panel} = getStoriesParts(storiesWindow);

    try {
      await setViewport(harness, 292, 524);
      await vitest.waitFor(
        () => {
          expect(getBox(harness, panel).width).toBe(138);
        },
        {timeout: 10_000},
      );

      // The resize built the title block again, so its title is read anew.
      expect(nightScreen.ui.topOverlay).toBe(storiesWindow.modal);
      expect(readText(getStoriesParts(storiesWindow).title).length).toBeLessThanOrEqual(19);
    } finally {
      await setViewport(harness, 960, 540);
    }

    await press('Escape');
    await waitForNoStoriesWindow(nightScreen);
  });

  test('Quit to menu destroys the Stories window and the menu, and the store keeps the finds', async () => {
    let {mainMenuScreen, nightScreen} = harness;
    let {contents} = nightScreen;

    // Stories has the focus.
    await press('Enter');

    let storiesWindow = getStoriesWindow(nightScreen);

    getMenuButton(getMenu(), 'Quit to menu').activate();
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(storiesWindow.modal.view.destroyed).toBe(true);
    expect(contents.storiesWindow).toBeNull();
    expect(contents.menuModal).toBeNull();
    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({
      titles: ['The shrug', 'The glass'],
    });
  });

  test('a second New Game gives no toast for an achieved story, and the hidden choice is gone', async () => {
    let {nightScreen} = harness;
    let {contents, ui} = nightScreen;

    await startNewGame(harness);
    await closeStory(harness);
    storyWindow = await openSpot(harness, 'A patron');
    await press('Enter');

    expect(getWindowParts(storyWindow).buttons.map(getButtonLabel)).toEqual(['Talk to him']);
    expect(contents.night.stories).toEqual([]);

    ui.focus(getWindowButton(storyWindow, 0));
    await press('Enter');
    await nextFrame();
    await nextFrame();
    await nextFrame();

    expect(contents.toast).toBeNull();
    expect(contents.toastQueue).toEqual([]);
    expect(contents.night.log.some((entry) => entry.kind === 'story')).toBe(false);
    expect(collection.titles).toEqual(['The shrug', 'The glass']);

    await press('Escape');
    ui.focus(getMenuButton(getMenu(), 'Stories'));
    await press('Enter');

    let {regularLeaf, title} = getStoriesParts(getStoriesWindow(nightScreen));

    expect(readText(title)).toBe('Stories  0 found');
    expect(readText(regularLeaf)).toBe('None yet');

    await press('Escape');
    await waitForNoStoriesWindow(nightScreen);
    await press('Escape');
    await waitForNoMenu();
  });

  // The plan's Review Focus: the toast goes with the screen, and the finds are in the store. Game
  // resizes the next screen before its onShow, so onHide must clear the slot, or the next night's
  // layOut resizes a destroyed toast. The fixed world has no third find: the toast is built here.
  test('Quit to menu with a toast showing destroys it and keeps the finds', async () => {
    let {mainMenuScreen, nightScreen} = harness;
    let {contents, ui} = nightScreen;
    let onDone = vitest.fn<() => void>();
    let shownToast = new Toast({
      scheduler: nightScreen.scheduler,
      heading: 'A story',
      title: 'The shrug',
      textWidth: 114,
      onDone,
    });

    ui.addChild(shownToast);
    contents.toast = shownToast;
    contents.toastQueue.push({heading: 'A story', title: 'The glass'});
    shownToast.show();
    await nextFrame();
    await nextFrame();
    await press('Escape');
    ui.focus(getMenuButton(getMenu(), 'Quit to menu'));
    await press('Enter');
    await vitest.waitFor(
      () => {
        expect(mainMenuScreen.state).toBe('shown');
      },
      {timeout: 10_000},
    );

    expect(contents.toast).toBeNull();
    expect(shownToast.view.destroyed).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
    expect(contents.toastQueue).toEqual([]);
    expect(ui.children).not.toContain(shownToast);
    expect(JSON.parse(localStorage.getItem('foam:stories') ?? '')).toEqual({
      titles: ['The shrug', 'The glass'],
    });

    await startNewGame(harness);

    expect(contents.toast).toBeNull();
    expect(contents.toastQueue).toEqual([]);
  });
});
