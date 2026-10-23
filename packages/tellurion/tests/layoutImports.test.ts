import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

// Reading or writing a container's `layout`, passing a `layout` option to a Pixi constructor and
// listening for the 'layout' event all need the feature the @pixi/layout root installs on every
// Pixi container. Without it they silently touch a plain property or wait for an event that never
// comes. COMPONENTS_IMPORT_PATTERN captures the clause between `import` and `from`, and a clause
// that brings in only types, e.g. `{type LayoutContainer}`, compiles to nothing.
const SOURCE_DIRECTORY = fileURLToPath(new URL('../source', import.meta.url));
const LAYOUT_IMPORT = "import '@pixi/layout';";
const LAYOUT_USE_PATTERN = /\.layout\b|\blayout: |\.on\('layout'/;
const COMPONENTS_IMPORT_PATTERN = /^import (?!type )([^;]*) from '@pixi\/layout\/components';$/gm;
const TYPE_ONLY_CLAUSE_PATTERN = /^{(?:\s*type \w+(?: as \w+)?,?)*\s*}$/;

// Every .ts/.tsx file under source/, as a posix path relative to source/.
async function collectSourceFiles(): Promise<string[]> {
  let entries = await readdir(SOURCE_DIRECTORY, {recursive: true});

  return entries
    .map((entry) => entry.split(path.sep).join('/'))
    .filter((entry) => /\.tsx?$/.test(entry));
}

// A component from @pixi/layout/components sets its own `layout` when it is created, but that
// entry does not install the feature, so a module that creates or extends one depends on it too.
function importsLayoutComponent(source: string): boolean {
  return [...source.matchAll(COMPONENTS_IMPORT_PATTERN)].some(
    (match) => !TYPE_ONLY_CLAUSE_PATTERN.test(match[1] ?? ''),
  );
}

function dependsOnLayout(source: string): boolean {
  return LAYOUT_USE_PATTERN.test(source) || importsLayoutComponent(source);
}

// The source files that depend on the layout feature, split by whether they import it.
async function collectLayoutDependents(): Promise<{all: string[]; withoutImport: string[]}> {
  let files = await collectSourceFiles();
  let sources = await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(path.join(SOURCE_DIRECTORY, file), 'utf8'),
    })),
  );
  let dependents = sources.filter(({source}) => dependsOnLayout(source));

  return {
    all: dependents.map(({file}) => file),
    withoutImport: dependents
      .filter(({source}) => !source.split('\n').includes(LAYOUT_IMPORT))
      .map(({file}) => file),
  };
}

// The package declares `"sideEffects": false`, so a consumer's bundler keeps a module's
// `import '@pixi/layout'` only when it keeps the module. A consumer that uses the UI without `Game`
// would otherwise lose the layout feature in a production build while it works in development.
describe('layout imports', () => {
  test('every module that depends on the layout feature imports @pixi/layout', async () => {
    let {withoutImport} = await collectLayoutDependents();

    expect(withoutImport).toEqual([]);
  });

  test('finds the modules that depend on the layout feature', async () => {
    let {all} = await collectLayoutDependents();

    expect(all).toContain('ui/Text.ts');
    expect(all).toContain('ui/Panel.ts');
    expect(all).toContain('utilities/attachHitArea.ts');
  });

  test('does not count type-only imports from @pixi/layout/components', () => {
    expect(
      importsLayoutComponent("import {type LayoutContainer} from '@pixi/layout/components';"),
    ).toBe(false);
    expect(importsLayoutComponent("import {LayoutContainer} from '@pixi/layout/components';")).toBe(
      true,
    );
    expect(
      importsLayoutComponent(
        "import {type LayoutContainer, LayoutView} from '@pixi/layout/components';",
      ),
    ).toBe(true);
  });
});
