// 270 art px of vertical world reproduces the current ×4 feel on a 1080p DPR-1 screen; the clamp
// keeps degenerate viewports usable.
export function getPixelScale(height: number) {
  return Math.min(8, Math.max(2, Math.round(height / 270)));
}
