import {describe, expect, test} from 'vitest';

import {getPageBreaks} from '../source/game/core/getPageBreaks.js';

describe(getPageBreaks, () => {
  test('a text with fewer lines than a page has no breaks', () => {
    expect(getPageBreaks('one\ntwo', 3)).toEqual([]);
  });

  test('a text with exactly one page of lines has no breaks', () => {
    expect(getPageBreaks('one\ntwo\nthree', 3)).toEqual([]);
  });

  test('a longer text has a break after every full page', () => {
    let wrapped = 'aa\nbbb\nc\ndddd\nee';

    expect(getPageBreaks(wrapped, 2)).toEqual([7, 14]);
  });

  test('each break lies just after a newline', () => {
    let wrapped = 'aa\nbbb\nc\ndddd\nee';

    for (let offset of getPageBreaks(wrapped, 2)) {
      expect(wrapped[offset - 1]).toBe('\n');
    }
  });

  test('the end of the text is not a break when the last page is full', () => {
    expect(getPageBreaks('aa\nbbb\nc\ndddd', 2)).toEqual([7]);
  });

  test('an empty line counts as a line', () => {
    expect(getPageBreaks('aa\n\nbb\ncc', 2)).toEqual([4]);
  });

  test('a page size below 1 is treated as 1', () => {
    expect(getPageBreaks('aa\nbb\ncc', 0)).toEqual([3, 6]);
  });
});
