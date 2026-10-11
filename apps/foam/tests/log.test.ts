import {describe, expect, test} from 'vitest';

import {getPageBreaks} from '../source/game/core/getPageBreaks.js';
import {GLYPH_WIDTH} from '../source/game/core/getSceneArea.js';
import {formatLog, logChoice, type LogEntry, logText} from '../source/game/core/log.js';
import {splitMarked, stripMarks} from '../source/game/core/markedText.js';
import {createNight} from '../source/game/core/night.js';

function measure(text: string): number {
  return stripMarks(text).length * GLYPH_WIDTH;
}

function createTestNight() {
  return createNight({place: 'rotorBarRoom', minutes: 1180, money: 350});
}

const LONG_LABEL: LogEntry[] = [
  {
    kind: 'choice',
    minutes: 1180,
    text: 'Ask about the *better* beer of the winter the pipes froze',
  },
];

describe(logText, () => {
  test("writes the page with the night's minutes and the window's title", () => {
    let night = createTestNight();

    logText(night, 'The bar', 'Hello.');
    night.minutes = 1190;
    logText(night, undefined, 'No title.');

    expect(night.log).toEqual([
      {kind: 'text', minutes: 1180, speaker: 'The bar', text: 'Hello.'},
      {kind: 'text', minutes: 1190, speaker: undefined, text: 'No title.'},
    ]);
  });
});

describe(logChoice, () => {
  test("writes the label with the night's minutes", () => {
    let night = createTestNight();

    logChoice(night, 'Go');

    expect(night.log).toEqual([{kind: 'choice', minutes: 1180, text: 'Go'}]);
  });
});

describe(formatLog, () => {
  test('gives a text entry its time and title, a choice one italic line, and a blank line between', () => {
    let log: LogEntry[] = [
      {kind: 'text', minutes: 1180, speaker: 'The bar', text: 'The bartender nods at the taps.'},
      {kind: 'choice', minutes: 1180, text: 'Order a beer  10 min  45 Kč'},
      {
        kind: 'text',
        minutes: 1190,
        speaker: 'The bar',
        text: 'The beer is cold and the foam is thick, and for a while nothing else needs doing.',
      },
    ];

    expect(formatLog(log, 36 * GLYPH_WIDTH, measure)).toBe(
      '19:40  The bar\nThe bartender nods at the taps.\n\n*19:40  Order a beer  10 min  45 Kč*\n\n19:50  The bar\nThe beer is cold and the foam is\nthick, and for a while nothing else\nneeds doing.',
    );
  });

  test('wraps a long label, strips its own marks and keeps the whole line italic', () => {
    expect(formatLog(LONG_LABEL, 20 * GLYPH_WIDTH, measure)).toBe(
      '*19:40  Ask about the\nbetter beer of the\nwinter the pipes\nfroze*',
    );
  });

  // The narrowest screen's text is 19 letters wide, and a title may have 19.
  test('wraps a long title with its text', () => {
    let log: LogEntry[] = [
      {
        kind: 'text',
        minutes: 1180,
        speaker: 'Brno hlavní nádraží',
        text: 'Trains leave from here at *dawn*.',
      },
    ];

    expect(formatLog(log, 19 * GLYPH_WIDTH, measure)).toBe(
      '19:40  Brno hlavní\nnádraží\nTrains leave from\nhere at *dawn*.',
    );
  });

  test("keeps a text's marks", () => {
    let log: LogEntry[] = [
      {kind: 'text', minutes: 1180, speaker: 'A patron', text: 'The beer was *better* then.'},
    ];

    expect(formatLog(log, 36 * GLYPH_WIDTH, measure)).toBe(
      '19:40  A patron\nThe beer was *better* then.',
    );
  });

  test('gives a page without a title its time alone', () => {
    let log: LogEntry[] = [{kind: 'text', minutes: 1180, speaker: undefined, text: 'Dark.'}];

    expect(formatLog(log, 36 * GLYPH_WIDTH, measure)).toBe('19:40\nDark.');
  });

  test('gives an empty string for an empty log', () => {
    expect(formatLog([], 36 * GLYPH_WIDTH, measure)).toBe('');
  });

  test("a page that starts inside a choice's line is italic", () => {
    let formatted = formatLog(LONG_LABEL, 20 * GLYPH_WIDTH, measure);
    let [offset = 0] = getPageBreaks(formatted, 2);
    let {italic, regular} = splitMarked(formatted, offset, formatted.length);

    expect(regular).toMatch(/^[\n ]*$/);
    expect(italic).toContain('winter the pipes');
  });
});
