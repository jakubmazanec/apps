import {Dialogue} from 'tellurion';
import {describe, expect, test, vitest} from 'vitest';

import {createNight, getDrunkenness, type Night} from '../source/game/core/night.js';
import {
  asChoice,
  type Choice,
  defineScript,
  formatChoice,
  type Node,
  type Script,
} from '../source/game/core/script.js';

const START = {place: 'rotorBar', minutes: 1180, money: 350} as const;

function enter(script: Script<string>, night: Night): Dialogue<Night> {
  let dialogue = new Dialogue({script, context: night});

  dialogue.advance();

  return dialogue;
}

describe(defineScript, () => {
  test('the press rolls, takes the price, moves the clock and adds the drinks, then calls onChoose', () => {
    let night = createNight({place: 'rotorBar', minutes: 1180, money: 350});
    let seen: Array<[number, number]> = [];
    let onChoose = vitest.fn<(night: Night) => void>((current) => {
      seen.push([current.money, current.minutes]);
    });

    night.random = () => {
      seen.push([night.money, night.minutes]);

      return 0.2;
    };

    let script = defineScript({
      start: {
        text: 'Q',
        choices: [
          {
            text: 'Beer',
            price: 45,
            minutes: 10,
            drinks: 1,
            odds: 0.6,
            onChoose,
            next: {text: 'Done'},
          },
        ],
      },
    });
    let dialogue = new Dialogue({script, context: night});

    dialogue.advance();
    dialogue.choose(0);

    // The roll saw the night untouched; onChoose saw it with everything applied.
    expect(seen).toEqual([
      [350, 1180],
      [305, 1190],
    ]);
    expect(night.roll).toEqual({value: 0.2, odds: 0.6, won: true});
    expect(night.drunkenness).toEqual({level: 1, at: 1190});
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(night);
    expect(dialogue.pageText).toBe('Done');
  });

  test('an odds function is read before the drinks are added', () => {
    let night = createNight(START);
    let script = defineScript({
      start: {
        text: 'Q',
        choices: [
          {
            text: 'Beer',
            odds: (current) => (getDrunkenness(current) >= 1 ? 0.9 : 0.1),
            drinks: 1,
          },
        ],
      },
    });

    night.random = () => 0.5;
    enter(script, night).choose(0);

    expect(night.roll).toEqual({value: 0.5, odds: 0.1, won: false});
  });

  test('a function next reads the roll the press made', () => {
    let script = defineScript({
      start: 'q',
      nodes: {
        q: {
          text: 'Q',
          choices: [{text: 'Search', odds: 0.6, next: ({roll}) => (roll?.won ? 'won' : 'lost')}],
        },
        won: {text: 'Won'},
        lost: {text: 'Lost'},
      },
    });
    let lucky = createNight(START);
    let unlucky = createNight(START);

    lucky.random = () => 0.2;
    unlucky.random = () => 0.9;

    let won = enter(script, lucky);
    let lost = enter(script, unlucky);

    won.choose(0);
    lost.choose(0);

    expect(won.node).toBe(script.nodes?.won);
    expect(lost.node).toBe(script.nodes?.lost);
  });

  test("a condition's bounds are inclusive, an absent bound is ignored, and isVisible is combined with it", () => {
    let script = defineScript({
      start: {
        text: 'Q',
        choices: [
          {text: 'min', drunkenness: {min: 2}},
          {text: 'max', drunkenness: {max: 2}},
          {text: 'both', drunkenness: {min: 1, max: 3}},
          {text: 'and', drunkenness: {min: 2}, isVisible: (night) => night.money > 100},
          {text: 'free'},
        ],
      },
    });
    let getTexts = (night: Night) =>
      enter(script, night).visibleChoices.map((choice) => choice.text);

    expect(getTexts(createNight({...START, drunkenness: 2}))).toEqual([
      'min',
      'max',
      'both',
      'and',
      'free',
    ]);
    expect(getTexts(createNight({...START, money: 50, drunkenness: 2}))).toEqual([
      'min',
      'max',
      'both',
      'free',
    ]);
    expect(getTexts(createNight(START))).toEqual(['max', 'free']);
    expect(getTexts(createNight({...START, drunkenness: 5}))).toEqual(['min', 'and', 'free']);
  });

  test('a later visit after a drink offers the conditioned choice', () => {
    let script = defineScript({
      start: 'q',
      nodes: {
        q: {
          text: 'Q',
          choices: [
            {text: 'Drink', drinks: 2, next: 'q'},
            {text: 'Smoke', drunkenness: {min: 2}},
          ],
        },
      },
    });
    let dialogue = enter(script, createNight(START));

    expect(dialogue.visibleChoices.map((choice) => choice.text)).toEqual(['Drink']);

    dialogue.choose(0);
    dialogue.advance();

    expect(dialogue.visibleChoices.map((choice) => choice.text)).toEqual(['Drink', 'Smoke']);
  });

  test('a choice with no fields keeps no derived function', () => {
    let script = defineScript({start: 'q', nodes: {q: {text: 'Q', choices: [{text: 'A'}]}}});

    expect(script.nodes?.q.choices?.[0]).not.toHaveProperty('isVisible');
    expect(script.nodes?.q.choices?.[0]).not.toHaveProperty('onChoose');
  });

  test('inline nodes and nodes returned by a function start or next are mapped, once each', () => {
    let night = createNight(START);
    let inline = {text: 'S', choices: [{text: 'x', price: 5}]};
    let byStart = defineScript({start: () => inline});
    let start = byStart.start as (night: Night) => Node<string> | string;
    let fromStart = new Dialogue({script: byStart, context: night});

    expect(fromStart.node).not.toBe(inline);
    expect(fromStart.node?.choices?.[0]?.onChoose).toBeTypeOf('function');
    expect(start(night)).toBe(start(night));

    let byNext = defineScript({
      start: 'a',
      nodes: {
        a: {text: 'A', choices: [{text: 'Go', next: () => 'b'}]},
        b: {text: 'B', choices: [{text: 'x', price: 5}]},
      },
    });
    let fromNext = enter(byNext, night);

    fromNext.choose(0);

    expect(fromNext.node).toBe(byNext.nodes?.b);
    expect(fromNext.node?.choices?.[0]?.onChoose).toBeTypeOf('function');

    let fromInline = enter(
      defineScript({
        start: {
          text: 'A',
          choices: [{text: 'Go', next: {text: 'B', choices: [{text: 'x', price: 5}]}}],
        },
      }),
      night,
    );

    fromInline.choose(0);

    expect(fromInline.node?.choices?.[0]?.onChoose).toBeTypeOf('function');
  });

  test('a dangling id is a compile error, in a fixed next and in a function next', () => {
    // The fixtures below exist for the @ts-expect-error assertions; defineScript never validates.
    let dangling = defineScript({
      start: 'a',
      nodes: {
        a: {
          text: 'A',
          // @ts-expect-error -- a dangling `next` errors at the offending literal
          next: 'missing',
        },
      },
    });
    let danglingFunction = defineScript({
      start: 'a',
      nodes: {
        a: {
          text: 'A',
          // @ts-expect-error -- a dangling id returned by a function `next` errors at the function
          next: () => 'missing',
        },
      },
    });

    expect(dangling.start).toBe('a');
    expect(danglingFunction.nodes?.a.next).toBeTypeOf('function');
  });
});

describe(asChoice, () => {
  test('returns its argument', () => {
    let choice = {text: 'A'};

    expect(asChoice(choice)).toBe(choice);
  });
});

describe(formatChoice, () => {
  test('gives the text alone', () => {
    expect(formatChoice({text: 'Not now'}, createNight(START))).toBe('Not now');
  });

  test('gives the text with each number', () => {
    let night = createNight(START);

    expect(formatChoice({text: 'Order a beer', minutes: 10}, night)).toBe('Order a beer  10 min');
    expect(formatChoice({text: 'Order a beer', price: 45}, night)).toBe('Order a beer  45 Kč');
    expect(formatChoice({text: 'Search for the phone', odds: 0.6}, night)).toBe(
      'Search for the phone  60%',
    );
  });

  test('gives the three together in order, with a function odds read from the night', () => {
    let chair: Choice<string> = {
      text: 'Take the spare chair',
      minutes: 15,
      price: 20,
      odds: (night) => (getDrunkenness(night) >= 2 ? 0.7 : 0.4),
    };

    expect(formatChoice(chair, createNight(START))).toBe(
      'Take the spare chair  15 min  20 Kč  40%',
    );
    expect(formatChoice(chair, createNight({...START, drunkenness: 2}))).toBe(
      'Take the spare chair  15 min  20 Kč  70%',
    );
  });
});
