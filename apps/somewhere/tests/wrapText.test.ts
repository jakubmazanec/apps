import {describe, expect, test} from 'vitest';

import {wrapText} from '../source/engine/dialogue/wrapText.js';

let measure = (text: string) => text.length;

describe('wrapText', () => {
  test('replaces break spaces with newlines and preserves length', () => {
    let wrapped = wrapText('aaa bbb ccc ddd', 7, measure);

    expect(wrapped).toBe('aaa bbb\nccc ddd');
    expect(wrapped).toHaveLength('aaa bbb ccc ddd'.length);
  });

  test('a line that fits is untouched', () => {
    expect(wrapText('short', 10, measure)).toBe('short');
  });

  test('authored newlines are kept as hard breaks', () => {
    let wrapped = wrapText('aaa bbb\nccc ddd eee', 7, measure);

    expect(wrapped).toBe('aaa bbb\nccc ddd\neee');
  });

  test('no reflow: wrapping any prefix never breaks earlier than the full text', () => {
    let full = 'aaa bbb ccc ddd eee';
    let wrapped = wrapText(full, 7, measure);

    for (let end = 1; end <= full.length; end++) {
      let prefix = wrapText(full, 7, measure).slice(0, end);
      let independent = wrapText(full.slice(0, end), 7, measure);

      // Every break the prefix wrap makes, the full wrap already made at the
      // same offset (greedy wrapping decides from earlier content only).
      for (let [index, character] of [...independent].entries()) {
        if (character !== '\n') {
          continue;
        }

        expect(wrapped[index]).toBe('\n');
      }

      expect(prefix).toHaveLength(independent.length);
    }
  });

  test('a runner substring of pre-wrapped text stays aligned with the authored text', () => {
    let authored = 'aaa bbb ccc';
    let wrapped = wrapText(authored, 7, measure);

    for (let count = 0; count <= authored.length; count++) {
      expect(wrapped.slice(0, count).replaceAll('\n', ' ')).toBe(authored.slice(0, count));
    }
  });

  test('a single word wider than the panel DEV-throws', () => {
    expect(() => wrapText('tiny unbreakableword', 7, measure)).toThrow(/wider than/);
  });
});
