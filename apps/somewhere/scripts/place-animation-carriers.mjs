// Place the fire animation carriers on the map's `animations` layer, plus the
// scenery they burn on, in both the Tiled source (assets/map.tmx, CSV layers)
// and the runtime export (public/map.json, plain arrays). The engine animates
// any cell holding a carrier tile (region.start), so a carrier per half per
// hearth puts a flame over each one. Verify-then-write, all-or-nothing: a cell
// that is not empty as expected aborts the run before either file is touched.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// The camp's large fire: the log pile (gid 1503) on `stuff`, so it collides and
// y-sorts like the other scenery, and the 481/545 strip's two carriers over
// it: gid 482 for the top half, gid 546 for the bottom half in the pile's own
// cell. It stands on the axis the barrels and cook-pots share, in the open
// middle of the floor.
const CARRIERS = [
  {layer: 'stuff', x: 8, y: 28, from: 0, to: 1503},
  {layer: 'animations', x: 8, y: 27, from: 0, to: 482},
  {layer: 'animations', x: 8, y: 28, from: 0, to: 546},
];

function patchTmx(text) {
  let newline = text.includes('\r\n') ? '\r\n' : '\n';

  return text.replaceAll(/<layer\b([^>]*)>([\s\S]*?)<\/layer>/gu, (whole, attributes, body) => {
    let name = /name="([^"]*)"/u.exec(attributes)?.[1];
    let data = new RegExp(`<data encoding="csv">${newline}([\\s\\S]*?)${newline}</data>`, 'u').exec(
      body,
    )?.[1];
    let cells = CARRIERS.filter((entry) => entry.layer === name);

    if (name === undefined || cells.length === 0) {
      return whole;
    }

    if (data === undefined) {
      throw new Error(`assets/map.tmx ${name} layer has no <data encoding="csv"> block!`);
    }

    let rows = data
      .split(/\r?\n/u)
      .filter((line) => line !== '')
      .map((line) =>
        line
          .split(',')
          .filter((token) => token !== '')
          .map(Number),
      );

    for (let cell of cells) {
      if ((rows[cell.y]?.[cell.x] ?? 0) !== cell.from) {
        throw new Error(
          `assets/map.tmx ${name} layer cell (${cell.x}, ${cell.y}) holds gid ${rows[cell.y]?.[cell.x]}, expected ${cell.from}!`,
        );
      }

      rows[cell.y][cell.x] = cell.to;
    }

    let rebuilt = rows
      .map((row, index) => row.join(',') + (index < rows.length - 1 ? ',' : ''))
      .join(newline);

    return `<layer${attributes}>${body.replace(data, rebuilt)}</layer>`;
  });
}

function patchMapJson(text) {
  let map = JSON.parse(text);

  for (let cell of CARRIERS) {
    let layer = map.layers.find((entry) => entry.type === 'tilelayer' && entry.name === cell.layer);

    if (layer === undefined) {
      throw new Error(`public/map.json has no tilelayer named ${cell.layer}!`);
    }

    let index = cell.y * map.width + cell.x;

    if (layer.data[index] !== cell.from) {
      throw new Error(
        `public/map.json ${cell.layer} layer cell (${cell.x}, ${cell.y}) holds gid ${layer.data[index]}, expected ${cell.from}!`,
      );
    }

    layer.data[index] = cell.to;
  }

  return `${JSON.stringify(map, null, 2)}\n`;
}

// Both patches are computed before either write: a stale map aborts both files.
let tmx = patchTmx(readFileSync(`${root}/assets/map.tmx`, 'utf8'));
let mapJson = patchMapJson(readFileSync(`${root}/public/map.json`, 'utf8'));

writeFileSync(`${root}/assets/map.tmx`, tmx);
writeFileSync(`${root}/public/map.json`, mapJson);

// eslint-disable-next-line no-console -- one-shot placement script
console.log('placed fire animation carriers on assets/map.tmx and public/map.json');
