import * as pixi from 'pixi.js';

import {palette} from './palette.js';
import {type MapData} from './travel.js';

export type MapLayer = 'streets' | 'trams';

type Layers = Readonly<Record<MapLayer, readonly pixi.GraphicsContext[]>>;

// Kept by the data object for the game's life: a layer is built once, and no picture destroys it.
const layersByMap = new WeakMap<MapData, Layers>();

// Every line is one subpath of one path, stroked once, so that nothing is drawn twice.
function createLines(lines: number[][], color: number): pixi.GraphicsContext {
  let context = new pixi.GraphicsContext();

  for (let line of lines) {
    let [x, y] = line;

    if (x === undefined || y === undefined) {
      continue;
    }

    context.moveTo(x, y);

    for (let index = 2; index + 1 < line.length; index += 2) {
      context.lineTo(line[index] ?? x, line[index + 1] ?? y);
    }
  }

  return context.stroke({color, width: 1, pixelLine: true});
}

function createParks(rings: number[][]): pixi.GraphicsContext {
  let context = new pixi.GraphicsContext();

  for (let ring of rings) {
    context.poly(ring, true);
  }

  return context.fill(palette.ground);
}

/** The drawings of each layer, bottom first, built from the data on first use and kept. */
export function getMapLayers(map: MapData): Layers {
  let layers = layersByMap.get(map);

  if (layers === undefined) {
    let parks = createParks(map.parks);
    let minorStreets = createLines(map.minorStreets, palette.shade);
    let mainStreets = createLines(map.mainStreets, palette.line);
    let railway = createLines(map.railway, palette.dim);
    let rivers = createLines(map.rivers, palette.blue);
    let tramLines = createLines(map.tramLines, palette.magenta);

    layers = {
      streets: [parks, minorStreets, mainStreets, railway, rivers],
      trams: [parks, railway, rivers, tramLines],
    };
    layersByMap.set(map, layers);
  }

  return layers;
}
