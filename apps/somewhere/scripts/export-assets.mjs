// Re-export public/map.json and public/shop-interior.json from their Tiled
// sources in assets/. Requires the Tiled editor (https://www.mapeditor.org);
// the Windows installer does not add it to PATH, hence the ProgramFiles
// probe. The tileset is not exported here: `npm run sync-tilesets` owns
// public/tileset.json and public/tileset.png, and two writers would fight. If
// Tiled's preference "Embed tilesets" or a non-CSV layer format sneaks into
// an export, the vitest guard at the end fails loud.
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

function resolveTiled() {
  if (process.env.TILED_PATH) {
    return process.env.TILED_PATH;
  }

  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['tiled']);

    return 'tiled';
  } catch {
    // not on PATH; fall through to the default install location
  }

  if (process.env.ProgramFiles) {
    let candidate = join(process.env.ProgramFiles, 'Tiled', 'tiled.exe');

    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Tiled CLI not found! Install Tiled (https://www.mapeditor.org) and add it to PATH, or point the TILED_PATH environment variable at the tiled executable.',
  );
}

let tiled = resolveTiled();

for (let name of ['map', 'shop-interior']) {
  let mapPath = join(root, `public/${name}.json`);

  execFileSync(tiled, ['--export-map', 'json', join(root, `assets/${name}.tmx`), mapPath]);

  // The export keeps the TMX-side reference (tileset.tsx); the runtime loads
  // the JSON export next to the public/ image, so rewrite it before validating.
  let map = JSON.parse(readFileSync(mapPath, 'utf8'));

  for (let tileset of map.tilesets) {
    // Tiled writes the tileset source as a path relative to public/<name>.json
    // (e.g. "../assets/tileset.tsx"); the runtime only ever loads the JSON
    // tileset next to the map, so drop the directory and swap the extension.
    tileset.source &&= basename(tileset.source).replace(/\.tsx$/, '.json');
  }

  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
}

// Validate with the runtime schemas: vitest resolves the TS imports that a
// plain node script cannot.
execFileSync('npx', ['vitest', 'run', 'tests/exportedAssets.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// eslint-disable-next-line no-console -- one-shot export script
console.log('exported public/map.json and public/shop-interior.json');
