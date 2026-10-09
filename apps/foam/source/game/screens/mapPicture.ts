import * as pixi from 'pixi.js';

import {type MapFrame} from '../core/fitMapFrame.js';
import {game} from '../core/game.js';
import {getMapLayers, type MapLayer} from '../core/mapLayers.js';
import {palette} from '../core/palette.js';
import {LIGHT_REACH} from '../core/placeMapButtons.js';
import {type MapData} from '../core/travel.js';

export type MapMarks = {
  /** The light's pixel, or null for a place without a position. */
  you: {x: number; y: number} | null;

  /** The centre of the selected place's button, or null for none. */
  selected: {x: number; y: number} | null;

  /** The top-left corners of the place buttons, from `placeMapButtons`. */
  buttons: Array<{x: number; y: number}>;
};

const LAYERS: readonly MapLayer[] = ['streets', 'trams'];

/** The pixels of a straight line from one pixel to another, both included (Bresenham). */
function getLinePixels(
  from: {x: number; y: number},
  to: {x: number; y: number},
): Array<{x: number; y: number}> {
  let pixels: Array<{x: number; y: number}> = [];
  let x = Math.round(from.x);
  let y = Math.round(from.y);
  let endX = Math.round(to.x);
  let endY = Math.round(to.y);
  let dx = Math.abs(endX - x);
  let dy = -Math.abs(endY - y);
  let stepX = x < endX ? 1 : -1;
  let stepY = y < endY ? 1 : -1;
  let error = dx + dy;

  for (;;) {
    pixels.push({x, y});

    if (x === endX && y === endY) {
      return pixels;
    }

    let doubled = 2 * error;

    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }

    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

// Creates a texture as large as the map in art pixels. Dynamic, so that the sprite that shows it
// follows its size.
function createMapTexture(): pixi.RenderTexture {
  return pixi.RenderTexture.create({
    width: 1,
    height: 1,
    resolution: 1,
    scaleMode: 'nearest',
    antialias: false,
    dynamic: true,
  });
}

// Draws each of the map's layers into a texture of its own, once for a map size, and the dotted
// line, the buttons' black squares and the player's light into a transparent texture above it,
// again whenever they change, so that a journey or a selection never draws the streets again. Two
// sprites show them. Nothing it draws is added to a screen. The layers' contexts are shared for
// the game's life, so only the Graphics that use them are destroyed, never the contexts.
export class MapPicture {
  readonly view: pixi.Container = new pixi.Container();

  /** Shows the texture of the current layer. */
  readonly #layerSprite: pixi.Sprite;

  /** Each layer drawn at the last frame. */
  readonly #layerTextures: Readonly<Record<MapLayer, pixi.RenderTexture>> = {
    streets: createMapTexture(),
    trams: createMapTexture(),
  };

  readonly #map: MapData;
  readonly #marks: pixi.Graphics = new pixi.Graphics();

  /** The container the marks are drawn from. */
  readonly #marksScene: pixi.Container = new pixi.Container();

  readonly #marksTexture: pixi.RenderTexture = createMapTexture();

  constructor({map}: {map: MapData}) {
    this.#map = map;
    this.#layerSprite = new pixi.Sprite(this.#layerTextures.streets);
    this.#marksScene.addChild(this.#marks);
    this.view.addChild(this.#layerSprite, new pixi.Sprite(this.#marksTexture));
  }

  destroy(): void {
    this.view.destroy({children: true});
    // No options, so that the marks' own context goes with them: they created it.
    this.#marks.destroy();
    this.#marksScene.destroy();

    for (let texture of [...Object.values(this.#layerTextures), this.#marksTexture]) {
      texture.destroy(true);
    }
  }

  /** Draws every layer at this frame into its texture; the marks need drawing again after it. */
  drawLayers(frame: MapFrame): void {
    let width = Math.max(1, frame.width);
    let height = Math.max(1, frame.height);
    let scale = 1 / frame.metresPerPixel;
    let scene = new pixi.Container();

    scene.scale.set(scale);
    scene.position.set(width / 2 - frame.centre.x * scale, height / 2 - frame.centre.y * scale);

    for (let layer of LAYERS) {
      let texture = this.#layerTextures[layer];

      texture.resize(width, height);

      for (let context of getMapLayers(this.#map)[layer]) {
        scene.addChild(new pixi.Graphics(context));
      }

      game.app.renderer.render({
        container: scene,
        target: texture,
        clear: true,
        clearColor: palette.black,
      });
      // Pixi's Graphics.destroy does not stop a Graphics listening to its context, so the shared
      // context would keep it for the game's life: a fresh empty context, never drawn, takes its
      // place first and is collected with it. No options: the shared one stays.
      for (let child of scene.removeChildren()) {
        if (child instanceof pixi.Graphics) {
          child.context = new pixi.GraphicsContext();
        }

        child.destroy();
      }
    }

    scene.destroy();
    this.#marksTexture.resize(width, height);
  }

  /** Draws the dotted line, the buttons' black squares and the light into the marks' texture. */
  drawMarks({you, selected, buttons}: MapMarks): void {
    let marks = this.#marks.clear();

    if (you !== null && selected !== null) {
      for (let [index, pixel] of getLinePixels(you, selected).entries()) {
        if (index % 2 === 0) {
          marks.rect(pixel.x, pixel.y, 1, 1);
        }
      }

      marks.fill(palette.dim);
    }

    for (let button of buttons) {
      marks.rect(button.x - 1, button.y - 1, 10, 10);
    }

    marks.fill(palette.black);

    if (you !== null) {
      // The offsets are from `you`, so the light looks the same at every place.
      let lights = {white: [] as number[][], cyan: [] as number[][], blue: [] as number[][]};

      for (let dy = -LIGHT_REACH; dy <= LIGHT_REACH; dy += 1) {
        for (let dx = -LIGHT_REACH; dx <= LIGHT_REACH; dx += 1) {
          let distance = Math.hypot(dx, dy);
          let isEven = (dx + dy) % 2 === 0;
          let pixel = [Math.round(you.x) + dx, Math.round(you.y) + dy];

          if (distance <= 1.2) {
            lights.white.push(pixel);
          } else if (distance <= 2.6) {
            (isEven ? lights.cyan : lights.blue).push(pixel);
          } else if (distance <= 4.1 && isEven) {
            lights.blue.push(pixel);
          }
        }
      }

      for (let [name, pixels] of Object.entries(lights) as Array<
        [keyof typeof lights, number[][]]
      >) {
        for (let [x, y] of pixels) {
          marks.rect(x ?? 0, y ?? 0, 1, 1);
        }

        marks.fill(palette[name]);
      }
    }

    // Transparent where there is no mark, so that the layer shows through.
    game.app.renderer.render({
      container: this.#marksScene,
      target: this.#marksTexture,
      clear: true,
      clearColor: [0, 0, 0, 0],
    });
  }

  /** Shows a layer drawn by `drawLayers`. */
  showLayer(layer: MapLayer): void {
    this.#layerSprite.texture = this.#layerTextures[layer];
  }
}
