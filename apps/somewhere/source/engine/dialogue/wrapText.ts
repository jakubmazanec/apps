import {failUnsupported} from '../utilities/failUnsupported.js';

/**
 * Wrap text to a pixel width by replacing break spaces with newlines. Pure and
 * length-preserving: it never inserts or deletes a character, so a substring
 * of the result stays aligned with the same offsets in the input (the
 * typewriter's no-reflow guarantee). Authored newlines are kept as hard
 * breaks. `measure` returns the rendered width of a string in art px.
 */
export function wrapText(text: string, width: number, measure: (text: string) => number): string {
  return text
    .split('\n')
    .map((line) => wrapLine(line, width, measure))
    .join('\n');
}

function wrapLine(line: string, width: number, measure: (text: string) => number): string {
  let wrapped = '';
  let current = '';

  for (let [index, word] of line.split(' ').entries()) {
    if (word.length > 0 && measure(word) > width) {
      failUnsupported(
        `The word "${word}" is wider than the dialogue text panel (${measure(word)} > ${width} art px)! Shorten the word; everything else fits by wrapping and windowing.`,
      );
    }

    if (index === 0) {
      current = word;

      continue;
    }

    let candidate = `${current} ${word}`;

    if (measure(candidate) > width) {
      wrapped += `${current}\n`;
      current = word;
    } else {
      current = candidate;
    }
  }

  return wrapped + current;
}
