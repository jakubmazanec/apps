import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, describe, expect, test, vitest} from 'vitest';

import {type createBackground} from '../source/engine/ui/createBackground.js';
import {Panel} from '../source/engine/ui/Panel.js';
import {createTestTheme} from './createTestTheme.js';

let layoutSystem: LayoutSystem;

vitest.mock(import('../source/engine/ui/createBackground.js'), () => ({
  createBackground: vitest.fn<typeof createBackground>((texture) => {
    let container = new pixi.Container();

    container.label = texture.label!;

    return container;
  }),
}));

describe('Panel children', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('keeps added children in a public children array', () => {
    let first = {view: new pixi.Container()};
    let second = {view: new pixi.Container()};
    let panel = new Panel({children: [first]});

    panel.addChild(second);

    expect(panel.children).toEqual([first, second]);

    panel.removeChild(first);

    expect(panel.children).toEqual([second]);
  });

  test('destroy() cascades to child components', () => {
    let child = {view: new pixi.Container(), destroy: vitest.fn<() => void>()};
    let panel = new Panel({children: [child]});

    panel.destroy();

    expect(child.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('Panel theme', () => {
  beforeAll(async () => {
    layoutSystem = new LayoutSystem();

    await layoutSystem.init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('takes its background from the theme', () => {
    let panel = new Panel({theme: createTestTheme()});

    expect((panel.view.background as pixi.Container).label).toBe('banner');
  });

  test('an explicit background wins over the theme', () => {
    let background = new pixi.Container();
    let panel = new Panel({
      background,
      theme: createTestTheme(),
    });

    expect(panel.view.background).toBe(background);
  });
});
