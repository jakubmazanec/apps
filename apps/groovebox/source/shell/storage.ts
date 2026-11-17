// The kinds of the core's storage requests and the statuses of its replies, numbered as the
// request record and `control_queue_reply` number them
const KINDS = ['list', 'read', 'load', 'begin', 'append', 'commit', 'delete', 'free'] as const;

export const STATUSES = ['done', 'more', 'missing', 'full', 'failed'] as const;

// The bytes of the core's I/O buffer: `io_buffer` in budget.toml
const IO_BUFFER = 65_536;

// A request as the core's `RequestRecord` holds it. A field the request does not have is 0
export type StorageRequest = {
  requestNumber: number;
  kind: (typeof KINDS)[number];
  memory: 'io' | 'sampleRam';
  offset: number;
  length: number;
  from: number;
  into: number;
  at: number;
  path: string;
};

export type StorageReply = {status: (typeof STATUSES)[number]; value: number};

// The file that `begin` started replacing and copies of the bytes appended to it since, which
// `commit` writes in one go, so that a replace without a commit leaves nothing behind
let replacing: {path: string; parts: Array<Uint8Array<ArrayBuffer>>} | undefined;

// The request record at `address`: little-endian, `number` at byte 0, `kind` at 4, `memory` at 8,
// `offset` at 12, `length` at 16, `from` at 20, `into` at 24, `at` at 32, the path's length at 40
// and the path at 44
export function readRequest(memory: ArrayBufferLike, address: number): StorageRequest {
  let view = new DataView(memory, address);
  let word = (at: number) => view.getUint32(at, true);

  return {
    requestNumber: word(0),
    kind: KINDS[word(4)] as StorageRequest['kind'],
    memory: word(8) === 0 ? 'io' : 'sampleRam',
    offset: word(12),
    length: word(16),
    from: word(20),
    into: word(24),
    at: Number(view.getBigUint64(32, true)),
    // A copy, as a TextDecoder does not read shared memory
    path: new TextDecoder().decode(Uint8Array.from(new Uint8Array(memory, address + 44, word(40)))),
  };
}

async function folderAt(root: FileSystemDirectoryHandle, names: string[], create = false) {
  let folder = root;

  for (let name of names) {
    folder = await folder.getDirectoryHandle(name, {create});
  }

  return folder;
}

// The folder that holds the last name of `path`, made with the folders above it when `create`,
// and that name
async function parentOf(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<[FileSystemDirectoryHandle, string]> {
  let names = path.split('/');

  return [await folderAt(root, names.slice(0, -1), create), names.at(-1) ?? ''];
}

export async function fileAt(root: FileSystemDirectoryHandle, path: string): Promise<File> {
  let [folder, name] = await parentOf(root, path);

  return (await folder.getFileHandle(name)).getFile();
}

// Writes `data` to `path`, making its folders, all or nothing: a write that fails leaves the old
// file, or no file where there was none
export async function writeFile(root: FileSystemDirectoryHandle, path: string, data: Blob) {
  let [folder, name] = await parentOf(root, path, true);
  let existed = await folder
    .getFileHandle(name)
    .then(() => true)
    .catch(() => false);
  let writable = await (await folder.getFileHandle(name, {create: true})).createWritable();

  try {
    await writable.write(data);
    await writable.close();
  } catch (error) {
    await writable.abort();

    if (!existed) {
      await folder.removeEntry(name);
    }

    throw error;
  }
}

// Every file under `folder` at any depth, as its path from `folder` and its size
async function filesUnder(
  folder: FileSystemDirectoryHandle,
  prefix = '',
): Promise<Array<[path: string, size: number]>> {
  let found: Array<[string, number]> = [];

  for await (let [name, handle] of folder.entries()) {
    found.push(
      ...(handle.kind === 'file' ?
        [[`${prefix}${name}`, (await handle.getFile()).size] as [string, number]]
      : await filesUnder(handle, `${prefix}${name}/`)),
    );
  }

  return found;
}

// The order of UTF-8 bytes, in which the core's storage lists paths
function compareBytes(a: Uint8Array, b: Uint8Array) {
  for (let index = 0; index < a.length && index < b.length; index++) {
    if (a[index] !== b[index]) {
      return (a[index] ?? 0) - (b[index] ?? 0);
    }
  }

  return a.length - b.length;
}

// Deletes `names` from `folder`, a file or a folder with everything in it, and then the folders
// that leaves empty, but never `samples` or `tmp` at the top
async function remove(
  folder: FileSystemDirectoryHandle,
  [name = '', ...rest]: string[],
  top: boolean,
): Promise<void> {
  if (rest.length === 0) {
    await folder.removeEntry(name, {recursive: true});

    return;
  }

  let inside = await folder.getDirectoryHandle(name);

  await remove(inside, rest, false);

  if (!(top && (name === 'samples' || name === 'tmp')) && (await inside.keys().next()).done) {
    await folder.removeEntry(name);
  }
}

/* eslint-disable default-case, @typescript-eslint/consistent-return -- the switch covers every kind, which TypeScript checks */
// Carries out `request` on the folder `root`, as the core's `Request` says, with the I/O buffer
// and the sample RAM at `addresses` of `memory`. A missing entry is `missing`, a full storage
// `full` and any other error `failed`
// eslint-disable-next-line @typescript-eslint/max-params -- the request, where it is carried out and the memory it reads and writes
export async function carryOut(
  request: StorageRequest,
  root: FileSystemDirectoryHandle,
  memory: ArrayBufferLike,
  addresses: {io: number; sampleRam: number},
): Promise<StorageReply> {
  try {
    switch (request.kind) {
      case 'append': {
        if (!replacing) {
          throw new Error('An append without a begin');
        }

        // A copy, as the core reuses its memory after the reply
        replacing.parts.push(
          Uint8Array.from(
            new Uint8Array(memory, addresses[request.memory] + request.offset, request.length),
          ),
        );

        return {status: 'done', value: 0};
      }

      case 'begin': {
        await folderAt(root, request.path.split('/').slice(0, -1), true);
        replacing = {path: request.path, parts: []};

        return {status: 'done', value: 0};
      }

      case 'commit': {
        let begun = replacing;

        replacing = undefined;

        if (!begun) {
          throw new Error('A commit without a begin');
        }

        await writeFile(root, begun.path, new Blob(begun.parts));

        return {status: 'done', value: 0};
      }

      case 'delete': {
        await remove(root, request.path.split('/'), true);

        return {status: 'done', value: 0};
      }

      case 'free': {
        let {quota = 0, usage = 0} = await navigator.storage.estimate();

        return {status: 'done', value: Math.max(0, quota - usage)};
      }

      case 'list': {
        let encoder = new TextEncoder();
        let files = (await filesUnder(await folderAt(root, request.path.split('/'))))
          .map(([path, size]) => [encoder.encode(path), size] as const)
          .sort(([a], [b]) => compareBytes(a, b));
        let view = new DataView(memory, addresses.io, IO_BUFFER);
        let end = 0;
        let written = 0;

        // As many whole records as fit: the path's length, the path and the size
        for (let [path, size] of files.slice(request.from)) {
          if (end + 1 + path.length + 4 > IO_BUFFER) {
            break;
          }

          view.setUint8(end, path.length);
          new Uint8Array(memory, addresses.io + end + 1).set(path);
          view.setUint32(end + 1 + path.length, size, true);
          end += 1 + path.length + 4;
          written += 1;
        }

        return {status: request.from + written < files.length ? 'more' : 'done', value: written};
      }

      case 'load':
      case 'read': {
        let file = await fileAt(root, request.path);
        let bytes = await file.slice(request.at, request.at + request.length).bytes();

        new Uint8Array(
          memory,
          request.kind === 'read' ? addresses.io : addresses.sampleRam + request.into,
        ).set(bytes);

        return {status: 'done', value: bytes.length};
      }
    }
  } catch (error) {
    let {name} = error as Error;

    return {
      status:
        name === 'NotFoundError' ? 'missing'
        : name === 'QuotaExceededError' ? 'full'
        : 'failed',
      value: 0,
    };
  }
}
/* eslint-enable default-case, @typescript-eslint/consistent-return */
