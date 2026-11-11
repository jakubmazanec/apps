// Builds the browser crate into one `.wasm` file by one of two routes:
// - `node build.js`: the pinned stable toolchain with the `wasm32-wasip1-threads` target, into
//   `build/groovebox-core.wasm`.
// - `node build.js --fallback`: a pinned nightly that rebuilds the core library for
//   `wasm32-unknown-unknown`, into `build/fallback/groovebox-core.wasm`.
// `node build.js --toolchains` installs the toolchains of both routes.
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

const FALLBACK_TOOLCHAIN = 'nightly-2026-11-01';

const run = (command, args) => {
  execFileSync(command, args, {cwd: import.meta.dirname, stdio: 'inherit'});
};

const build = (target, directory, toolchain = [], flags = []) => {
  run('cargo', [
    ...toolchain,
    'build',
    '--release',
    '--target',
    target,
    '-p',
    'groovebox-browser',
    ...flags,
  ]);
  mkdirSync(join(import.meta.dirname, directory), {recursive: true});
  copyFileSync(
    join(import.meta.dirname, 'target', target, 'release', 'groovebox_browser.wasm'),
    join(import.meta.dirname, directory, 'groovebox-core.wasm'),
  );
};

const [mode] = process.argv.slice(2);

if (mode === undefined) {
  build('wasm32-wasip1-threads', 'build');
} else if (mode === '--fallback') {
  build(
    'wasm32-unknown-unknown',
    'build/fallback',
    [`+${FALLBACK_TOOLCHAIN}`],
    ['-Z', 'build-std=core,panic_abort'],
  );
} else if (mode === '--toolchains') {
  run('rustup', ['toolchain', 'install']);
  run('rustup', [
    'toolchain',
    'install',
    FALLBACK_TOOLCHAIN,
    '--profile',
    'minimal',
    '--component',
    'rust-src',
  ]);
} else {
  throw new Error(`Unknown option ${mode}.`);
}
