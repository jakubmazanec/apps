import {describe, expect, test} from 'vitest';

import {drainPending} from '../source/shell/pending.js';
import {type StampedInput} from '../source/shell/protocol.js';

function fivePending(): StampedInput[] {
  return [0, 1, 2, 3, 4].map((pad) => ({
    sample: BigInt(pad),
    input: {kind: 'pad-release', pad},
  }));
}

describe(drainPending, () => {
  test('keeps refused inputs in order', () => {
    let pending = fivePending();
    let [first, second, third, fourth, fifth] = pending;
    let accepted: StampedInput[] = [];

    let queued = drainPending(pending, (stamped) => {
      if (accepted.length === 3) {
        return 'full';
      }

      accepted.push(stamped);

      return 'queued';
    });

    expect(queued).toEqual([first, second, third]);
    expect(accepted).toEqual(queued);
    expect(pending).toEqual([fourth, fifth]);
  });

  test('stops at the first refusal even if a later input would be accepted', () => {
    let pending = fivePending();
    let [first, second, third, fourth, fifth] = pending;
    let offered: StampedInput[] = [];

    let queued = drainPending(pending, (stamped) => {
      offered.push(stamped);

      return stamped === fourth ? 'full' : 'queued';
    });

    expect(queued).toEqual([first, second, third]);
    expect(pending).toEqual([fourth, fifth]);
    expect(offered).toEqual([first, second, third, fourth]);
  });

  test('removes a dropped input without returning it and goes on with the next', () => {
    let pending = fivePending();
    let [first, second, third, fourth, fifth] = pending;
    let offered: StampedInput[] = [];

    let queued = drainPending(pending, (stamped) => {
      offered.push(stamped);

      return stamped === second || stamped === third ? 'dropped' : 'queued';
    });

    expect(queued).toEqual([first, fourth, fifth]);
    expect(pending).toEqual([]);
    expect(offered).toEqual([first, second, third, fourth, fifth]);
  });

  test('keeps the inputs behind a refusal that follow a dropped one', () => {
    let pending = fivePending();
    let [first, second, third, fourth, fifth] = pending;

    let queued = drainPending(pending, (stamped) => {
      if (stamped === first) {
        return 'dropped';
      }

      return stamped === fourth ? 'full' : 'queued';
    });

    expect(queued).toEqual([second, third]);
    expect(pending).toEqual([fourth, fifth]);
  });
});
