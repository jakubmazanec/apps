import * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {GameAssets} from '../source/engine/app/GameAssets.js';
import {GameTheme} from '../source/engine/app/GameTheme.js';
import {Spriteset} from '../source/engine/graphics/Spriteset.js';
import {type UiThemeDescription} from '../source/engine/ui/UiTheme.js';

// Every frame the description below names. A stand-in object per frame is
// enough — nothing here renders.
const UI_FRAMES = [
  'banner',
  'button-normal',
  'button-hovered',
  'button-active',
  'button-disabled',
  'toggle-unchecked',
  'toggle-checked',
  'toggle-hovered',
  'toggle-hovered-checked',
  'toggle-disabled',
  'toggle-disabled-checked',
  'text-input-normal',
  'text-input-hovered',
  'text-input-disabled',
  'slider-track',
  'slider-track-hovered',
  'slider-track-disabled',
  'slider-fill',
  'focus-ring',
];
const uiSpriteset = new Spriteset({
  textures: Object.fromEntries(
    UI_FRAMES.map((frameName) => [frameName, {frame: frameName}]),
  ) as never,
  animations: {},
});
const description: UiThemeDescription = {
  button: {
    normal: ['ui', 'button-normal'],
    hovered: ['ui', 'button-hovered'],
    active: ['ui', 'button-active'],
    disabled: ['ui', 'button-disabled'],
    layout: {padding: 2},
    pressOffset: 1,
  },
  textInput: {
    normal: ['ui', 'text-input-normal'],
    hovered: ['ui', 'text-input-hovered'],
    disabled: ['ui', 'text-input-disabled'],
  },
  slider: {
    track: ['ui', 'slider-track'],
    fill: ['ui', 'slider-fill'],
    hovered: ['ui', 'slider-track-hovered'],
    disabled: ['ui', 'slider-track-disabled'],
  },
  toggle: {
    unchecked: ['ui', 'toggle-unchecked'],
    checked: ['ui', 'toggle-checked'],
    hovered: ['ui', 'toggle-hovered'],
    hoveredChecked: ['ui', 'toggle-hovered-checked'],
    disabled: ['ui', 'toggle-disabled'],
    disabledChecked: ['ui', 'toggle-disabled-checked'],
  },
  panel: {background: ['ui', 'banner']},
  focusRing: {texture: ['ui', 'focus-ring'], padding: 2},
  text: {
    label: {fontFamily: 'monogram-outline', fontSize: 12, fill: 0xffffff},
    body: {fontFamily: 'monogram', fontSize: 12, fill: 0xffffff},
  },
};

function createAssets() {
  pixi.Assets.cache.set('ui', uiSpriteset);

  return new GameAssets({bundles: [{name: 'default'}]});
}

describe(GameTheme, () => {
  test('resolved throws before resolve is called', () => {
    expect(() => new GameTheme(description).resolved).toThrow("Theme isn't resolved yet!");
  });

  test('resolve maps texture references to spriteset textures', () => {
    let theme = new GameTheme(description).resolve(createAssets());

    expect(theme.resolved.button.normal).toBe(uiSpriteset.textures['button-normal']);
    expect(theme.resolved.focusRing.texture).toBe(uiSpriteset.textures['focus-ring']);
  });

  test('resolve passes non-reference values through unchanged', () => {
    let theme = new GameTheme(description).resolve(createAssets());

    expect(theme.resolved.focusRing.padding).toBe(2);
    expect(theme.resolved.text.body).toBe(description.text.body);
    expect(theme.resolved.button.layout).toBe(description.button.layout);
    expect(theme.resolved.button.pressOffset).toBe(1);
  });

  test('resolve throws when called twice', () => {
    let theme = new GameTheme(description).resolve(createAssets());

    expect(() => theme.resolve(createAssets())).toThrow('Theme is already resolved!');
  });
});
