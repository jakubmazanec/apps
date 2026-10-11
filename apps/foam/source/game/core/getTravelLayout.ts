import {
  BUTTON_HEIGHT,
  MARGIN,
  NARROW_WIDTH,
  WINDOW_PADDING_X,
  WINDOW_PADDING_Y,
  WINDOW_WIDTH,
} from './getSceneArea.js';

/** The width of the side column of the side-by-side layout. */
export const SIDE_COLUMN_WIDTH = 120;

/**
 * The title block's height of screens/windowTitle.ts, which imports the game and so cannot be
 * imported here; a browser test checks that the two are equal.
 */
export const TITLE_HEIGHT = 15;

const TITLE_GAP = 4;
const BLOCK_GAP = 8;

export type TravelLayout = {
  kind: 'sideBySide' | 'stacked';
  window: {width: number; height: number};

  /** The width of the row of ways, the destination button and "Back". */
  controlWidth: number;

  /** Whether a destination's numbers stand under its name. */
  isNarrow: boolean;
};

/** The window's layout for a screen. */
export function getTravelLayout(screenWidth: number, screenHeight: number): TravelLayout {
  let height = screenHeight - 2 * MARGIN;

  if (screenWidth > screenHeight) {
    return {
      kind: 'sideBySide',
      window: {width: screenWidth - 2 * MARGIN, height},
      controlWidth: SIDE_COLUMN_WIDTH,
      isNarrow: true,
    };
  }

  let width = Math.min(WINDOW_WIDTH, screenWidth - 2 * MARGIN);

  return {
    kind: 'stacked',
    window: {width, height},
    controlWidth: Math.max(1, width - 2 * WINDOW_PADDING_X),
    isNarrow: screenWidth < NARROW_WIDTH,
  };
}

/** The map's size in a window of this layout, with a destination button of this height. */
export function getMapSize(
  layout: TravelLayout,
  destinationHeight: number,
): {width: number; height: number} {
  let insideHeight = layout.window.height - 2 * WINDOW_PADDING_Y - TITLE_HEIGHT - TITLE_GAP;

  if (layout.kind === 'sideBySide') {
    return {
      width: Math.max(
        1,
        layout.window.width - 2 * WINDOW_PADDING_X - BLOCK_GAP - SIDE_COLUMN_WIDTH,
      ),
      height: Math.max(1, insideHeight),
    };
  }

  // Under the title: the row, the map, the destination and "Back", 8 apart.
  return {
    width: layout.controlWidth,
    height: Math.max(
      1,
      insideHeight -
        BUTTON_HEIGHT -
        BLOCK_GAP -
        BLOCK_GAP -
        destinationHeight -
        BLOCK_GAP -
        BUTTON_HEIGHT,
    ),
  };
}
