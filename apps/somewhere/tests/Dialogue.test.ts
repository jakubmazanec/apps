import {describe, expect, test, vi} from 'vitest';

import {Dialogue} from '../source/engine/dialogue/Dialogue.js';

type TestContext = {calls: string[]; metMira: boolean};

function createContext(): TestContext {
  return {calls: [], metMira: false};
}

describe('Dialogue node entry', () => {
  test('enters the start node revealing from zero', () => {
    let dialogue = new Dialogue({script: {start: {text: 'Hello.'}}, context: createContext()});

    expect(dialogue.phase).toBe('revealing');
    expect(dialogue.pageText).toBe('Hello.');
    expect(dialogue.pageIndex).toBe(0);
    expect(dialogue.revealedCount).toBe(0);
  });

  test('a callable start resolves against the context', () => {
    let dialogue = new Dialogue({
      script: {
        start: (context: TestContext) => (context.metMira ? 'again' : 'greeting'),
        nodes: {greeting: {text: 'First time.'}, again: {text: 'Back already?'}},
      },
      context: {...createContext(), metMira: true},
    });

    expect(dialogue.pageText).toBe('Back already?');
  });

  test('node entry runs onEnter, then the text function, then isVisible, each once', () => {
    let context = createContext();

    void new Dialogue({
      script: {
        start: {
          onEnter: (c: TestContext) => {
            c.calls.push('onEnter');
          },
          text: (c: TestContext) => {
            c.calls.push('text');

            return 'Hi.';
          },
          choices: [
            {
              text: 'Ok',
              isVisible: (c: TestContext) => {
                c.calls.push('isVisible');

                return true;
              },
            },
          ],
        },
      },
      context,
    });

    expect(context.calls).toEqual(['onEnter', 'text', 'isVisible']);
  });
});

describe('Dialogue tick and advance', () => {
  test('tick accumulates fractional characters at revealSpeed per second', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'abcdef'}},
      context: createContext(),
      revealSpeed: 10,
    });

    dialogue.tick(50); // 0.5 characters: nothing visible yet

    expect(dialogue.revealedCount).toBe(0);

    dialogue.tick(50); // 1.0 accumulated

    expect(dialogue.revealedCount).toBe(1);

    dialogue.tick(500); // +5, page complete

    expect(dialogue.revealedCount).toBe(6);
    expect(dialogue.phase).toBe('idle');
  });

  test('the fully revealed last page of a node with visible choices becomes choosing', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Hi.', choices: [{text: 'A'}, {text: 'B'}]}},
      context: createContext(),
    });

    dialogue.tick(1000);

    expect(dialogue.phase).toBe('choosing');
    expect(dialogue.visibleChoices).toHaveLength(2);
    expect(dialogue.selectedIndex).toBe(0);
  });

  test('advance while revealing skips to the stop and enters the same phase a tick would', () => {
    let plain = new Dialogue({script: {start: {text: 'abcdef'}}, context: createContext()});

    plain.advance();

    expect(plain.revealedCount).toBe(6);
    expect(plain.phase).toBe('idle');

    let choosing = new Dialogue({
      script: {start: {text: 'Hi.', choices: [{text: 'A'}]}},
      context: createContext(),
    });

    choosing.advance();

    expect(choosing.phase).toBe('choosing');
  });

  test('string[] pages turn on advance and end after the last one', () => {
    let dialogue = new Dialogue({
      script: {start: {text: ['One.', 'Two.']}},
      context: createContext(),
    });

    dialogue.advance(); // skip page 0

    expect(dialogue.phase).toBe('idle');

    dialogue.advance(); // page turn

    expect(dialogue.pageIndex).toBe(1);
    expect(dialogue.pageText).toBe('Two.');
    expect(dialogue.phase).toBe('revealing');
    expect(dialogue.revealedCount).toBe(0);

    dialogue.advance(); // skip page 1
    dialogue.advance(); // no next, no choices: ends

    expect(dialogue.phase).toBe('ended');
  });

  test('advance follows next by id and by inline node', () => {
    let dialogue = new Dialogue({
      script: {
        start: 'a',
        nodes: {a: {text: 'A', next: {text: 'B', next: 'c'}}, c: {text: 'C'}},
      },
      context: createContext(),
    });

    dialogue.advance();
    dialogue.advance();

    expect(dialogue.pageText).toBe('B');

    dialogue.advance();
    dialogue.advance();

    expect(dialogue.pageText).toBe('C');
  });
});

describe('Dialogue breaks', () => {
  test('the reveal pauses at breaks, advance resumes inside the page', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'abcdefgh'}},
      context: createContext(),
      revealSpeed: 1000,
    });

    dialogue.setBreaks([3, 6]);
    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(3);
    expect(dialogue.phase).toBe('idle');

    dialogue.advance(); // resume, not page turn

    expect(dialogue.phase).toBe('revealing');

    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(6);

    dialogue.advance();
    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(8);
    expect(dialogue.phase).toBe('idle');
  });

  test('advance while revealing completes only the current stretch', () => {
    let dialogue = new Dialogue({script: {start: {text: 'abcdefgh'}}, context: createContext()});

    dialogue.setBreaks([3]);
    dialogue.advance();

    expect(dialogue.revealedCount).toBe(3);
    expect(dialogue.phase).toBe('idle');
  });

  test('offsets at or before revealedCount are ignored', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'abcdefgh'}},
      context: createContext(),
      revealSpeed: 1000,
    });

    dialogue.setBreaks([5]);
    dialogue.tick(1000); // paused at 5
    dialogue.advance(); // resume
    dialogue.setBreaks([3, 5, 7]); // 3 and 5 are stale, 7 holds
    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(7);
    expect(dialogue.phase).toBe('idle');
  });

  test('breaks clear on a page turn', () => {
    let dialogue = new Dialogue({
      script: {start: {text: ['abcdef', 'ghijkl']}},
      context: createContext(),
      revealSpeed: 1000,
    });

    dialogue.setBreaks([3]);
    dialogue.advance(); // to 3
    dialogue.advance(); // resume
    dialogue.tick(1000); // page 0 complete
    dialogue.advance(); // page turn clears the breaks
    dialogue.tick(1000);

    expect(dialogue.revealedCount).toBe(6); // no pause at 3 on the new page
    expect(dialogue.phase).toBe('idle');
  });
});

describe('Dialogue choices', () => {
  test('moveSelection wraps in both directions', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'A'}, {text: 'B'}, {text: 'C'}]}},
      context: createContext(),
    });

    dialogue.advance();
    dialogue.moveSelection(-1);

    expect(dialogue.selectedIndex).toBe(2);

    dialogue.moveSelection(1);

    expect(dialogue.selectedIndex).toBe(0);
  });

  test('select sets the index only while choosing and in bounds', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'A'}, {text: 'B'}]}},
      context: createContext(),
    });

    dialogue.select(1); // still revealing: ignored

    expect(dialogue.selectedIndex).toBe(0);

    dialogue.advance();
    dialogue.select(1);

    expect(dialogue.selectedIndex).toBe(1);

    dialogue.select(5);
    dialogue.select(-1);

    expect(dialogue.selectedIndex).toBe(1);
  });

  test('choose follows the choice next and out-of-bounds is ignored', () => {
    let dialogue = new Dialogue({
      script: {
        start: 'q',
        nodes: {
          q: {text: 'Q', choices: [{text: 'A', next: 'a'}, {text: 'B'}]},
          a: {text: 'Went A.'},
        },
      },
      context: createContext(),
    });

    dialogue.advance();
    dialogue.choose(5); // ignored

    expect(dialogue.phase).toBe('choosing');

    dialogue.choose(0);

    expect(dialogue.pageText).toBe('Went A.');
  });

  test('choosing a choice without next ends the dialogue', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'Bye'}]}},
      context: createContext(),
    });

    dialogue.advance();
    dialogue.advance(); // confirms the selected choice

    expect(dialogue.phase).toBe('ended');
  });

  test('isVisible filters once on entry and indices address visibleChoices', () => {
    let dialogue = new Dialogue({
      script: {
        start: 'q',
        nodes: {
          q: {
            text: 'Q',
            choices: [
              {text: 'Hidden', isVisible: () => false, next: 'wrong'},
              {text: 'Shown', next: 'right'},
            ],
          },
          wrong: {text: 'Wrong.'},
          right: {text: 'Right.'},
        },
      },
      context: createContext(),
    });

    dialogue.advance();

    expect(dialogue.visibleChoices).toHaveLength(1);
    expect(dialogue.visibleChoices[0]?.text).toBe('Shown');

    dialogue.choose(0);

    expect(dialogue.pageText).toBe('Right.');
  });

  test('a node whose choices all filter invisible is choice-less, with a DEV warning', () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let dialogue = new Dialogue({
      script: {start: {text: 'Q', choices: [{text: 'A', isVisible: () => false}]}},
      context: createContext(),
    });

    expect(warn).toHaveBeenCalledTimes(1);

    dialogue.advance();

    expect(dialogue.phase).toBe('idle'); // not choosing

    dialogue.advance(); // no next: ends

    expect(dialogue.phase).toBe('ended');

    warn.mockRestore();
  });
});

describe('Dialogue termination and inertness', () => {
  test('ended is inert: every method is a no-op', () => {
    let dialogue = new Dialogue({script: {start: {text: 'x'}}, context: createContext()});

    dialogue.advance();
    dialogue.advance();

    expect(dialogue.phase).toBe('ended');

    dialogue.tick(1000);
    dialogue.advance();
    dialogue.moveSelection(1);
    dialogue.select(0);
    dialogue.choose(0);
    dialogue.setBreaks([1]);

    expect(dialogue.phase).toBe('ended');
    expect(dialogue.revealedCount).toBe(1);
  });
});

describe('Dialogue DEV invariants', () => {
  test('an empty page list throws on construction', () => {
    expect(() => new Dialogue({script: {start: {text: []}}, context: createContext()})).toThrow(
      /empty page list/,
    );
  });

  test('an empty page list throws on every entry, not only at construction', () => {
    let dialogue = new Dialogue({
      script: {start: {text: 'ok', next: {text: []}}},
      context: createContext(),
    });

    dialogue.advance();

    expect(() => {
      dialogue.advance();
    }).toThrow(/empty page list/);
  });

  test('a node carrying both choices and next throws', () => {
    expect(
      () =>
        new Dialogue({
          script: {start: {text: 'x', choices: [{text: 'A'}], next: {text: 'y'}}},
          context: createContext(),
        }),
    ).toThrow(/both choices and next/);
  });

  test('a non-positive revealSpeed throws', () => {
    expect(
      () => new Dialogue({script: {start: {text: 'x'}}, context: createContext(), revealSpeed: 0}),
    ).toThrow(/revealSpeed/);
  });

  test('a dangling node id throws (untyped data escape hatch)', () => {
    expect(() => new Dialogue({script: {start: 'missing'}, context: createContext()})).toThrow(
      /wasn't found/,
    );
  });
});
