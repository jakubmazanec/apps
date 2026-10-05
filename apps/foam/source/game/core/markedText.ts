export const MARK = '*';

/** Returns the text without its marks. */
export function stripMarks(text: string): string {
  return text.replaceAll(MARK, '');
}

/**
 * Splits a piece of a marked text into what the regular font and the italic font each show. Both
 * results have one character for every character of the piece that is not a mark: the letter where
 * that font draws it, and a space where the other font does. Line ends stay in both.
 *
 * The marks before `start` are counted to know whether the piece begins in italic, so a page that
 * starts inside an italic passage is right.
 */
export function splitMarked(
  text: string,
  start: number,
  end: number,
): {regular: string; italic: string} {
  let italicOn = text.slice(0, start).split(MARK).length % 2 === 0;
  let regular = '';
  let italic = '';

  for (let character of text.slice(start, end)) {
    if (character === MARK) {
      italicOn = !italicOn;
    } else if (character === '\n') {
      regular += character;
      italic += character;
    } else if (italicOn) {
      regular += ' ';
      italic += character;
    } else {
      regular += character;
      italic += ' ';
    }
  }

  return {regular, italic};
}
