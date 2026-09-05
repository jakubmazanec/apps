import * as pixi from 'pixi.js';
import {describe, expect, test, vitest} from 'vitest';

import {Container} from '../source/engine/ui/Container.js';

describe('Container children', () => {
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
});
