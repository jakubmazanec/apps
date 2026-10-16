import {Dialogue} from 'tellurion';
import {describe, expect, test} from 'vitest';

import {createWayOut, leaveBy} from '../source/game/core/createWayOut.js';
import {createNight, type Way} from '../source/game/core/night.js';

const ALL_WAYS: readonly Way[] = ['walk', 'tram', 'taxi'];

function start(ways: readonly Way[]) {
  let night = createNight({place: 'zidenice', minutes: 1020, money: 350});
  let dialogue = new Dialogue({
    script: createWayOut({speaker: 'The door', text: 'Out.', ways}),
    context: night,
  });

  dialogue.advance();

  return {night, dialogue};
}

describe(createWayOut, () => {
  test('the node has the speaker, the text and the choices', () => {
    let {dialogue} = start(ALL_WAYS);

    expect(dialogue.node?.speaker).toBe('The door');
    expect(dialogue.node?.text).toBe('Out.');
    expect(dialogue.visibleChoices.map((choice) => choice.text)).toEqual([
      'Walk',
      'Take the tram',
      'Take a taxi',
      'Stay',
    ]);
  });

  test('the choices follow the ways given', () => {
    let {dialogue} = start(['taxi', 'walk']);

    expect(dialogue.visibleChoices.map((choice) => choice.text)).toEqual([
      'Take a taxi',
      'Walk',
      'Stay',
    ]);
  });

  test("each way's choice sets leaving and ends the dialogue", () => {
    for (let [index, way] of ALL_WAYS.entries()) {
      let {night, dialogue} = start(ALL_WAYS);

      dialogue.choose(index);

      expect(night.leaving?.way).toBe(way);
      expect(night.leaving?.ways).toBe(ALL_WAYS);
      expect(dialogue.phase).toBe('ended');
    }
  });

  test('Stay ends the dialogue and leaves leaving as it was', () => {
    let {night, dialogue} = start(ALL_WAYS);

    dialogue.choose(3);

    expect(night.leaving).toBeNull();
    expect(dialogue.phase).toBe('ended');

    let again = start(ALL_WAYS);

    again.night.leaving = {way: 'tram', ways: ['tram']};
    again.dialogue.choose(3);

    expect(again.night.leaving).toEqual({way: 'tram', ways: ['tram']});
    expect(again.dialogue.phase).toBe('ended');
  });
});

describe(leaveBy, () => {
  test('the returned function sets leaving', () => {
    let night = createNight({place: 'zidenice', minutes: 1020, money: 350});

    leaveBy('taxi', ALL_WAYS)(night);

    expect(night.leaving).toEqual({way: 'taxi', ways: ALL_WAYS});
  });
});
