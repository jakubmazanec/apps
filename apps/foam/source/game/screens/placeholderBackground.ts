import * as pixi from 'pixi.js';
import {type Renderable} from 'tellurion';

const BAND_COLORS = [0x1a1a2e, 0x2a2350, 0x3b2a4a];

// The picture of the place until phase 3 brings the animated background: three
// horizontal bands of equal height.
export class PlaceholderBackground implements Renderable {
  readonly view: pixi.Container = new pixi.Container();

  readonly #bands = new pixi.Graphics();

  constructor() {
    this.view.addChild(this.#bands);
  }

  destroy(): void {
    this.view.destroy({children: true});
  }

  resize(width: number, height: number): void {
    this.#bands.clear();

    for (let [index, color] of BAND_COLORS.entries()) {
      // Whole pixels, so that no band edge falls between two art pixels.
      let top = Math.round((index * height) / BAND_COLORS.length);
      let bottom = Math.round(((index + 1) * height) / BAND_COLORS.length);

      this.#bands.rect(0, top, width, bottom - top).fill(color);
    }
  }

  // Nothing moves yet. The method exists because the screen's view takes a
  // Renderable, which is updated every frame.
  update(): void {}
}
