import {describe, expect, test} from 'vitest';

import {samplePlace} from '../source/game/content/samplePlace.js';

describe('sample place', () => {
  // A text with an odd number of marks is italic from its last mark to its end.
  test("the sample place's every text has an even number of marks", () => {
    let scripts = [samplePlace.description, ...samplePlace.spots.map((spot) => spot.script)];
    let texts: string[] = [];

    for (let script of scripts) {
      let nodes = Object.values(script.nodes ?? {});

      if (typeof script.start === 'object') {
        nodes.push(script.start);
      }

      for (let node of nodes) {
        texts.push(String(node?.text));
      }
    }

    expect(texts.length).toBeGreaterThan(5);

    let oddTexts = texts.filter((text) => (text.split('*').length - 1) % 2 !== 0);

    expect(oddTexts).toEqual([]);
  });
});
