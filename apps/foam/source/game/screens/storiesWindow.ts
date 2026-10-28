import {type Scheduler, type UiRoot, wrapText} from 'tellurion';

import {formatTime, isNightOver} from '../core/hours.js';
import {measureText} from '../core/measureText.js';
import {type Night} from '../core/night.js';
import {ListWindow} from './listWindow.js';

export type StoriesWindowOptions = {
  ui: UiRoot;
  scheduler: Scheduler;
  night: Night | null;

  /** Called once the window has closed. */
  onClosed: () => void;
};

function formatStories(night: Night | null, textWidth: number): {title: string; text: string} {
  let stories = night?.stories ?? [];

  return {
    title: `Stories  ${stories.length} found`,
    // A null night reads as empty and over.
    text:
      stories.length > 0 ?
        stories
          .map(({title, minutes}) =>
            wrapText(`${formatTime(minutes)}  ${title}`, textWidth, measureText),
          )
          .join('\n')
      : night !== null && !isNightOver(night) ? 'None yet'
      : 'None',
  };
}

/**
 * The night's stories, found so far, one a line with the time of the find, in a window above the
 * menu or the log: a title with the count, the list, page by page with Back and Next when it needs
 * more than one, and Close.
 */
export class StoriesWindow extends ListWindow {
  constructor({ui, scheduler, night, onClosed}: StoriesWindowOptions) {
    super({
      ui,
      scheduler,
      format: (textWidth) => formatStories(night, textWidth),
      actions: [],
      placement: 'top',
      onClosed,
    });
  }
}
