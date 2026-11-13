import {Button, type Scheduler, type UiRoot, wrapText} from 'tellurion';

import {game} from '../core/game.js';
import {BUTTON_HEIGHT} from '../core/getSceneArea.js';
import {MARK, stripMarks} from '../core/markedText.js';
import {measureText} from '../core/measureText.js';
import {type Ending} from '../core/night.js';
import {nights} from '../core/nights.js';
import {collection} from '../core/stories.js';
import {formatDate} from '../core/todaySeed.js';
import {ListWindow} from './listWindow.js';
import {createLabel} from './topRow.js';

export type CollectionWindowOptions = {
  ui: UiRoot;
  scheduler: Scheduler;

  /** Called when Reset is pressed, unless the window is closing. */
  onReset: () => void;

  /** Called once the window has closed. */
  onClosed: () => void;
};

const ENDING_WORDS: Readonly<Record<Ending, string>> = {
  leave: 'Left',
  stay: 'Stayed',
  stranded: 'Stranded',
};

// The stories in the order found and the nights newest first, each under its
// heading in italic, with a blank line between the lists. Every line is
// wrapped on its own, so a long one goes on under itself; the marks measure as
// nothing.
function formatCollection(textWidth: number): {title: string; text: string} {
  let lines = [
    `${MARK}Stories  ${collection.titles.length} found${MARK}`,
    ...(collection.titles.length > 0 ? collection.titles : ['None yet']),
    '',
    `${MARK}Nights  ${nights.past.length}${MARK}`,
    ...(nights.past.length > 0 ?
      [...nights.past]
        .reverse()
        .flatMap(({seed, date, ending, stories}) => [
          `${formatDate(date)}  Seed ${seed}${ending === null ? '' : `  ${ENDING_WORDS[ending]}`}`,
          ...stories.map((title) => `  ${title}`),
        ])
    : ['None yet']),
  ];

  return {
    title: 'Collection',
    text: lines
      .map((line) => wrapText(line, textWidth, (text) => measureText(stripMarks(text))))
      .join('\n'),
  };
}

/**
 * The stories found across all nights and the nights played, in a window over the main menu: a
 * title, the two lists, page by page with Back and Next when they need more than one, and Reset
 * and Close.
 */
export function openCollectionWindow({
  ui,
  scheduler,
  onReset,
  onClosed,
}: CollectionWindowOptions): ListWindow {
  // Reset's click reads the window from this variable, assigned when the
  // window is built. A press can still arrive during the fade: Escape and then
  // Enter must not reset over a closing window.
  let collectionWindow: ListWindow = new ListWindow({
    ui,
    scheduler,
    format: formatCollection,
    actions: [
      new Button({
        theme: game.theme,
        children: [createLabel('Reset')],
        layout: {height: BUTTON_HEIGHT, justifyContent: 'flex-start'},
        onClick: () => {
          let {state} = collectionWindow.modal;

          if (state !== 'closing' && state !== 'closed') {
            onReset();
          }
        },
      }),
    ],
    placement: 'centre',
    onClosed,
  });

  return collectionWindow;
}
