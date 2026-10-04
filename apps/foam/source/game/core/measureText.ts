import * as pixi from 'pixi.js';

import {game} from './game.js';

// One style per role, made on first use: the theme exists only after
// Game.init, and wrapText measures once or twice per word.
const styles = new Map<'body' | 'label', pixi.TextStyle>();

// Returns the rendered width of a string in art pixels, in the theme's font for
// the role. It is the `measure` argument of every wrapText call.
export function measureText(text: string, role: 'body' | 'label' = 'body'): number {
  let style = styles.get(role);

  if (style === undefined) {
    let {fontFamily, fontSize} = game.theme.text[role];

    style = new pixi.TextStyle({fontFamily, fontSize});
    styles.set(role, style);
  }

  let measured = pixi.BitmapFontManager.measureText(text, style);

  return measured.width * measured.scale;
}
