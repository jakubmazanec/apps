import {expandFrame} from './present.js';

// The 480 × 272 frame `pixels` through the core's `palette` as a PNG, each screen pixel a `scale` ×
// `scale` block: 1,920 × 1,088 at the default 4 (answer 21)
export async function pictureBlob(
  pixels: Uint8Array,
  palette: Uint8Array,
  scale = 4,
): Promise<Blob> {
  let image = new ImageData(480, 272);
  let canvas = new OffscreenCanvas(480 * scale, 272 * scale);
  let drawing = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

  expandFrame(pixels, palette, image.data);
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(await createImageBitmap(image), 0, 0, canvas.width, canvas.height);

  return canvas.convertToBlob({type: 'image/png'});
}
