import * as pixi from 'pixi.js';
import {Container, Text} from 'tellurion';

import {assets} from '../core/assets.js';
import {game} from '../core/game.js';
import {LINE_HEIGHT} from '../core/getSceneArea.js';
import {palette} from '../core/palette.js';

// Sizes in art pixels: the line of the title, the gap under it and the rule.
const TITLE_GAP = 2;
const RULE_HEIGHT = 1;

/**
 * A window's title in rose and the rule under it, as one child for a panel. The block is `width`
 * wide and 15 high: the title's line of 12, a gap of 2 and the rule of 1.
 */
export function createWindowTitle(text: string, width: number): Container {
  return new Container({
    children: [
      new Text({
        text,
        theme: game.theme,
        fill: palette.rose,
        layout: {width, height: LINE_HEIGHT},
      }),
      // The frame is 1 × 1; without objectFit: 'fill' the layout would not stretch it.
      new pixi.Sprite({
        texture: assets.spriteset('ui').texture('rule'),
        layout: {width, height: RULE_HEIGHT, objectFit: 'fill'},
      }),
    ],
    layout: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: TITLE_GAP,
      width,
      height: LINE_HEIGHT + TITLE_GAP + RULE_HEIGHT,
    },
  });
}
