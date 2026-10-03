/** TBD */
export function getPixelScale(height: number) {
  // 270 art pixels on vertical axis produces ×4 scale on a 1080p DPR-1 screen
  return Math.min(8, Math.max(2, Math.round(height / 270)));
}
