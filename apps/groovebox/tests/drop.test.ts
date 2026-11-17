import {describe, expect, test} from 'vitest';

import {droppedFiles} from '../source/shell/drop.js';

// What a test drops: a file by its name, or a folder by its name and what it holds
type Dropped = {folder: string; holds: Dropped[]} | string;

// An entry as Chromium gives it. A folder's reader gives its entries unsorted, in two batches,
// then an empty one
function entry(dropped: Dropped): FileSystemEntry {
  if (typeof dropped === 'string') {
    return {
      isFile: true,
      isDirectory: false,
      name: dropped,
      file: (success: FileCallback) => {
        success(new File([dropped], dropped));
      },
    } as unknown as FileSystemFileEntry;
  }

  let batches = [dropped.holds.slice(0, 2).map(entry), dropped.holds.slice(2).map(entry), []];

  return {
    isFile: false,
    isDirectory: true,
    name: dropped.folder,
    createReader: () => ({
      readEntries: (success: FileSystemEntriesCallback) => {
        success(batches.shift() ?? []);
      },
    }),
  } as unknown as FileSystemDirectoryEntry;
}

// The items of a drop. A synthetic drop has no entries: its file comes from `getAsFile`
function items(...dropped: Array<Dropped | {synthetic: string}>) {
  return dropped.map((item): Pick<DataTransferItem, 'getAsFile' | 'webkitGetAsEntry'> =>
    typeof item === 'object' && 'synthetic' in item ?
      {webkitGetAsEntry: () => null, getAsFile: () => new File([item.synthetic], item.synthetic)}
    : {webkitGetAsEntry: () => entry(item), getAsFile: () => null},
  ) as unknown as DataTransferItemList;
}

async function pathsAndNames(dropped: DataTransferItemList) {
  return (await droppedFiles(dropped)).map(({path, file}) => [path, file.name]);
}

describe(droppedFiles, () => {
  test('keeps .wav in any case and skips hidden and other files', async () => {
    let dropped = items(
      'kick.wav',
      'readme.txt',
      'SNARE.WAV',
      '._kick.wav',
      {synthetic: 'clap.Wav'},
      '.hidden.wav',
      'kick.wav.txt',
      {synthetic: 'notes.md'},
      'hat.wav',
    );

    await expect(pathsAndNames(dropped)).resolves.toStrictEqual([
      ['kick.wav', 'kick.wav'],
      ['SNARE.WAV', 'SNARE.WAV'],
      ['clap.Wav', 'clap.Wav'],
      ['hat.wav', 'hat.wav'],
    ]);
  });

  test('walks folders in name order and keeps their paths', async () => {
    let dropped = items(
      'zap.wav',
      {
        folder: 'my kit',
        holds: [
          'snare.wav',
          {folder: 'b', holds: ['z.wav', 'a.wav', {folder: 'empty', holds: []}]},
          'notes.txt',
          'a.wav',
          '.DS_Store',
        ],
      },
      'bass.wav',
    );

    await expect(pathsAndNames(dropped)).resolves.toStrictEqual([
      ['zap.wav', 'zap.wav'],
      ['my kit/a.wav', 'a.wav'],
      ['my kit/b/a.wav', 'a.wav'],
      ['my kit/b/z.wav', 'z.wav'],
      ['my kit/snare.wav', 'snare.wav'],
      ['bass.wav', 'bass.wav'],
    ]);
  });
});
