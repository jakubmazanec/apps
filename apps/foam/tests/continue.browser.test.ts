import {afterAll, beforeAll, describe, expect, test, vitest} from 'vitest';

import {type barPicture as barPictureValue} from '../source/game/content/pictures/barPicture.js';
import {FIXED_PAVEMENT, FIXED_SQUARE, FIXED_SQUARE_LOCATION} from './fixedWorld.js';
import {
  bootGame,
  chooseWayOut,
  closeStory,
  endStory,
  getWindowButton,
  type Harness,
  openSpot,
  pickDestination,
  press,
  startNewGame,
  useFixedWorld,
  waitForNoStoryWindow,
  waitForPlace,
  waitForSpeaker,
  waitForTravelWindow,
} from './nightScreenHelpers.js';

// Headless Chromium draws the bar in software, at about 90 ms a frame, which
// slows every frame of these tests. They check what the game keeps, not what
// the picture draws, so the main menu, which shows the bar, gets the
// pipeline's proof, a shader of a few lines, as the fixed world's places do.
// The bar's GLSL has its text as its type, so the stub's text is cast to it.
vitest.mock(import('../source/game/content/pictures/barPicture.js'), async () => {
  let {PROOF_PICTURE} = await import('./proofPicture.js');

  return {barPicture: PROOF_PICTURE as typeof barPictureValue};
});

// 960 × 540 CSS pixels are 480 × 270 art pixels. The night starts in the fixed
// bar at 19:40, with nothing kept: the storage is cleared before the boot,
// which loads the stores. The frames of a headless browser are slow, and
// several times slower on a busy machine, so the tests get a long timeout.
// They follow each other in order: each starts where the one before it ended.
describe('saving and continue', {timeout: 180_000}, () => {
  let harness: Harness;
  let restore: () => void;

  beforeAll(async () => {
    localStorage.clear();
    // The fixed world goes in before the boot: the night screen builds its travel window when it
    // is attached, from the world nightStart holds then.
    restore = useFixedWorld();
    harness = await bootGame(960, 540);
  }, 60_000);

  afterAll(() => {
    restore();
    harness.unmount();
    localStorage.clear();
  });

  test('the texts read are keyed by path, and each is printed once', async () => {
    let info = vitest.spyOn(console, 'info');

    try {
      let {textsRead} = await import('../source/game/core/textsRead.js');
      let {ui} = harness.nightScreen;

      await startNewGame(harness, 7);
      await closeStory(harness);

      // Enter finishes the text, Talk to him leads on, and Let him be ends the window.
      let storyWindow = await openSpot(harness, 'A patron');

      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 1));
      await press('Enter');
      await waitForNoStoryWindow(harness);
      // Go out moves the player to the pavement, through the door's next node.
      storyWindow = await openSpot(harness, 'The door');
      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 0));
      await press('Enter');
      await endStory(storyWindow);
      await waitForPlace(harness, FIXED_PAVEMENT);
      await closeStory(harness);
      // The bar is open at this hour: its node is the one the start's function names.
      storyWindow = await openSpot(harness, 'The bar');
      await press('Enter');
      ui.focus(getWindowButton(storyWindow, 1));
      await press('Enter');
      await waitForNoStoryWindow(harness);
      await chooseWayOut(harness, 'Walk');
      await pickDestination(harness, await waitForTravelWindow(harness), FIXED_SQUARE_LOCATION);
      await endStory(await waitForSpeaker(harness, 'On foot'));
      await waitForPlace(harness, FIXED_SQUARE);
      await closeStory(harness);

      let paths = [
        'testBar › description › start',
        'testBar › A patron › table',
        'testBar › A patron › talk',
        'testBar › The door › door',
        'testBar › The door › outside',
        'testPavement › description › start',
        'testPavement › The bar › open',
        'testPavement › The street › start',
        'journeys › walk › start',
        'testSquare › description › start',
      ];

      expect(textsRead.paths).toEqual(paths);
      expect(JSON.parse(localStorage.getItem('foam:textsRead') ?? '')).toEqual({paths});

      // A second night in the same bar reads its description again, and the path is not new.
      await harness.game.showScreen(harness.mainMenuScreen);
      await startNewGame(harness, 7);
      await closeStory(harness);

      expect(textsRead.paths).toEqual(paths);
      expect(
        info.mock.calls.filter(([message]) => message === 'Read: testBar › description › start'),
      ).toHaveLength(1);
    } finally {
      info.mockRestore();
    }
  });
});
