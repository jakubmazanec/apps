/**
 * Picks the session's integer render scale from the viewport size in device px
 * (CSS px × devicePixelRatio). `Game` runs it exactly once, at the top of
 * `init()`; the result must be an integer >= 1 and is fixed until reload.
 */
export type ChoosePixelScale = (viewport: {width: number; height: number}) => number;

// 270 art px of vertical world reproduces the current ×4 feel on a 1080p DPR-1
// screen; the clamp keeps degenerate viewports usable.
export const defaultChoosePixelScale: ChoosePixelScale = ({height}) =>
  Math.min(8, Math.max(2, Math.round(height / 270)));
