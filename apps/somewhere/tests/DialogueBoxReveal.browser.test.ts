// Importing LayoutSystem also registers @pixi/layout's container mixins.
import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {afterEach, beforeAll, describe, expect, test, vitest} from 'vitest';

import {DialogueBox} from '../source/engine/dialogue/DialogueBox.js';
import {createTestTheme} from './createTestTheme.js';
import {installMonogram} from './installMonogram.js';

// The shipping metrics, verbatim from source/game/dialogueBoxSystem.ts.
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
// A Pixel-class phone at pixelScale 8: ~135x300 art px, below collapseWidth,
// so the speaker header shares the text column with the page.
const PHONE_WIDTH = 135;
const PHONE_HEIGHT = 300;
const FRAME_MS = 1000 / 60;
const REVEAL_SPEED = 40; // Dialogue's DEFAULT_REVEAL_SPEED, characters per second
// dialogueRegistry's `greeting` node: the page wraps onto two lines in the
// phone's text column and the choices arrive the frame the page completes.
const GREETING = {
  speaker: 'Mira',
  page: 'Welcome to Somewhere.',
  choices: ['Sure, show me around.', 'Maybe later.'],
};

type Snapshot = {
  barHeight: number;
  barY: number;
  positions: Map<string, string>;
};

function createBox() {
  // No `measure` injected: wrapping measures the installed font the way the
  // game does.
  return new DialogueBox({
    theme: createTestTheme(),
    font: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
    metrics: BOX_METRICS,
    markerTexture: pixi.Texture.WHITE,
    onAdvanceTap: () => {},
    onChooseTap: () => {},
    onChoiceHover: () => {},
  });
}

async function createStage(box: DialogueBox) {
  let layoutSystem = new LayoutSystem();

  // Production defaults: autoUpdate on, leaf sizes re-measured on a 100 ms throttle.
  await layoutSystem.init();

  // Mirrors Game.view.layout: a fixed-size layout root in art px.
  let root = new pixi.Container();

  root.layout = {width: PHONE_WIDTH, height: PHONE_HEIGHT, transformOrigin: 0};
  root.addChild(box.view);

  // The renderer's prerender hook, then the frame's wall-clock time.
  let runFrame = () => {
    layoutSystem.update(root);
    vitest.advanceTimersByTime(FRAME_MS);
  };

  return {runFrame};
}

/**
 * Where every glyph block sits after this frame's layout, keyed by role:
 * the speaker header, the page content, or a choice label by its order.
 * Roles rather than sprite identity, so a rebuild that swaps the sprites
 * still counts as movement when the replacement lands elsewhere.
 */
function snapshot(box: DialogueBox, speaker: string): Snapshot {
  let bar = box.view.children[0]?.layout?.computedLayout;

  if (bar === undefined) {
    throw new Error('Expected the bar to be laid out!');
  }

  let positions = new Map<string, string>();
  let choiceIndex = 0;
  let walk = (node: pixi.Container) => {
    if (node instanceof pixi.BitmapText) {
      let role = 'content';

      if (node.text === speaker) {
        role = 'header';
      } else if (node.text.startsWith('▶ ') || node.text.startsWith('  ')) {
        role = `choice ${choiceIndex}`;
        choiceIndex += 1;
      }

      let {x, y} = node.getGlobalPosition();

      positions.set(role, `${x},${y}`);
    }

    for (let child of node.children) {
      walk(child);
    }
  };

  walk(box.view);

  return {barHeight: bar.height, barY: box.view.y, positions};
}

/** Every role that was seen at more than one position across the snapshots. */
function findMovement(snapshots: Snapshot[]): string[] {
  let seen = new Map<string, Set<string>>();

  for (let entry of snapshots) {
    for (let [role, position] of entry.positions) {
      let set = seen.get(role) ?? new Set<string>();

      set.add(position);
      seen.set(role, set);
    }
  }

  return [...seen.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([role, set]) => `${role}: ${[...set].join(' -> ')}`);
}

describe('DialogueBox layout stability (real font, real layout system)', () => {
  beforeAll(() => {
    installMonogram();
  });

  afterEach(() => {
    vitest.useRealTimers();
  });

  test('glyph blocks never move while a page reveals', async () => {
    vitest.useFakeTimers();

    let box = createBox();
    let {runFrame} = await createStage(box);

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);

    // Steady state before the node shows: the measurement throttle is mid-window.
    for (let frame = 0; frame < 30; frame++) {
      runFrame();
    }

    let page = 'Welcome to Somewhere. Mind the well on your way past the old chapel gate.';

    box.showNode({speaker: 'Mira', page});

    let snapshots: Snapshot[] = [];

    for (let frame = 0; frame < 120; frame++) {
      box.setRevealed(Math.min(page.length, Math.floor((frame * REVEAL_SPEED * FRAME_MS) / 1000)));
      runFrame();
      snapshots.push(snapshot(box, 'Mira'));
    }

    expect(findMovement(snapshots)).toEqual([]);
  });

  test('a node with choices is sized for them at showNode, so their arrival moves nothing', async () => {
    vitest.useFakeTimers();

    let box = createBox();
    let {runFrame} = await createStage(box);

    box.resize(PHONE_WIDTH, PHONE_HEIGHT);

    for (let frame = 0; frame < 30; frame++) {
      runFrame();
    }

    box.showNode(GREETING);

    let snapshots: Snapshot[] = [];
    let revealed = 0;
    let frame = 0;

    // The reveal, frame by frame, the way dialogueBoxSystem drives it.
    while (revealed < GREETING.page.length) {
      revealed = Math.min(
        GREETING.page.length,
        Math.floor((frame * REVEAL_SPEED * FRAME_MS) / 1000),
      );
      box.setRevealed(revealed);
      runFrame();
      snapshots.push(snapshot(box, GREETING.speaker));
      frame += 1;
    }

    // The runner flips to `choosing` the frame the page completes, and the
    // system builds the choices on its next update: no layout tick in between.
    box.setChoices(GREETING.choices, 0);

    // Long enough for the measurement throttle to fire more than once after
    // the buttons exist.
    for (let after = 0; after < 30; after++) {
      runFrame();
      snapshots.push(snapshot(box, GREETING.speaker));
    }

    let barHeights = new Set(snapshots.map((entry) => entry.barHeight));
    let barYs = new Set(snapshots.map((entry) => entry.barY));

    // The bar grew for its choice column before the first character showed,
    // not when the buttons appeared.
    expect([...barHeights]).toHaveLength(1);
    expect([...barHeights][0]).toBeGreaterThan(BOX_METRICS.height);
    expect([...barYs]).toHaveLength(1);
    expect(findMovement(snapshots)).toEqual([]);
    expect(snapshots.at(-1)?.positions.has('choice 1')).toBe(true);
  });
});
