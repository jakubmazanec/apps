import * as pixi from 'pixi.js';

// measureText returns the width in the font's own measurement units, which
// BitmapText scales by `scale` to reach the style's font size (see its
// updateBounds). trimEnd is off because it would drop a trailing space's
// advance, and a caret has to move when one is typed.
export function measureTextWidth(text: string, style: pixi.TextStyle): number {
  let {width, scale} = pixi.BitmapFontManager.measureText(text, style, false);

  return width * scale;
}
