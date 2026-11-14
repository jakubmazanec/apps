import {describe, expect, test} from 'vitest';

import {pictureBlob} from '../source/shell/picture.js';

describe(pictureBlob, () => {
  test('a picture is 1920 × 1088 and each screen pixel a 4 × 4 block', async () => {
    // Every screen pixel differs from its neighbours, and every palette entry from the others
    let pixels = Uint8Array.from(
      {length: 480 * 272},
      (_, index) => (index * 7 + Math.floor(index / 480)) % 256,
    );
    let palette = Uint8Array.from({length: 256 * 3}, (_, index) =>
      index % 3 === 1 ? 255 - Math.floor(index / 3) : Math.floor(index / 3),
    );
    let blob = await pictureBlob(pixels, palette);
    let picture = await createImageBitmap(blob);
    let canvas = new OffscreenCanvas(picture.width, picture.height);
    let drawing = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

    drawing.drawImage(picture, 0, 0);

    let rgba = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
    let wrong = 0;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        let colour = (pixels[Math.floor(y / 4) * 480 + Math.floor(x / 4)] ?? 0) * 3;
        let at = (y * canvas.width + x) * 4;

        if (
          rgba[at] !== palette[colour] ||
          rgba[at + 1] !== palette[colour + 1] ||
          rgba[at + 2] !== palette[colour + 2] ||
          rgba[at + 3] !== 255
        ) {
          wrong += 1;
        }
      }
    }

    expect(blob.type).toBe('image/png');
    expect([picture.width, picture.height]).toEqual([1920, 1088]);
    expect(wrong).toBe(0);
  });
});
