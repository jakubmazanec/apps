import * as pixi from 'pixi.js';

import {type MapFrame} from '../core/fitMapFrame.js';
import {game} from '../core/game.js';
import {getMapLayers, type MapLayer} from '../core/mapLayers.js';
import {palette} from '../core/palette.js';
import {LIGHT_REACH} from '../core/placeMapButtons.js';
import {type MapData} from '../core/travel.js';

export type MapDrawing = {
  layer: MapLayer;
  frame: MapFrame;

  /** The light's pixel, or null for a place without a position. */
  you: {x: number; y: number} | null;

  /** The centre of the selected place's button, or null for none. */
  selected: {x: number; y: number} | null;

  /** The top-left corners of the place buttons, from `placeMapButtons`. */
  buttons: Array<{x: number; y: number}>;
};

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

// Draws the map's layer, the dotted line, the buttons' black squares and the player's light into
// a texture as large as the map in art pixels, which one sprite shows. Nothing it draws is added
// to a screen. The layers' contexts are shared for the game's life, so only the Graphics that
// use them are destroyed, never the contexts.
export class MapPicture {
  readonly view: pixi.Container = new pixi.Container();

  #layer: MapLayer | null = null;

  readonly #layerContainer: pixi.Container = new pixi.Container();

  readonly #map: MapData;

  readonly #marks: pixi.Graphics = new pixi.Graphics();

  readonly #scene: pixi.Container = new pixi.Container();

  readonly #texture: pixi.RenderTexture;

  constructor({map}: {map: MapData}) {
    this.#map = map;
    // Dynamic, so that the sprite follows the texture's size.
    this.#texture = pixi.RenderTexture.create({
      width: 1,
      height: 1,
      resolution: 1,
      scaleMode: 'nearest',
      antialias: false,
      dynamic: true,
    });
    this.#scene.addChild(this.#layerContainer, this.#marks);
    this.view.addChild(new pixi.Sprite(this.#texture));
  }

  destroy(): void {
    this.view.destroy({children: true});
    // No options, so that the marks' own context goes with them: they created it.
    this.#marks.destroy();
    this.#removeLayer();
    this.#scene.destroy({children: true});
    this.#texture.destroy(true);
  }

  /** Draws the layer at this frame, the dotted line and the light into the texture. */
  draw({layer, frame, you, selected, buttons}: MapDrawing): void {
    let width = Math.max(1, frame.width);
    let height = Math.max(1, frame.height);
    let scale = 1 / frame.metresPerPixel;

    this.#texture.resize(width, height);
    this.#setLayer(layer);
    this.#layerContainer.scale.set(scale);
    this.#layerContainer.position.set(
      width / 2 - frame.centre.x * scale,
      height / 2 - frame.centre.y * scale,
    );
    this.#drawMarks({you, selected, buttons});
    game.app.renderer.render({
      container: this.#scene,
      target: this.#texture,
      clear: true,
      clearColor: palette.black,
    });
  }

  #drawMarks({you, selected, buttons}: Pick<MapDrawing, 'buttons' | 'selected' | 'you'>): void {
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

    if (you === null) {
      return;
    }

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

    for (let [name, pixels] of Object.entries(lights) as Array<[keyof typeof lights, number[][]]>) {
      for (let [x, y] of pixels) {
        marks.rect(x ?? 0, y ?? 0, 1, 1);
      }

      marks.fill(palette[name]);
    }
  }

  // Destroys the layer's Graphics. Pixi's Graphics.destroy does not stop a Graphics listening to
  // its context, so the shared context would keep it for the game's life: a fresh empty context,
  // never drawn, takes its place first and is collected with it. No options: the shared one stays.
  #removeLayer(): void {
    for (let child of this.#layerContainer.removeChildren()) {
      if (child instanceof pixi.Graphics) {
        child.context = new pixi.GraphicsContext();
      }

      child.destroy();
    }
  }

  #setLayer(layer: MapLayer): void {
    if (layer === this.#layer) {
      return;
    }

    this.#removeLayer();

    for (let context of getMapLayers(this.#map)[layer]) {
      this.#layerContainer.addChild(new pixi.Graphics(context));
    }

    this.#layer = layer;
  }
}
