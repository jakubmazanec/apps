const SCREEN_WIDTH = 480;
const SCREEN_HEIGHT = 272;

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

export function fitScreen(
  viewport: {width: number; height: number},
  devicePixelRatio: number,
): {scale: number; cssWidth: number; cssHeight: number; exact: boolean} {
  let scale = Math.max(
    1,
    Math.floor(
      Math.min(
        (viewport.width * devicePixelRatio) / SCREEN_WIDTH,
        (viewport.height * devicePixelRatio) / SCREEN_HEIGHT,
      ),
    ),
  );

  return {
    scale,
    cssWidth: (SCREEN_WIDTH * scale) / devicePixelRatio,
    cssHeight: (SCREEN_HEIGHT * scale) / devicePixelRatio,
    exact: Number.isInteger(devicePixelRatio),
  };
}
