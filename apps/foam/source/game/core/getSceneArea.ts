// Layout sizes shared by the night screen and its windows, in art pixels.

/** Space kept free at the edges of the screen. */
export const MARGIN = 4;

/** One line of monogram. */
export const LINE_HEIGHT = 12;

/** A button with a one-line label: the line plus 2 of padding twice. */
export const BUTTON_HEIGHT = 16;

/** Below this screen width the top row has two lines. */
export const NARROW_WIDTH = 240;

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
