// Imports a downloaded pack archive from assets/raw/ into organized,
// filtered assets under assets/extracted/<pack-name>/. Deterministic
// path-based rules only.

import {unzipSync} from 'fflate';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {argv, exit} from 'node:process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

export function slugifyPackName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replaceAll(/([\da-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

export type Classification =
  | {action: 'drop'; rule: 'extension'; extension: string}
  | {action: 'drop'; rule: 'folder-name'; segment: string}
  | {action: 'flag'}
  | {action: 'keep'};

// Junk tokens are matched at non-letter boundaries inside a segment:
// "every_packs_screenshots" and "Demo_v2" are junk, "demon_idle.png" and
// "demolition.png" are not.
const JUNK_SEGMENT_PATTERN =
  /(^|[^a-z])(screenshots?|previews?|promo(tional)?|marketing|demo)([^a-z]|$)/i;
const DENIED_EXTENSIONS = new Set(['.exe', '.htm', '.html', '.pdf', '.url']);
// Allowed extensions by category: images (.bmp, .gif, .jpeg, .jpg, .png, .tga,
// .webp), audio (.flac, .mp3, .ogg, .wav), fonts (.otf, .ttf, .woff), Tiled
// formats (.tmj, .tmx, .tsj, .tsx), source sprites (.ase, .aseprite).
const KEPT_EXTENSIONS = new Set([
  '.ase',
  '.aseprite',
  '.bmp',
  '.flac',
  '.gif',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.ogg',
  '.otf',
  '.png',
  '.tga',
  '.tmj',
  '.tmx',
  '.tsj',
  '.tsx',
  '.ttf',
  '.wav',
  '.webp',
  '.woff',
]);

export function classifyEntry(entryPath: string): Classification {
  let segments = entryPath.split('/').filter((segment) => segment.length > 0);
  let junkSegment = segments.find((segment) => JUNK_SEGMENT_PATTERN.test(segment));

  if (junkSegment !== undefined) {
    return {action: 'drop', rule: 'folder-name', segment: junkSegment};
  }

  let fileName = segments.at(-1) ?? '';
  let extensionMatch = /\.[^.]+$/.exec(fileName);
  let extension = extensionMatch ? extensionMatch[0].toLowerCase() : '';

  if (DENIED_EXTENSIONS.has(extension)) {
    return {action: 'drop', rule: 'extension', extension};
  }

  if (KEPT_EXTENSIONS.has(extension)) {
    return {action: 'keep'};
  }

  return {action: 'flag'};
}

export function findWrapperPrefix(entryPaths: string[]): string | null {
  let firstSegments = new Set<string>();

  for (let entryPath of entryPaths) {
    let separatorIndex = entryPath.indexOf('/');

    if (separatorIndex === -1) {
      // A file sits at the archive root, so there is no wrapper.
      return null;
    }

    firstSegments.add(entryPath.slice(0, separatorIndex));
  }

  if (firstSegments.size !== 1) {
    return null;
  }

  return firstSegments.values().next().value ?? null;
}

export type RunOptions = {
  appRoot: string;
  argv: string[];
  log: (message: string) => void;
};

export type ArchiveFile = {name: string; contents: Uint8Array};

// Decompresses the archive into memory. Directory entries and entries whose
// names contain a ".." segment (which the write loop would resolve outside the
// pack tree) are excluded from the listing, mirroring the sanitization the old
// `unzip` binary used to do at extraction time.
function readArchiveFiles(archivePath: string): ArchiveFile[] | null {
  try {
    return Object.entries(unzipSync(readFileSync(archivePath)))
      .filter(
        ([name]) =>
          !name.endsWith('/') && !name.split(/[/\\]/).some((segment) => segment === '..'),
      )
      .map(([name, contents]) => ({name, contents}))
      .sort((a, b) =>
        a.name < b.name ? -1
        : a.name > b.name ? 1
        : 0,
      );
  } catch {
    return null;
  }
}

export function run({appRoot, argv: args, log}: RunOptions): number {
  let values;

  try {
    ({values} = parseArgs({
      args,
      options: {
        'dry-run': {type: 'boolean', default: false},
      },
    }));
  } catch (error) {
    log(String(error));

    return 2;
  }

  try {
    let dryRun = values['dry-run'];
    let rawRoot = join(appRoot, 'assets/raw');
    let archiveNames =
      existsSync(rawRoot) ?
        readdirSync(rawRoot, {withFileTypes: true})
          .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
          .map((entry) => entry.name)
          .sort()
      : [];

    if (archiveNames.length === 0) {
      log('nothing to import');

      return 0;
    }

    if (dryRun) {
      log('dry run — nothing will be written');
    }

    let failures = 0;

    for (let archiveName of archiveNames) {
      let archivePath = join(rawRoot, archiveName);
      let packName = slugifyPackName(archiveName);
      let targetRoot = join(appRoot, 'assets/extracted', packName);
      let targetLabel = `assets/extracted/${packName}/`;

      if (!archiveName.toLowerCase().endsWith('.zip')) {
        log(`${archiveName}: unsupported archive format; only .zip is supported`);
        failures += 1;

        continue;
      }

      if (existsSync(targetRoot) && readdirSync(targetRoot).length > 0) {
        log(
          `${archiveName} -> ${targetLabel}: already imported; delete the folder and re-run to re-import`,
        );

        continue;
      }

      let files = readArchiveFiles(archivePath);

      if (files === null) {
        log(`${archiveName}: corrupt or unreadable archive`);
        failures += 1;

        continue;
      }

      let entries = files.map((file) => file.name);
      let wrapperPrefix = findWrapperPrefix(entries);
      let keptFiles: ArchiveFile[] = [];
      let droppedCount = 0;
      let flaggedCount = 0;

      log(`${archiveName} -> ${targetLabel}`);

      for (let file of files) {
        let strippedEntry = wrapperPrefix ? file.name.slice(wrapperPrefix.length + 1) : file.name;
        let classification = classifyEntry(strippedEntry);

        if (classification.action === 'keep') {
          keptFiles.push(file);
          log(`  keep ${strippedEntry}`);
        } else if (classification.action === 'flag') {
          flaggedCount += 1;
          log(`  flag ${strippedEntry} (unrecognized — review manually)`);
        } else if (classification.rule === 'folder-name') {
          droppedCount += 1;
          log(`  drop ${strippedEntry} (folder name "${classification.segment}")`);
        } else {
          droppedCount += 1;
          log(`  drop ${strippedEntry} (extension ${classification.extension})`);
        }
      }

      log(`  kept ${keptFiles.length}, dropped ${droppedCount}, flagged ${flaggedCount}`);

      if (dryRun || keptFiles.length === 0) {
        continue;
      }

      for (let file of keptFiles) {
        let strippedEntry = wrapperPrefix ? file.name.slice(wrapperPrefix.length + 1) : file.name;
        let destination = join(targetRoot, strippedEntry);

        mkdirSync(dirname(destination), {recursive: true});
        writeFileSync(destination, file.contents);
      }

      log(`  wrote ${keptFiles.length} files to ${targetLabel}`);
    }

    return failures > 0 ? 1 : 0;
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));

    return 2;
  }
}

/* c8 ignore start -- entry-module guard, exercised by `npm run extract-assets` */
if (argv[1] && import.meta.url === new URL(`file://${argv[1]}`).href) {
  exit(
    run({
      appRoot: fileURLToPath(new URL('../', import.meta.url)),
      argv: argv.slice(2),
      // eslint-disable-next-line no-console -- this is the CLI's output
      log: (message: string) => console.log(message),
    }),
  );
}

/* c8 ignore stop */
