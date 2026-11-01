import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

const SOURCE_DIRECTORY = fileURLToPath(new URL('../source', import.meta.url));
const STAR_EXPORT_LINE_PATTERN = /^export (?:type )?\* from '\.\/[^']+\.js';$/;
const VALUE_EXPORT_PATTERN =
  /^export (?:default|const|let|var|function|async function|class|abstract class|enum|namespace|declare|import)\b|^export {|^export \*/m;

// Every .ts/.tsx file under source/ that the barrel must cover, as a posix path relative to
// source/. `internals` directories and the barrel itself are skipped.
async function collectSourceFiles(): Promise<string[]> {
  let entries = await readdir(SOURCE_DIRECTORY, {recursive: true});

  return entries
    .map((entry) => entry.split(path.sep).join('/'))
    .filter((entry) => /\.tsx?$/.test(entry))
    .filter((entry) => entry !== 'main.ts')
    .filter((entry) => !entry.split('/').includes('internals'));
}

// The same files without the extension.
async function collectModules(): Promise<string[]> {
  let files = await collectSourceFiles();

  return files.map((file) => file.replace(/\.tsx?$/, ''));
}

async function readBarrel(): Promise<string> {
  return readFile(path.join(SOURCE_DIRECTORY, 'main.ts'), 'utf8');
}

// The barrel lines that are not a star re-export. A line such as
// `export {x} from './ui/internals/y.js'` escapes the module lists below and can expose an internal
// module.
async function collectNonStarLines(): Promise<string[]> {
  let barrel = await readBarrel();

  return barrel
    .split('\n')
    .filter((line) => line.trim() !== '' && !STAR_EXPORT_LINE_PATTERN.test(line));
}

// The linter writes `export type *` for modules that only export types, so both forms count.
async function collectExports(): Promise<string[]> {
  let barrel = await readBarrel();

  return [...barrel.matchAll(/^export (?:type )?\* from '\.\/(.+)\.js';$/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

// `export type *` erases every value the module exports, so a module behind one must not have any.
// The linter does not catch a value added to such a module later.
async function collectTypeOnlyModulesWithValues(): Promise<string[]> {
  let barrel = await readBarrel();
  let files = await collectSourceFiles();
  let typeOnlyModules = [...barrel.matchAll(/^export type \* from '\.\/(.+)\.js';$/gm)].flatMap(
    (match) => (match[1] === undefined ? [] : [match[1]]),
  );
  let offenders = await Promise.all(
    typeOnlyModules.map(async (module) => {
      let file = files.find((candidate) => candidate.replace(/\.tsx?$/, '') === module);
      let source = await readFile(path.join(SOURCE_DIRECTORY, file ?? `${module}.ts`), 'utf8');

      return VALUE_EXPORT_PATTERN.test(source) ? [module] : [];
    }),
  );

  return offenders.flat();
}

describe('main barrel', () => {
  test('contains nothing but star re-exports', async () => {
    await expect(collectNonStarLines()).resolves.toEqual([]);
  });

  test('exports every public module and nothing else', async () => {
    expect(new Set(await collectExports())).toEqual(new Set(await collectModules()));
  });

  test('exports every module only once', async () => {
    let exported = await collectExports();

    expect(exported).toHaveLength(new Set(exported).size);
  });

  test('does not hide runtime exports behind export type *', async () => {
    await expect(collectTypeOnlyModulesWithValues()).resolves.toEqual([]);
  });
});
