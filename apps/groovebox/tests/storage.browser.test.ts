import {beforeEach, describe, expect, onTestFinished, test, vitest} from 'vitest';

import {carryOut, type StorageRequest, writeFile} from '../source/shell/storage.js';

// The core's I/O buffer and sample RAM in one shared memory, the sample RAM after the I/O buffer
const ADDRESSES = {io: 0, sampleRam: 65_536};

let memory: SharedArrayBuffer;
let root: FileSystemDirectoryHandle;

// A request with the fields it does not have at 0, as the core sends it
async function run(fields: Partial<StorageRequest> & Pick<StorageRequest, 'kind'>) {
  return carryOut(
    {
      requestNumber: 0,
      memory: 'io',
      offset: 0,
      length: 0,
      from: 0,
      into: 0,
      at: 0,
      path: '',
      ...fields,
    },
    root,
    memory,
    ADDRESSES,
  );
}

async function put(path: string, bytes: number[]) {
  await writeFile(root, path, new Blob([Uint8Array.from(bytes)]));
}

async function deleted(path: string) {
  return (await run({kind: 'delete', path})).status;
}

// Every folder (with a "/" at the end) and every file with its bytes under `folder`
async function tree(
  folder = root,
  prefix = '',
): Promise<Array<[path: string, bytes: number[] | undefined]>> {
  let found: Array<[string, number[] | undefined]> = [];

  for await (let [name, handle] of folder.entries()) {
    if (handle.kind === 'file') {
      found.push([`${prefix}${name}`, [...(await (await handle.getFile()).bytes())]]);
    } else {
      found.push([`${prefix}${name}/`, undefined], ...(await tree(handle, `${prefix}${name}/`)));
    }
  }

  return found.sort(([a], [b]) => (a < b ? -1 : 1));
}

// The records of a List page in the I/O buffer: each file's path and size
function records(count: number) {
  let view = new DataView(memory, ADDRESSES.io);
  let at = 0;

  return Array.from({length: count}, () => {
    let length = view.getUint8(at);
    let path = new TextDecoder().decode(
      Uint8Array.from(new Uint8Array(memory, ADDRESSES.io + at + 1, length)),
    );
    let size = view.getUint32(at + 1 + length, true);

    at += 1 + length + 4;

    return [path, size] as const;
  });
}

describe(carryOut, () => {
  beforeEach(async () => {
    let site = await navigator.storage.getDirectory();
    let name = crypto.randomUUID();

    memory = new SharedArrayBuffer(ADDRESSES.sampleRam + 8192);
    root = await site.getDirectoryHandle(name, {create: true});

    return async () => {
      await site.removeEntry(name, {recursive: true});
    };
  });

  test('a replace without commit leaves the old file', async () => {
    await put('samples/drums/808/kick.wav', [1, 2]);

    await expect(run({kind: 'commit'})).resolves.toStrictEqual({status: 'failed', value: 0});
    await expect(run({kind: 'append', length: 1})).resolves.toStrictEqual({
      status: 'failed',
      value: 0,
    });
    await expect(run({kind: 'begin', path: 'samples/loops/new/kick.wav'})).resolves.toStrictEqual({
      status: 'done',
      value: 0,
    });
    await expect(run({kind: 'begin', path: 'samples/drums/808/kick.wav'})).resolves.toStrictEqual({
      status: 'done',
      value: 0,
    });

    new Uint8Array(memory, ADDRESSES.io, 3).set([3, 4, 5]);
    new Uint8Array(memory, ADDRESSES.sampleRam + 2048, 1).set([6]);

    await expect(run({kind: 'append', offset: 1, length: 2})).resolves.toStrictEqual({
      status: 'done',
      value: 0,
    });

    new Uint8Array(memory, ADDRESSES.io, 3).fill(0);

    await expect(
      run({kind: 'append', memory: 'sampleRam', offset: 2048, length: 1}),
    ).resolves.toStrictEqual({status: 'done', value: 0});
    await expect(
      run({kind: 'read', path: 'samples/drums/808/kick.wav', length: 8}),
    ).resolves.toStrictEqual({
      status: 'done',
      value: 2,
    });
    expect([...new Uint8Array(memory, ADDRESSES.io, 3)]).toStrictEqual([1, 2, 0]);

    // The first Begin made its folders and was never committed
    await expect(tree()).resolves.toStrictEqual([
      ['samples/', undefined],
      ['samples/drums/', undefined],
      ['samples/drums/808/', undefined],
      ['samples/drums/808/kick.wav', [1, 2]],
      ['samples/loops/', undefined],
      ['samples/loops/new/', undefined],
    ]);
    await expect(run({kind: 'commit'})).resolves.toStrictEqual({status: 'done', value: 0});
    await expect(tree()).resolves.toContainEqual(['samples/drums/808/kick.wav', [4, 5, 6]]);
    await expect(run({kind: 'commit'})).resolves.toStrictEqual({status: 'failed', value: 0});
  });

  test('a commit past the quota is full and writes nothing', async () => {
    await put('samples/kick.wav', [1]);

    let write = vitest
      .spyOn(FileSystemWritableFileStream.prototype, 'write')
      .mockRejectedValue(new DOMException('', 'QuotaExceededError'));

    onTestFinished(() => {
      write.mockRestore();
    });

    for (let path of ['samples/kick.wav', 'samples/new.wav']) {
      await run({kind: 'begin', path});
      await run({kind: 'append', length: 3});

      await expect(run({kind: 'commit'})).resolves.toStrictEqual({status: 'full', value: 0});
    }

    write.mockRestore();

    await expect(tree()).resolves.toStrictEqual([
      ['samples/', undefined],
      ['samples/kick.wav', [1]],
    ]);
  });

  test('list pages are sorted by path and continue from their index', async () => {
    // Folders that make each record of the files inside them 254 bytes long, so that 258 fill a
    // page and 260 do not fit
    let long = `${'x'.repeat(120)}/${'y'.repeat(120)}`;
    let folder = await root.getDirectoryHandle('samples', {create: true});
    let inside = await (
      await folder.getDirectoryHandle('x'.repeat(120), {create: true})
    ).getDirectoryHandle('y'.repeat(120), {create: true});

    await Promise.all(
      Array.from({length: 260}, async (_, index) =>
        inside.getFileHandle(`${String(index).padStart(3, '0')}.wav`, {create: true}),
      ),
    );
    await put('samples/b.wav', [0, 0, 0]);
    await put(
      'samples/a/c.wav',
      Array.from({length: 300}, () => 0),
    );
    await put('samples/a.wav', [0]);
    await put('samples/Z.wav', [0, 0]);
    // UTF-8 puts U+FF5A before U+1F600, where UTF-16 puts it after
    await put('samples/\u{FF5A}.wav', [0]);
    await put('samples/\u{1F600}.wav', [0]);
    await put('tmp/1/d.wav', [0, 0, 0, 0]);

    let listed = [
      ['Z.wav', 2],
      ['a.wav', 1],
      ['a/c.wav', 300],
      ['b.wav', 3],
      ...Array.from({length: 260}, (_, index) => [
        `${long}/${String(index).padStart(3, '0')}.wav`,
        0,
      ]),
      ['\u{FF5A}.wav', 1],
      ['\u{1F600}.wav', 1],
    ];
    let first = await run({kind: 'list', path: 'samples'});
    let firstPage = records(first.value);

    expect(first).toStrictEqual({status: 'more', value: 4 + 257});

    let second = await run({kind: 'list', path: 'samples', from: first.value});

    expect(second).toStrictEqual({status: 'done', value: 5});
    expect([...firstPage, ...records(second.value)]).toStrictEqual(listed);
    await expect(run({kind: 'list', path: 'samples', from: 300})).resolves.toStrictEqual({
      status: 'done',
      value: 0,
    });
    await expect(run({kind: 'list', path: 'tmp/1'})).resolves.toStrictEqual({
      status: 'done',
      value: 1,
    });
    expect(records(1)).toStrictEqual([['d.wav', 4]]);
    await expect(run({kind: 'list', path: 'loops'})).resolves.toStrictEqual({
      status: 'missing',
      value: 0,
    });
  });

  test('delete removes the folders it empties but not samples', async () => {
    await put('samples/drums/808/kick.wav', [1]);
    await put('samples/drums/clap.wav', [2]);
    await put('tmp/1/drums/hat.wav', [3]);
    await put('tmp/2/snare.wav', [4]);

    await expect(deleted('samples/drums/808/kick.wav')).resolves.toBe('done');
    await expect(tree()).resolves.toStrictEqual([
      ['samples/', undefined],
      ['samples/drums/', undefined],
      ['samples/drums/clap.wav', [2]],
      ['tmp/', undefined],
      ['tmp/1/', undefined],
      ['tmp/1/drums/', undefined],
      ['tmp/1/drums/hat.wav', [3]],
      ['tmp/2/', undefined],
      ['tmp/2/snare.wav', [4]],
    ]);
    await expect(deleted('samples/drums/clap.wav')).resolves.toBe('done');
    await expect(deleted('tmp/1')).resolves.toBe('done');
    await expect(deleted('tmp/2/snare.wav')).resolves.toBe('done');
    await expect(deleted('tmp/3')).resolves.toBe('missing');
    await expect(deleted('samples/drums/clap.wav')).resolves.toBe('missing');
    await expect(tree()).resolves.toStrictEqual([
      ['samples/', undefined],
      ['tmp/', undefined],
    ]);
    await expect(deleted('tmp')).resolves.toBe('done');
    await expect(tree()).resolves.toStrictEqual([['samples/', undefined]]);
  });

  test('load copies a slice straight into shared memory', async () => {
    await put(
      'samples/kick.wav',
      Array.from({length: 100}, (_, index) => index),
    );

    await expect(
      run({kind: 'load', path: 'samples/kick.wav', at: 10, length: 20, into: 2048}),
    ).resolves.toStrictEqual({status: 'done', value: 20});
    expect([...new Uint8Array(memory, ADDRESSES.sampleRam + 2047, 22)]).toStrictEqual([
      0,
      ...Array.from({length: 20}, (_, index) => 10 + index),
      0,
    ]);
    await expect(
      run({kind: 'load', path: 'samples/kick.wav', at: 95, length: 20, into: 4096}),
    ).resolves.toStrictEqual({status: 'done', value: 5});
    expect([...new Uint8Array(memory, ADDRESSES.sampleRam + 4096, 6)]).toStrictEqual([
      95, 96, 97, 98, 99, 0,
    ]);
    await expect(
      run({kind: 'read', path: 'samples/kick.wav', at: 98, length: 8}),
    ).resolves.toStrictEqual({
      status: 'done',
      value: 2,
    });
    expect([...new Uint8Array(memory, ADDRESSES.io, 2)]).toStrictEqual([98, 99]);
    await expect(
      run({kind: 'load', path: 'samples/snare.wav', length: 8, into: 4096}),
    ).resolves.toStrictEqual({status: 'missing', value: 0});
  });
});
