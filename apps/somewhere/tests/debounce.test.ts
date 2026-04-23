import {afterEach, beforeEach, describe, expect, test, vitest} from 'vitest';

import {debounce} from '../source/engine/utilities/debounce.js';

describe(debounce, () => {
  beforeEach(() => {
    vitest.useFakeTimers();
  });

  afterEach(() => {
    vitest.useRealTimers();
  });

  test('collapses rapid calls to one trailing-edge invocation', () => {
    let fn = vitest.fn<(value: number) => void>();
    let debounced = debounce(fn, 250);

    debounced(1);
    debounced(2);
    debounced(3);

    expect(fn).not.toHaveBeenCalled();

    vitest.advanceTimersByTime(250);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
  });

  test('flush runs a pending call immediately and clears it', () => {
    let fn = vitest.fn<(value: string) => void>();
    let debounced = debounce(fn, 250);

    debounced('a');
    debounced.flush();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');

    vitest.advanceTimersByTime(250);

    expect(fn).toHaveBeenCalledTimes(1); // nothing left pending after flush
  });

  test('flush with nothing pending is a no-op', () => {
    let fn = vitest.fn<() => void>();
    let debounced = debounce(fn, 250);

    debounced.flush();

    expect(fn).not.toHaveBeenCalled();
  });

  test('cancel drops a pending call', () => {
    let fn = vitest.fn<(value: string) => void>();
    let debounced = debounce(fn, 250);

    debounced('a');
    debounced.cancel();

    vitest.advanceTimersByTime(250);

    expect(fn).not.toHaveBeenCalled();
  });

  // The production lifecycle: saveSettingsSoon is a module singleton flushed on
  // every Options-modal close and then reused for the rest of the session. A
  // regression that left `timer` stale after flush() would silently stop every
  // later volume write with nothing else catching it.
  test('stays usable after flush, debouncing the next call normally', () => {
    let fn = vitest.fn<(value: string) => void>();
    let debounced = debounce(fn, 250);

    debounced('a');
    debounced.flush();
    debounced('b');

    expect(fn).toHaveBeenCalledTimes(1); // 'b' is still pending

    vitest.advanceTimersByTime(250);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  test('stays usable after cancel, debouncing the next call normally', () => {
    let fn = vitest.fn<(value: string) => void>();
    let debounced = debounce(fn, 250);

    debounced('a');
    debounced.cancel();
    debounced('b');

    vitest.advanceTimersByTime(250);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b'); // the cancelled 'a' never ran
  });
});
