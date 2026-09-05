import * as pixi from 'pixi.js';

import monogramFnt from '../public/monogram.fnt?raw';

/**
 * Installs the real monogram metrics from the shipped .fnt under the name the
 * game's text styles resolve. Bounds and measurement math are GPU-free
 * (BitmapText.updateBounds only calls BitmapFontManager.measureText), so a
 * stub page texture is enough; nothing is drawn.
 */
export function installMonogram() {
  let xml = monogramFnt;
  let attribute = (tag: string, name: string) =>
    Number(new RegExp(`<${tag}[^>]*\\s${name}="(-?\\d+)"`).exec(xml)?.[1]);
  let lineHeight = attribute('common', 'lineHeight');
  let data: pixi.BitmapFontData = {
    chars: {},
    pages: [{id: 0, file: 'monogram_0.png'}],
    lineHeight,
    fontSize: attribute('info', 'size'),
    fontFamily: 'monogram',
    distanceField: {type: 'none', range: 0},
    baseLineOffset: lineHeight - attribute('common', 'base'),
  };

  for (let [, attributes = ''] of xml.matchAll(/<char ([^>]*)\/>/g)) {
    let get = (name: string) => Number(new RegExp(`\\s?${name}="(-?\\d+)"`).exec(attributes)?.[1]);
    let id = get('id');

    data.chars[String.fromCodePoint(id)] = {
      id,
      letter: String.fromCodePoint(id),
      page: get('page'),
      x: get('x'),
      y: get('y'),
      width: get('width'),
      height: get('height'),
      xOffset: get('xoffset'),
      yOffset: get('yoffset'),
      xAdvance: get('xadvance'),
      kerning: {},
    };
  }

  let source = new pixi.TextureSource({width: 256, height: 256});

  pixi.Cache.set(
    'monogram-bitmap',
    new pixi.BitmapFont({data, textures: [new pixi.Texture({source})]}, 'monogram.fnt'),
  );
}
