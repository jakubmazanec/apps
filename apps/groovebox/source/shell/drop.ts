// A file that a drop hands to the core: a .wav in any case, not a hidden one (answer 10)
function isWav(name: string) {
  return !name.startsWith('.') && name.toLowerCase().endsWith('.wav');
}

// The .wav files of `entry`, at `path` in the drop: a file, or every file of a folder at any depth,
// its entries in name order
async function filesOf(
  entry: FileSystemEntry,
  path: string,
): Promise<Array<{path: string; file: File}>> {
  if (entry.isFile) {
    return isWav(entry.name) ?
        [
          {
            path,
            file: await new Promise<File>((resolve, reject) => {
              (entry as FileSystemFileEntry).file(resolve, reject);
            }),
          },
        ]
      : [];
  }

  let reader = (entry as FileSystemDirectoryEntry).createReader();
  let entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];

  // A reader gives the entries a batch at a time, and an empty batch at the end
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    entries.push(...batch);
  } while (batch.length > 0);

  entries.sort((a, b) => (a.name < b.name ? -1 : 1));

  return (
    await Promise.all(entries.map(async (inside) => filesOf(inside, `${path}/${inside.name}`)))
  ).flat();
}

// The .wav files of a drop with their paths in it, the items in their order: a loose file at the
// top, a folder's files under its name (answer 6). The items are taken before anything waits, as
// they are empty once the drop event is over. A synthetic drop has no entries, only loose files
export async function droppedFiles(
  items: DataTransferItemList,
): Promise<Array<{path: string; file: File}>> {
  let taken = Array.from(items, (item) => item.webkitGetAsEntry() ?? item.getAsFile());

  return (
    await Promise.all(
      taken.map(async (entry) => {
        if (entry instanceof File) {
          return isWav(entry.name) ? [{path: entry.name, file: entry}] : [];
        }

        return entry ? filesOf(entry, entry.name) : [];
      }),
    )
  ).flat();
}
