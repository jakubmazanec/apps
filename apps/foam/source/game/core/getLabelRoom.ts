import {
  BUTTON_PADDING_X,
  GLYPH_WIDTH,
  MARGIN,
  MENU_BUTTON_WIDTH,
  NARROWEST_WIDTH,
  WINDOW_PADDING_X,
  WINDOW_WIDTH,
} from './getSceneArea.js';

/** A word longer than this does not fit a line of the story window on the narrowest screen. */
export const WORD_ROOM = 16;

export type LabelRoom = {
  /** Characters of a window's title. */
  title: number;

  /** Characters of the place button. */
  placeButton: number;

  /** Characters of a scene button. */
  sceneButton: number;
};

/** How many characters fit a window's title, the place button and a scene button. */
export function getLabelRoom(screenWidth = NARROWEST_WIDTH): LabelRoom {
  let titleRoom =
    Math.min(WINDOW_WIDTH, Math.floor(screenWidth - 2 * MARGIN)) - 2 * WINDOW_PADDING_X;
  // The place button shares the top row with the Menu button: margin, place button, gap, Menu,
  // margin.
  let placeRoom = screenWidth - 3 * MARGIN - MENU_BUTTON_WIDTH - 2 * BUTTON_PADDING_X;
  let sceneRoom = screenWidth - 2 * MARGIN - 2 * BUTTON_PADDING_X;

  return {
    title: Math.floor(titleRoom / GLYPH_WIDTH),
    placeButton: Math.floor(placeRoom / GLYPH_WIDTH),
    sceneButton: Math.floor(sceneRoom / GLYPH_WIDTH),
  };
}
