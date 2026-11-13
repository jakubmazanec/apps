import * as pixi from 'pixi.js';
import {type Text} from 'tellurion';

// Text has no getter for its string, so the tests read the BitmapText inside.
// This file imports no game module and no stylesheet, so any browser test may
// import it at its top, the main menu's too.
export function readText(text: Text): string {
  let [content] = text.view.children;

  if (!(content instanceof pixi.BitmapText)) {
    throw new TypeError('The text has no BitmapText!');
  }

  return content.text;
}
