import {readFile} from 'node:fs/promises';
import {describe, expect, test} from 'vitest';

import {readMemoryLimits} from '../source/shell/memoryLimits.js';

function bytesWithMemoryFlags(flags: number) {
  // prettier-ignore
  return Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version
    0x02, 0x10, 0x01, // import section, size 16, 1 import
    0x03, 0x65, 0x6e, 0x76, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, // "env", "memory"
    0x02, flags, 0x11, 0x11, // memory, flags, 17, 17
  ]);
}

describe(readMemoryLimits, () => {
  test('reads a shared memory import', () => {
    expect(readMemoryLimits(bytesWithMemoryFlags(0x03))).toEqual({initial: 17, maximum: 17});
  });

  test('refuses an unshared memory', () => {
    expect(() => readMemoryLimits(bytesWithMemoryFlags(0x01))).toThrow('shared');
  });

  test('refuses a module without imports', () => {
    expect(() =>
      readMemoryLimits(Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])),
    ).toThrow('no import section');
  });

  test('reads the built core', async () => {
    let bytes = await readFile(
      new URL('../../../packages/groovebox-core/build/groovebox-core.wasm', import.meta.url),
    );

    let limits = readMemoryLimits(bytes);

    expect(limits.initial).toBeGreaterThan(0);
    expect(limits.maximum).toBe(limits.initial);
  });
});
