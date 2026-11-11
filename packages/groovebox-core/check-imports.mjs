// Checks the two builds of the browser crate: each has the one import `env.memory` and exactly
// the exports below, and the two list the same names and kinds.
import {deepStrictEqual} from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const PATHS = ['build/groovebox-core.wasm', 'build/fallback/groovebox-core.wasm'];

const IMPORTS = [{module: 'env', name: 'memory', kind: 'memory'}];

const FUNCTIONS = [
  'control_queue_input',
  'control_replay_applied',
  'control_step',
  'control_applied_number',
  'control_applied_sample',
  'screen_pointer',
  'front_pointer',
  'palette_pointer',
  'position_pointer',
  'wake_pointer',
  'audio_stack_top',
  'audio_position',
  'audio_fingerprint',
  'audio_render',
];

const EXPORTS = [
  {name: '__stack_pointer', kind: 'global'},
  {name: 'memory', kind: 'memory'},
  ...FUNCTIONS.map((name) => ({name, kind: 'function'})),
];

const byName = (a, b) => (a.name < b.name ? -1 : 1);

const shapes = PATHS.map((path) => {
  const module = new WebAssembly.Module(readFileSync(join(import.meta.dirname, path)));
  const shape = {
    imports: WebAssembly.Module.imports(module),
    exports: WebAssembly.Module.exports(module).toSorted(byName),
  };
  console.log(path, JSON.stringify(shape));
  deepStrictEqual(shape.imports, IMPORTS);
  deepStrictEqual(shape.exports, EXPORTS.toSorted(byName));
  return shape;
});

deepStrictEqual(shapes[0], shapes[1]);
console.log('Both builds have the same imports and exports.');
