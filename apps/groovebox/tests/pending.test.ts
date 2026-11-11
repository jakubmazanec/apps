import {describe, expect, test} from 'vitest';

import {drainPending} from '../source/shell/pending.js';
import {type StampedInput} from '../source/shell/protocol.js';

describe(drainPending, () => {
  test('keeps refused inputs in order', () => {
    let pending: StampedInput[] = [0, 1, 2, 3, 4].map((pad) => ({
      sample: BigInt(pad),
      input: {kind: 'pad-release', pad},
    }));
    let [first, second, third, fourth, fifth] = pending;
    let accepted: StampedInput[] = [];

    let queued = drainPending(pending, (stamped) => {
      if (accepted.length === 3) {
        return false;
      }

      accepted.push(stamped);

      return true;
    });

    expect(queued).toEqual([first, second, third]);
    expect(accepted).toEqual(queued);
    expect(pending).toEqual([fourth, fifth]);
  });
});
