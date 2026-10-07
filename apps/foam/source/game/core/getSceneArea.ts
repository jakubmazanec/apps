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

/**
 * Below this screen width a window takes its narrow layout: the travel window puts a destination's
 * minutes and price under its name. The top row has a width of its own, `TOP_ROW_WIDTH`.
 */
export const NARROW_WIDTH = 240;

/** A window's padding left and right, shared by every window. */
export const WINDOW_PADDING_X = 12;

/** A window's padding above and below, shared by every window. */
export const WINDOW_PADDING_Y = 8;

/** The story window's width on a screen wide enough for it. */
export const WINDOW_WIDTH = 300;

/** Every letter of monogram, regular and italic, advances by this much. */
export const GLYPH_WIDTH = 6;

/** The narrowest screen's width (292 device pixels at scale 2). */
export const NARROWEST_WIDTH = 146;

/** The Menu button at the right end of the top row: its label plus `BUTTON_PADDING_X` twice. */
export const MENU_BUTTON_WIDTH = 'Menu'.length * GLYPH_WIDTH + 2 * BUTTON_PADDING_X;

/**
 * Characters of the status line in the top row: the time (5), the money to four digits with a sign
 * and " Kč" (8), the state of mind (5), and the two gaps of three spaces between them.
 */
export const STATUS_ROOM = 24;

// The place button with the longest label the checker lets through: the room getLabelRoom() gives
// it on the narrowest screen, beside Menu (margin, place button, margin, Menu, margin).
// getLabelRoom.ts imports this file's sizes, so the room is worked out here from the same sizes;
// importing it from there would make a cycle.
const PLACE_LABEL_ROOM = Math.floor(
  (NARROWEST_WIDTH - 3 * MARGIN - MENU_BUTTON_WIDTH - 2 * BUTTON_PADDING_X) / GLYPH_WIDTH,
);
const WIDEST_PLACE_BUTTON = PLACE_LABEL_ROOM * GLYPH_WIDTH + 2 * BUTTON_PADDING_X;

/**
 * From this screen width the top row is one line: a margin, the place button with the longest
 * label, a margin, the status line, a margin, the Menu button and a margin. Below it the status
 * line stands on a second line under the place button.
 */
export const TOP_ROW_WIDTH =
  MARGIN +
  WIDEST_PLACE_BUTTON +
  MARGIN +
  STATUS_ROOM * GLYPH_WIDTH +
  MARGIN +
  MENU_BUTTON_WIDTH +
  MARGIN;

export type SceneArea = {
  /** Distance from the top of the screen to the area. */
  top: number;

  width: number;
  height: number;
};

// The scene area is the screen under the top row. The top row is a margin, the
// buttons and a margin; on a screen narrower than the one-line top row the
// status line and one more margin follow.
export function getSceneArea(screenWidth: number, screenHeight: number): SceneArea {
  let top = MARGIN + BUTTON_HEIGHT + MARGIN;

  if (screenWidth < TOP_ROW_WIDTH) {
    top += LINE_HEIGHT + MARGIN;
  }

  return {top, width: screenWidth, height: screenHeight - top};
}
