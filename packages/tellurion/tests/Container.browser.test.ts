import {LayoutSystem} from '@pixi/layout';
import * as pixi from 'pixi.js';
import {beforeAll, describe, expect, test, vitest} from 'vitest';

import {Container} from '../source/ui/Container.js';

describe('Container children', () => {
  // Container imports @pixi/layout, which installs the layout mixin on every pixi Container, so its
  // view builds a yoga node; with no renderer here to init the layout system, the suite loads yoga
  // itself.
  beforeAll(async () => {
    await new LayoutSystem().init({
      layout: {autoUpdate: false, enableDebug: false, throttle: 0, debugModificationCount: 50},
    });
  });

  test('keeps added children in a public children array', () => {
    let first = {view: new pixi.Container()};
    let second = {view: new pixi.Container()};
    let container = new Container({children: [first]});

    container.addChild(second);

    expect(container.children).toEqual([first, second]);

    container.removeChild(first);

    expect(container.children).toEqual([second]);
  });

  test('destroy() cascades to child components', () => {
    let child = {view: new pixi.Container(), destroy: vitest.fn<() => void>()};
    let container = new Container({children: [child]});

    container.destroy();

    expect(child.destroy).toHaveBeenCalledTimes(1);
  });

  test('a second destroy() leaves child components alone', () => {
    let child = {view: new pixi.Container(), destroy: vitest.fn<() => void>()};
    let container = new Container({children: [child]});

    container.destroy();
    container.destroy();

    expect(child.destroy).toHaveBeenCalledTimes(1);
  });

  test('destroy() leaves a child component removed with removeChild() alive', () => {
    let removed = {view: new pixi.Container(), destroy: vitest.fn<() => void>()};
    let kept = {view: new pixi.Container(), destroy: vitest.fn<() => void>()};
    let container = new Container({children: [removed, kept]});

    container.removeChild(removed);
    container.destroy();

    expect(removed.destroy).not.toHaveBeenCalled();
    expect(kept.destroy).toHaveBeenCalledTimes(1);
  });
});
