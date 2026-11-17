import {readFile} from 'node:fs/promises';
import {describe, expect, test} from 'vitest';

import {IO_BUFFER, readRequest, type StorageRequest} from '../source/shell/storage.js';

// Where the record sits in the shared memory: not at 0, so that an offset that forgets it shows
const ADDRESS = 72;

// A request record as the core's `RequestRecord` lays it out, in shared memory filled with junk
// around it and after its path
function written(fields: {
  requestNumber: number;
  kind: number;
  memory?: number;
  offset?: number;
  length?: number;
  from?: number;
  into?: number;
  at?: bigint;
  path?: string;
}) {
  let memory = new SharedArrayBuffer(ADDRESS + 304 + 16);
  let view = new DataView(memory, ADDRESS);
  let path = new TextEncoder().encode(fields.path ?? '');

  new Uint8Array(memory).fill(0xaa);

  for (let [at, value] of [
    [0, fields.requestNumber],
    [4, fields.kind],
    [8, fields.memory ?? 0],
    [12, fields.offset ?? 0],
    [16, fields.length ?? 0],
    [20, fields.from ?? 0],
    [24, fields.into ?? 0],
    [40, path.length],
  ] as const) {
    view.setUint32(at, value, true);
  }

  view.setBigUint64(32, fields.at ?? 0n, true);
  new Uint8Array(memory, ADDRESS + 44).set(path);

  return memory;
}

// A decoded request whose other fields are 0, as the core leaves the fields a request does not have
function decoded(fields: Partial<StorageRequest> & Pick<StorageRequest, 'kind' | 'requestNumber'>) {
  return {memory: 'io', offset: 0, length: 0, from: 0, into: 0, at: 0, path: '', ...fields};
}

describe(readRequest, () => {
  test('decodes every field of the record', () => {
    let records = [
      written({requestNumber: 0, kind: 6, path: 'tmp'}),
      written({requestNumber: 1, kind: 0, from: 258, path: 'samples'}),
      written({
        requestNumber: 2,
        kind: 1,
        at: 2n ** 40n + 5n,
        length: 512,
        path: 'samples/my kit/déšť.wav',
      }),
      written({
        requestNumber: 3,
        kind: 2,
        at: 44n,
        length: 65_536,
        into: 63_997_952,
        path: 'samples/a.wav',
      }),
      written({requestNumber: 4, kind: 7}),
      written({requestNumber: 5, kind: 3, path: 'samples/kick.wav'}),
      written({requestNumber: 6, kind: 4, offset: 0, length: 300}),
      written({requestNumber: 7, kind: 4, memory: 1, offset: 2048, length: 65_536}),
      written({requestNumber: 8, kind: 5}),
    ];

    expect(records.map((memory) => readRequest(memory, ADDRESS))).toStrictEqual([
      decoded({requestNumber: 0, kind: 'delete', path: 'tmp'}),
      decoded({requestNumber: 1, kind: 'list', from: 258, path: 'samples'}),
      decoded({
        requestNumber: 2,
        kind: 'read',
        at: 2 ** 40 + 5,
        length: 512,
        path: 'samples/my kit/déšť.wav',
      }),
      decoded({
        requestNumber: 3,
        kind: 'load',
        at: 44,
        length: 65_536,
        into: 63_997_952,
        path: 'samples/a.wav',
      }),
      decoded({requestNumber: 4, kind: 'free'}),
      decoded({requestNumber: 5, kind: 'begin', path: 'samples/kick.wav'}),
      decoded({requestNumber: 6, kind: 'append', length: 300}),
      decoded({
        requestNumber: 7,
        kind: 'append',
        memory: 'sampleRam',
        offset: 2048,
        length: 65_536,
      }),
      decoded({requestNumber: 8, kind: 'commit'}),
    ]);
  });
});

describe('IO_BUFFER', () => {
  test('is as big as budget.toml says', async () => {
    let budget = await readFile(
      new URL('../../../packages/groovebox-core/budget.toml', import.meta.url),
      'utf8',
    );

    expect(IO_BUFFER).toBe(
      Number(/^io_buffer = ([\d_]+)/mu.exec(budget)?.[1]?.replaceAll('_', '')),
    );
  });
});
