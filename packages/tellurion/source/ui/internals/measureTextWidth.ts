import * as pixi from 'pixi.js';

/** Returns the text width. */
export function measureTextWidth(text: string, style: pixi.TextStyle): number {
  let {width, scale} = pixi.BitmapFontManager.measureText(text, style, false);

  return width * scale;
}
