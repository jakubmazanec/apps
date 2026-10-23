import {describe, expect, test} from 'vitest';

import {splitMarked, stripMarks} from '../source/game/core/markedText.js';

const TEXT = 'a *bc* d';

describe(stripMarks, () => {
  test('removes the marks', () => {
    expect(stripMarks('the beer was *better* then')).toBe('the beer was better then');
  });

  test('keeps a text without marks', () => {
    expect(stripMarks('no marks')).toBe('no marks');
  });
});

describe(splitMarked, () => {
  test('shows a text without marks in the regular font', () => {
    expect(splitMarked('ab c', 0, 4)).toEqual({regular: 'ab c', italic: '    '});
  });

  test('splits one italic word', () => {
    expect(splitMarked(TEXT, 0, 8)).toEqual({regular: 'a    d', italic: '  bc  '});
  });

  test('splits two italic words', () => {
    expect(splitMarked('*a* b *c*', 0, 9)).toEqual({regular: '  b  ', italic: 'a   c'});
  });

  test('reads a piece that starts inside italic', () => {
    expect(splitMarked(TEXT, 4, 8)).toEqual({regular: '  d', italic: 'c  '});
  });

  test('reads a piece that ends inside italic', () => {
    expect(splitMarked(TEXT, 0, 4)).toEqual({regular: 'a  ', italic: '  b'});
  });

  test('keeps line ends in both', () => {
    expect(splitMarked('*ab*\ncd', 0, 7)).toEqual({regular: '  \ncd', italic: 'ab\n  '});
  });

  test('gives both results as many characters as the piece has without marks', () => {
    for (let text of [TEXT, '*ab*\ncd']) {
      for (let start = 0; start <= text.length; start++) {
        for (let end = start; end <= text.length; end++) {
          let {regular, italic} = splitMarked(text, start, end);
          let expected = stripMarks(text.slice(start, end)).length;

          expect(regular).toHaveLength(expected);
          expect(italic).toHaveLength(expected);
        }
      }
    }
  });

  test('gives both results one character for each UTF-16 unit of an emoji', () => {
    let text = 'a😀*b*';
    let {regular, italic} = splitMarked(text, 0, text.length);
    let expected = stripMarks(text).length;

    expect(regular).toHaveLength(expected);
    expect(italic).toHaveLength(expected);
  });

  test('makes everything after the last of an odd number of marks italic', () => {
    expect(splitMarked('a *bc d', 0, 7)).toEqual({regular: 'a     ', italic: '  bc d'});
  });
});
