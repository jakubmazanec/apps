import {type StampedInput} from './protocol.js';

export function drainPending(
  pending: StampedInput[],
  queue: (stamped: StampedInput) => boolean,
): StampedInput[] {
  let queued = 0;

  for (let stamped of pending) {
    if (!queue(stamped)) {
      break;
    }

    queued += 1;
  }

  return pending.splice(0, queued);
}
