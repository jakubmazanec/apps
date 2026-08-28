// Importing LayoutSystem also registers @pixi/layout's container mixins.
import {LayoutSystem} from '@pixi/layout';
import {LayoutContainer} from '@pixi/layout/components';
import * as pixi from 'pixi.js';
import {beforeAll, describe, expect, test, vitest} from 'vitest';

import {Text} from '../source/engine/ui/Text.js';
import {createTestTheme} from './createTestTheme.js';
import {installMonogram} from './installMonogram.js';

describe('Text layout', () => {
  const PAGE = 'The old lighthouse keeper squints at\nthe horizon and says nothing.';

  beforeAll(() => {
    installMonogram();
  });

  test('a typewriter Text renders every frame unscaled and unmoved', async () => {
    vitest.useFakeTimers();

    let layoutSystem = new LayoutSystem();

    await layoutSystem.init();

    // Mirrors Game.view.layout: a fixed-size layout root in art px.
    let root = new pixi.Container();

    root.layout = {width: 320, height: 180, transformOrigin: 0};

    // Mirrors DialogueBox #buildPanels: a fixed column panel holding the content Text.
    let textPanel = new LayoutContainer({});

    textPanel.layout = {flexDirection: 'column', padding: 3, gap: 3, width: 240, height: 64};
    root.addChild(textPanel);

    let content = new Text({
      text: '',
      fontFamily: 'monogram',
      fontSize: 12,
      fill: 0xffffff,
      layout: true,
    });

    textPanel.addChild(content.view);

    let deformed: string[] = [];
    let positions = new Set<string>();

    // ~60 fps frames while the runner reveals 40 chars/s. Each frame: set the
    // text (the game system), run the layout system (pixi prerender), then read
    // the transform actually applied to the glyphs.
    for (let frame = 0; frame < 60; frame++) {
      content.setText(PAGE.slice(0, Math.floor((frame * 40 * 16.67) / 1000)));
      layoutSystem.update(root);
      content.view.updateLocalTransform();

      let {a: scaleX, d: scaleY, tx, ty} = content.view.localTransform;

      if (scaleX !== 1 || scaleY !== 1) {
        deformed.push(`frame ${frame}: scale ${scaleX.toFixed(3)}x${scaleY.toFixed(3)}`);
      }

      positions.add(`${tx},${ty}`);
      vitest.advanceTimersByTime(16.67);
    }

    // A single-size bitmap font has to render 1:1; any layout-applied scale
    // squashes the glyphs off the pixel grid.
    expect(deformed).toEqual([]);
    // And the text must stay pinned while it grows, not drift as the box catches up.
    expect([...positions]).toEqual(['3,3']);
  });

  test('a Text overflowing its panel is not squashed to fit', async () => {
    let layoutSystem = new LayoutSystem();

    await layoutSystem.init();

    let root = new pixi.Container();

    root.layout = {width: 320, height: 180, transformOrigin: 0};

    // The choices case: content plus a button column overflows the fixed box
    // height, and every layout child shrinks (@pixi/layout defaults flexShrink to 1).
    let textPanel = new LayoutContainer({});

    textPanel.layout = {flexDirection: 'column', padding: 3, gap: 3, width: 240, height: 20};
    root.addChild(textPanel);

    let content = new Text({
      text: 'One\nTwo\nThree\nFour',
      fontFamily: 'monogram',
      fontSize: 12,
      fill: 0xffffff,
      layout: true,
    });

    textPanel.addChild(content.view);
    layoutSystem.update(root);
    content.view.updateLocalTransform();

    let {a: scaleX, d: scaleY} = content.view.localTransform;

    expect([scaleX, scaleY]).toEqual([1, 1]);
  });
});

describe('Text measurement', () => {
  beforeAll(() => {
    installMonogram();
  });

  test('measures a substring exactly as wide as that substring renders', () => {
    let text = new Text({text: 'One Two', fontFamily: 'monogram', fontSize: 12});
    let prefix = new Text({text: 'One', fontFamily: 'monogram', fontSize: 12});

    // A caret sits at the right edge of the glyphs before it, so the measured
    // prefix has to match what those glyphs actually occupy.
    expect(text.measureWidth('One')).toBe(prefix.view.getLocalBounds().width);
  });

  // A block caret past the last character has no character to cover, so it takes
  // a space's advance; a zero there would collapse it to nothing.
  test('measures a lone space as its advance', () => {
    let text = new Text({text: '', fontFamily: 'monogram', fontSize: 12});

    expect(text.measureWidth(' ')).toBeGreaterThan(0);
  });

  test('counts a trailing space', () => {
    let text = new Text({text: '', fontFamily: 'monogram', fontSize: 12});

    // BitmapFontManager trims trailing whitespace by default, but a caret has to
    // advance when a space is typed.
    expect(text.measureWidth('a ')).toBeGreaterThan(text.measureWidth('a'));
  });
});

describe('Text theming', () => {
  beforeAll(() => {
    installMonogram();
  });

  test('takes the label style from the theme by default', () => {
    let text = new Text({text: 'Play', theme: createTestTheme()});

    expect(text.style.fontFamily).toBe('monogram-outline');
    expect(text.style.fontSize).toBe(12);
  });

  test('the body role selects the body style', () => {
    let text = new Text({text: 'Loading', theme: createTestTheme(), role: 'body'});

    expect(text.style.fontFamily).toBe('monogram');
  });

  test('an explicit font family wins over the theme', () => {
    let text = new Text({text: 'Play', theme: createTestTheme(), fontFamily: 'other'});

    expect(text.style.fontFamily).toBe('other');
  });
});
