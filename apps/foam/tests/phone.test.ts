import {defineDialogueScript} from 'tellurion';
import {describe, expect, test, vitest} from 'vitest';

import {createNight, type Night} from '../source/game/core/night.js';
import {
  dropUnknownMessages,
  getUnreadMessage,
  type Message,
  readMessage,
  receiveMessages,
} from '../source/game/core/phone.js';

const START = {seed: 7, place: 'zidenice', minutes: 1020, money: 350} as const;

function message(key: string, arrives: (night: Night) => boolean): Message {
  return {
    key,
    from: 'Jakub',
    arrives,
    script: defineDialogueScript<Night>()({start: {speaker: 'Jakub', text: 'Hi.'}}),
  };
}

const always = (): boolean => true;
const never = (): boolean => false;

describe(receiveMessages, () => {
  test("moves every message whose condition holds to the end of the unread list, in the list's order, once", () => {
    let a = message('a', always);
    let b = message('b', never);
    let c = message('c', always);
    let night = createNight(START);

    expect(receiveMessages(night, [a, b, c])).toEqual([a, c]);
    expect(night.phone.unread).toEqual(['a', 'c']);
    expect(receiveMessages(night, [a, b, c])).toEqual([]);
    expect(night.phone.unread).toEqual(['a', 'c']);

    let later = message('b', always);

    expect(receiveMessages(night, [a, later, c])).toEqual([later]);
    expect(night.phone.unread).toEqual(['a', 'c', 'b']);
    expect(night.phone.read).toEqual([]);
  });

  test('reads the condition with the night, and not for a message unread or read', () => {
    let arrives = vitest.fn<(night: Night) => boolean>(always);
    let a = message('a', arrives);
    let night = createNight(START);

    receiveMessages(night, [a]);

    expect(arrives).toHaveBeenCalledExactlyOnceWith(night);

    arrives.mockClear();
    receiveMessages(night, [a]);

    expect(arrives).not.toHaveBeenCalled();

    readMessage(night, 'a');
    receiveMessages(night, [a]);

    expect(arrives).not.toHaveBeenCalled();
  });
});

describe(getUnreadMessage, () => {
  test('gives the oldest unread message, and undefined with none', () => {
    let a = message('a', always);
    let b = message('b', always);
    let night = createNight(START);

    night.phone.unread.push('b', 'a');

    expect(getUnreadMessage(night, [a, b])).toBe(b);
    expect(getUnreadMessage(createNight(START), [a, b])).toBeUndefined();
  });
});

describe(readMessage, () => {
  test('moves the key from the unread list to the read list, and ignores a key not unread', () => {
    let night = createNight(START);

    night.phone.unread.push('a', 'b');
    readMessage(night, 'b');

    expect(night.phone.unread).toEqual(['a']);
    expect(night.phone.read).toEqual(['b']);

    readMessage(night, 'zzz');
    readMessage(night, 'b');

    expect(night.phone.unread).toEqual(['a']);
    expect(night.phone.read).toEqual(['b']);
  });
});

describe(dropUnknownMessages, () => {
  test('takes every key the content lacks out of both lists in place, with a warning for each, and leaves the others', () => {
    let a = message('a', always);
    let b = message('b', always);
    let night = createNight(START);
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      night.phone.unread.push('a', 'gone');
      night.phone.read.push('old', 'b');

      let {unread, read} = night.phone;

      dropUnknownMessages(night, [a, b]);

      expect(night.phone).toEqual({unread: ['a'], read: ['b']});
      expect(unread).toEqual(['a']);
      expect(read).toEqual(['b']);
      expect(warn.mock.calls).toEqual([
        ['The phone drops the message "gone", which the content lacks.'],
        ['The phone drops the message "old", which the content lacks.'],
      ]);
    } finally {
      warn.mockRestore();
    }
  });
});
