import {Container, Text} from 'tellurion';

import {game} from '../core/game.js';
import {splitMarked} from '../core/markedText.js';

/**
 * A text in two leaves of the same size at the same place, one per font, regular and italic: every
 * letter advances by 6 in both, so a letter lands where it would in one text, and each leaf has
 * spaces where the other one draws. The story window and the log screen show their text in one.
 */
export class TextBlock extends Container {
  /** The text's leaf in the italic font; it has the regular leaf's size and place. */
  readonly #italicLeaf: Text;

  /** The text's leaf in the regular font. */
  readonly #regularLeaf: Text;

  constructor({width, height}: {width: number; height: number}) {
    // Out of the flow, so the two lie on each other at the block's top left corner.
    let leafLayout = {position: 'absolute', left: 0, top: 0, width, height} as const;
    let regularLeaf = new Text({text: '', theme: game.theme, role: 'body', layout: leafLayout});
    let italicLeaf = new Text({
      text: '',
      theme: game.theme,
      role: 'body',
      fontFamily: 'monogram-italic',
      layout: leafLayout,
    });

    super({children: [regularLeaf, italicLeaf], layout: {width, height}});
    this.#regularLeaf = regularLeaf;
    this.#italicLeaf = italicLeaf;
  }

  /**
   * Shows the piece of the marked text from `start` to `end`. The marks before `start` are counted,
   * so a piece that starts inside an italic passage starts in italic.
   */
  show(text: string, start: number, end: number): void {
    let {regular, italic} = splitMarked(text, start, end);

    this.#regularLeaf.setText(regular);
    this.#italicLeaf.setText(italic);
  }
}
