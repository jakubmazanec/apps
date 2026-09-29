import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {afterEach, beforeAll, describe, expect, test} from 'vitest';

import {Modal} from '../source/engine/ui/Modal.js';
import {UiRoot} from '../source/engine/ui/UiRoot.js';
import {createTestTheme} from './createTestTheme.js';

// UiRoot registers its pointertap listeners via the federated event system
// (addEventListener), which pixi only installs on Container through this side
// effect. The hit test below needs the same mixin (isInteractive).
import 'pixi.js/events';

// The art-px screen of the verification probes.
const SCREEN_WIDTH = 240;
const SCREEN_HEIGHT = 135;
let layoutSystem: LayoutSystem;
let stages: pixi.Container[] = [];
let roots: UiRoot[] = [];

// Stands in for game.view: the layout root with a size in numbers, which the
// percentages of the UiRoot view resolve against.
function createStage(uiLayout: Record<string, unknown> | null = {}) {
  let stage = new pixi.Container();
  let root = new UiRoot({theme: createTestTheme()});

  stage.layout = {width: SCREEN_WIDTH, height: SCREEN_HEIGHT};

  if (uiLayout !== null) {
    root.view.layout = {width: '100%', height: '100%', ...uiLayout};
  }

  stage.addChild(root.view);
  stages.push(stage);
  roots.push(root);

  return {root, stage};
}

function layOut(stage: pixi.Container) {
  // prerender re-measures the leaf intrinsic sizes, which is what the renderer
  // does each frame; update() then runs yoga, as the first rendered frame does.
  layoutSystem.prerender({container: stage});
  layoutSystem.update(stage);
}

function getComputedLayout(container: pixi.Container) {
  let {layout} = container;

  if (!layout) {
    throw new Error('Expected a container with a computed layout!');
  }

  return layout.computedLayout;
}

function getScrim(modal: Modal): pixi.Graphics {
  let scrim = modal.view.children[0];

  if (!(scrim instanceof pixi.Graphics)) {
    throw new TypeError('Expected the scrim to be the first view child!');
  }

  return scrim;
}

// An interactive stand-in for a HUD widget behind the modal.
function createHudButton() {
  let view = new pixi.Container();

  view.eventMode = 'static';
  view.hitArea = new pixi.Rectangle(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  return {view};
}

describe('Modal layout', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  afterEach(() => {
    for (let root of roots) {
      root.destroy();
    }

    for (let stage of stages) {
      stage.destroy({children: true});
    }

    roots = [];
    stages = [];
  });

  test('the modal fills the UiRoot view', () => {
    let {root, stage} = createStage();
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({
      left: 0,
      top: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
  });

  test('the modal fills the UiRoot view when that view has padding', () => {
    // worldScreen pads its HUD by 4; the modal must still reach the screen edge.
    let {root, stage} = createStage({padding: 4});
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({
      left: 0,
      top: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
  });

  test('the modal stays out of the flow of the UiRoot view', () => {
    let {root, stage} = createStage({justifyContent: 'center', alignItems: 'center'});
    let banner = new pixi.Container();

    banner.layout = {width: 40, height: 20};
    root.addChild(banner);
    layOut(stage);

    let before = {...getComputedLayout(banner)};

    root.addOverlay(new Modal({}));
    layOut(stage);

    expect(getComputedLayout(banner)).toEqual(before);
  });

  test('the caller layout places the content inside the full-screen root', () => {
    let {root, stage} = createStage();
    let content = new pixi.Container();

    // Even width, odd height: both centered offsets are whole art px.
    content.layout = {width: 40, height: 21};

    let modal = new Modal({
      children: [content],
      layout: {justifyContent: 'center', alignItems: 'center'},
    });

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(content)).toMatchObject({
      left: (SCREEN_WIDTH - 40) / 2,
      top: (SCREEN_HEIGHT - 21) / 2,
      width: 40,
      height: 21,
    });
  });

  test('the modal follows a change of the root size on the next layout pass', () => {
    let {root, stage} = createStage();
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage);

    stage.layout = {width: 480, height: 270};
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({width: 480, height: 270});
    expect(getScrim(modal).getBounds()).toMatchObject({x: 0, y: 0, width: 480, height: 270});
  });

  test('the scrim covers the whole modal in the first rendered frame', () => {
    let {root, stage} = createStage({padding: 4});
    let modal = new Modal({});

    root.addOverlay(modal);
    layOut(stage); // one pass, as the first rendered frame runs

    expect(getScrim(modal).getBounds()).toMatchObject({
      x: 0,
      y: 0,
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT,
    });
  });

  test('a kept modal added again after a size change has the new size', () => {
    let {root, stage} = createStage();
    let modal = new Modal({isReusable: true});

    root.addOverlay(modal);
    layOut(stage);
    modal.close();

    stage.layout = {width: 480, height: 270};
    layOut(stage);

    root.addOverlay(modal);
    layOut(stage);

    expect(getComputedLayout(modal.view)).toMatchObject({width: 480, height: 270});
    expect(getScrim(modal).getBounds()).toMatchObject({x: 0, y: 0, width: 480, height: 270});

    modal.destroy();
  });

  test('a pointer press right after addOverlay, before any render, hits the scrim', () => {
    let {root, stage} = createStage();
    let hud = createHudButton();
    let boundary = new pixi.EventBoundary(stage);

    root.addChild(hud);

    expect(boundary.hitTest(200, 100)).toBe(hud.view);

    let modal = new Modal({});

    root.addOverlay(modal);

    // No layout pass and no render yet: the scrim has no size, so only its
    // hit area can stop the press from reaching the HUD.
    expect(boundary.hitTest(200, 100)).toBe(getScrim(modal));
    expect(boundary.hitTest(0, 0)).toBe(getScrim(modal));
  });

  test('the scrim releases the pointer when the modal is removed', () => {
    let {root, stage} = createStage();
    let hud = createHudButton();
    let boundary = new pixi.EventBoundary(stage);
    let modal = new Modal({});

    root.addChild(hud);
    root.addOverlay(modal);
    layOut(stage);
    modal.close();

    expect(boundary.hitTest(200, 100)).toBe(hud.view);
  });

  test('attach throws when the UiRoot view has no layout', () => {
    let {root} = createStage(null);
    let modal = new Modal({});

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('UI root has no layout, the modal is sized against it!');

    // UiRoot does not roll back a throwing attach: the overlay is a child and
    // holds the scope, and the modal never opened.
    expect(modal.state).toBe('closed');
    expect(root.topOverlay).toBe(modal);
  });

  test('destroy() still leaves the root after attach threw', () => {
    let {root} = createStage(null);
    let modal = new Modal({});

    expect(() => {
      root.addOverlay(modal);
    }).toThrow('UI root has no layout, the modal is sized against it!');

    modal.destroy();

    expect(root.children).not.toContain(modal);
    expect(root.topOverlay).toBeNull();
  });
});
