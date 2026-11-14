import {PANEL_PIXELS} from './panelLayout.js';

export function expandFrame(
  pixels: Uint8Array,
  palette: Uint8Array,
  rgba: Uint8ClampedArray,
): void {
  for (let [index, pixel] of pixels.entries()) {
    rgba[index * 4] = palette[pixel * 3] ?? 0;
    rgba[index * 4 + 1] = palette[pixel * 3 + 1] ?? 0;
    rgba[index * 4 + 2] = palette[pixel * 3 + 2] ?? 0;
    rgba[index * 4 + 3] = 255;
  }
}

// The whole panel at the largest whole zoom that fits the viewport, at least 1: one screen pixel is
// `zoom` device pixels. Below zoom 1 the page scrolls
export function fitPanel(
  viewport: {width: number; height: number},
  devicePixelRatio: number,
): {zoom: number; cssWidth: number; cssHeight: number; exact: boolean} {
  let zoom = Math.max(
    1,
    Math.floor(
      Math.min(
        (viewport.width * devicePixelRatio) / PANEL_PIXELS.width,
        (viewport.height * devicePixelRatio) / PANEL_PIXELS.height,
      ),
    ),
  );

  return {
    zoom,
    cssWidth: (PANEL_PIXELS.width * zoom) / devicePixelRatio,
    cssHeight: (PANEL_PIXELS.height * zoom) / devicePixelRatio,
    exact: Number.isInteger(devicePixelRatio),
  };
}
