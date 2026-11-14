import {type StampedInput} from './protocol.js';

// What the core did with an input: took it, had no room for it yet or does not know it
export type QueueResult = 'dropped' | 'full' | 'queued';

// Removes the inputs the core answered from the list and stops at the first one it has no room for.
// Returns only the queued ones: the core never saw a dropped input, so a replayed session must not
// hold it
export function drainPending(
  pending: StampedInput[],
  queue: (stamped: StampedInput) => QueueResult,
): StampedInput[] {
  let queued: StampedInput[] = [];
  let answered = 0;

  for (let stamped of pending) {
    let result = queue(stamped);

    if (result === 'full') {
      break;
    }

    answered += 1;

    if (result === 'queued') {
      queued.push(stamped);
    }
  }

  pending.splice(0, answered);

  return queued;
}
