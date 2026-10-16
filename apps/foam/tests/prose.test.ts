import {describe, expect, test} from 'vitest';

import {prose, standIn} from '../source/game/core/prose.js';

describe(prose, () => {
  test('wrapped lines join with one space', () => {
    expect(prose`
      One
      two
      three.
    `).toBe('One two three.');
  });

  test('indentation and outer blank lines go', () => {
    expect(prose`


        Some    text.


    `).toBe('Some    text.');
  });

  test('a blank line starts a page', () => {
    expect(prose`
      First page.

      Second page.
    `).toEqual(['First page.', 'Second page.']);
    expect(prose`
      First page.



      Second page.
    `).toEqual(['First page.', 'Second page.']);
  });

  test('values are put in as written', () => {
    expect(prose`A ${3} and ${'b'}.`).toBe('A 3 and b.');
  });

  test('italic marks stay', () => {
    expect(prose`A *word* here.`).toBe('A *word* here.');
  });

  test('a text of blank lines only gives an empty string', () => {
    expect(prose`

    `).toBe('');
  });
});

describe(standIn, () => {
  test('standIn gives what prose gives', () => {
    expect(standIn`
      One page.
    `).toBe('One page.');
    expect(standIn`
      One page.

      Two pages.
    `).toEqual(['One page.', 'Two pages.']);
  });
});
