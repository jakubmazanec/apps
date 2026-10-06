// Layout sizes shared by the night screen and its windows, in art pixels.

/** Space kept free at the edges of the screen. */
export const MARGIN = 4;

/** One line of monogram. */
export const LINE_HEIGHT = 12;

/** Padding of a button left and right. A button is as wide as its label plus this twice. */
export const BUTTON_PADDING_X = 6;

/** Padding of a button above and below its label. */
export const BUTTON_PADDING_Y = 2;

/** A button with a one-line label: the line of 12 plus `BUTTON_PADDING_Y` twice. */
export const BUTTON_HEIGHT = 16;

/** Below this screen width the top row has two lines. */
export const NARROW_WIDTH = 240;

/** A window's padding left and right, shared by every window. */
export const WINDOW_PADDING_X = 12;

/** A window's padding above and below, shared by every window. */
export const WINDOW_PADDING_Y = 8;

/** The story window's width on a screen wide enough for it. */
export const WINDOW_WIDTH = 300;

/** Every letter of monogram, regular and italic, advances by this much. */
export const GLYPH_WIDTH = 6;

export type SceneArea = {
  /** Distance from the top of the screen to the area. */
  top: number;

  width: number;
  height: number;
};

// The scene area is the screen under the top row. The top row is a margin, the
// buttons and a margin; on a narrow screen the status line and one more margin
// follow.
export function getSceneArea(screenWidth: number, screenHeight: number): SceneArea {
  let top = MARGIN + BUTTON_HEIGHT + MARGIN;

  if (screenWidth < NARROW_WIDTH) {
    top += LINE_HEIGHT + MARGIN;
  }

  return {top, width: screenWidth, height: screenHeight - top};
}
