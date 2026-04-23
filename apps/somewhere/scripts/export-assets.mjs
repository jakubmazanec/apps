// Re-export public/map.json and public/tileset.json from the Tiled sources
// in assets/. Requires the Tiled editor (https://www.mapeditor.org); the
// Windows installer does not add it to PATH, hence the ProgramFiles probe.
// If Tiled's preference "Embed tilesets" or a non-CSV layer format sneaks
// into an export, the vitest guard at the end fails loud.
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

execFileSync(tiled, [
  '--export-tileset',
  'json',
  join(root, 'assets/tileset.tsx'),
  join(root, 'public/tileset.json'),
]);
execFileSync(tiled, [
  '--export-map',
  'json',
  join(root, 'assets/map.tmx'),
  join(root, 'public/map.json'),
]);

// The exports keep the TMX-side references (tileset.tsx, the assets/ image);
// the runtime loads the JSON export next to the public/ image, so rewrite
// both before validating.
let mapPath = join(root, 'public/map.json');
let map = JSON.parse(readFileSync(mapPath, 'utf8'));

for (let tileset of map.tilesets) {
  // Tiled writes the tileset source as a path relative to public/map.json
  // (e.g. "../assets/tileset.tsx"); the runtime only ever loads tileset.json
  // next to map.json, so drop the directory and swap the extension.
  tileset.source &&= basename(tileset.source).replace(/\.tsx$/, '.json');
}

writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);

let tilesetPath = join(root, 'public/tileset.json');
let tileset = JSON.parse(readFileSync(tilesetPath, 'utf8'));

tileset.image = 'tileset.png';

writeFileSync(tilesetPath, `${JSON.stringify(tileset, null, 2)}\n`);

// Validate with the runtime schemas: vitest resolves the TS imports that a
// plain node script cannot.
execFileSync('npx', ['vitest', 'run', 'tests/exportedAssets.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

// eslint-disable-next-line no-console -- one-shot export script
console.log('exported public/map.json and public/tileset.json');
