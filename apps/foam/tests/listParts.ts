import {Button, Container, type Modal, Panel, Text} from 'tellurion';

import {readText} from './readText.js';

// A list window's modal holds one Panel. Its children are, in this order: the
// title block, a Container whose first child is the title Text; the text block,
// a Container of two Texts, the regular one and then the italic one; the paging
// row (only for a list of more than one page), a Container of Back and Next;
// and the bottom row, a Container of the actions and then Close. This file
// imports no game module and no stylesheet, so a browser test may import it at
// its top, the main menu's too.
export function getStoriesParts(window: {modal: Modal}): {
  actions: Button[];
  back: Button | null;
  close: Button;
  italicLeaf: Text;
  next: Button | null;
  panel: Panel;
  regularLeaf: Text;
  title: Text;
} {
  let [panel] = window.modal.children;

  if (!(panel instanceof Panel)) {
    throw new TypeError('The list window has no panel!');
  }

  let [titleBlock, textBlock, ...rows] = panel.children;
  let title = titleBlock instanceof Container ? titleBlock.children[0] : undefined;
  let [regularLeaf, italicLeaf] = textBlock instanceof Container ? textBlock.children : [];
  let pagingRow = rows.length > 1 ? rows[0] : undefined;
  let bottomRow = rows.at(-1);
  let [back, next] = pagingRow instanceof Container ? pagingRow.children : [];
  let buttons = (bottomRow instanceof Container ? bottomRow.children : []).filter(
    (child) => child instanceof Button,
  );
  let close = buttons.at(-1);

  if (
    !(title instanceof Text) ||
    !(regularLeaf instanceof Text) ||
    !(italicLeaf instanceof Text) ||
    close === undefined
  ) {
    throw new TypeError('The list window has no title, no text or no Close button!');
  }

  return {
    actions: buttons.slice(0, -1),
    back: back instanceof Button ? back : null,
    close,
    italicLeaf,
    next: next instanceof Button ? next : null,
    panel,
    regularLeaf,
    title,
  };
}

// A text block's two leaves as one string: the italic letter where the regular
// leaf has a space, so a text with italic headings reads as one. The offsets
// are UTF-16 units, as the leaves are split.
export function readLeaves(regularLeaf: Text, italicLeaf: Text): string {
  let italic = readText(italicLeaf);

  return readText(regularLeaf).replaceAll(' ', (space, offset: number) => italic[offset] ?? space);
}
