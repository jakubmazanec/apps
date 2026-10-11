import {wrapText} from 'tellurion';

import {formatTime} from './hours.js';
import {MARK, stripMarks} from './markedText.js';
import {type Night} from './night.js';

/** One thing the player read or chose, with the clock as it stood. */
export type LogEntry =
  | {
      kind: 'choice';

      /** The minute of the night the button was pressed, before its costs. */
      minutes: number;

      /** The label as the button read it, numbers included. */
      text: string;
    }
  | {
      kind: 'text';

      /** The minute of the night the page appeared. */
      minutes: number;

      /** The window's title; `undefined` when it had none. */
      speaker: string | undefined;

      /** The page, with its italic marks. */
      text: string;
    };

/** Logs a page of text as the story window shows it, at the night's minute. */
export function logText(night: Night, speaker: string | undefined, text: string): void {
  night.log.push({kind: 'text', minutes: night.minutes, speaker, text});
}

/** Logs a choice by its label as the button read it, at the night's minute. */
export function logChoice(night: Night, text: string): void {
  night.log.push({kind: 'choice', minutes: night.minutes, text});
}

/**
 * The log as one marked text, wrapped to the width: a text entry is its time and its title on one
 * line and its text under them; a choice is one line in italic, its time and its label; a blank
 * line separates entries. Empty for an empty log. `measure` gives the width of a piece of text and
 * does not count the marks, as the story window's measure does not.
 */
export function formatLog(
  log: readonly LogEntry[],
  width: number,
  measure: (text: string) => number,
): string {
  return log
    .map((entry) => {
      let time = formatTime(entry.minutes);

      if (entry.kind === 'choice') {
        // The label's own marks go first, so one stray mark cannot turn the rest italic.
        return wrapText(`${MARK}${time}  ${stripMarks(entry.text)}${MARK}`, width, measure);
      }

      let title = entry.speaker === undefined ? time : `${time}  ${entry.speaker}`;

      // The title wraps with the text: after the time, a long title is wider than the narrowest
      // screen's text. wrapText keeps the line end between them, so the text wraps as on its own.
      return wrapText(`${title}\n${entry.text}`, width, measure);
    })
    .join('\n\n');
}
