import {
  CONTROLS,
  DISPLAY,
  MM_PER_PIXEL,
  PANEL_PIXELS,
  type PanelControl,
  type Rectangle,
  toScreenPixels,
} from './panelLayout.js';
import {encoderName, STEP_BUTTONS} from './protocol.js';

export function expandFrame(
  pixels: Uint8Array,
  palette: Uint8Array,
  rgba: Uint8ClampedArray,
): void {
  for (let [index, pixel] of pixels.entries()) {
    rgba[index * 4] = palette[pixel * 3] ?? 0;
    rgba[index * 4 + 1] = palette[pixel * 3 + 1] ?? 0;
    rgba[index * 4 + 2] = palette[pixel * 3 + 2] ?? 0;
    rgba[index * 4 + 3] = 255;
  }
}

// What the panel draws, in CSS px from its top-left corner: its size, the screen's canvas, the
// display's black module at real size, every control and where the row with the status line and
// the buttons starts, which is as tall as its text. The radii, borders and labels are drawn at
// `scale` CSS px a screen pixel. A knob's label sits under it at real size and on it in the browser
// view, where nothing is under a knob
export type Arrangement = {
  width: number;
  height: number;
  scale: number;
  screen: Rectangle;
  module?: Rectangle;
  controls: PanelControl[];
  row: Pick<Rectangle, 'width' | 'x' | 'y'>;
  labelsUnderKnobs: boolean;
};

// The browser view's spacing in CSS px: a margin at the window's edges and between blocks and a gap
// between the controls of a block
const MARGIN = 8;
const GAP = 3;

// The least size of a played control: the goal, and the floor that a phone too narrow for the goal
// takes before its screen drops a zoom
const KEY_GOAL = 44;
const KEY_FLOOR = 40;

// The browser view's rows of keys, steps and pads, each from left to right. A row of keys has eight
// cells: the first a free one before VOL, and OK sits above CANCEL
const KEY_ROWS = [
  ['t1', 't2', 't3', 't4', 'pads-keys', 'roll', undefined, 'volume'],
  ['rec', 'play', 'stop', 'tempo', 'minus', 'up', 'plus', 'ok'],
  ['menu', 'page', 'copy', 'shift', 'left', 'down', 'right', 'cancel'],
];
const STEP_ROWS = [STEP_BUTTONS.slice(0, 8), STEP_BUTTONS.slice(8)];
const PAD_ROWS = [0, 6].map((first) =>
  Array.from({length: 6}, (_, index) => `pad-${first + index}`),
);

const BY_NAME = new Map<string, PanelControl>(
  CONTROLS.map((control) => [control.control, control]),
);

// The device's key in screen pixels, which the browser view draws at the size of its keys
const DEVICE_KEY = toScreenPixels((BY_NAME.get('t1') as PanelControl).width);

// The device's step, 12 × 10 mm, whose shape the browser view's steps keep down to `KEY_FLOOR`
const DEVICE_STEP = BY_NAME.get('step-1') as PanelControl;

// The height that rows of `[count, cap]` share out of `free`: each the same, but none more than its
// cap, and what a capped row leaves goes to the others. Infinity when every row reaches its cap
function share(free: number, rows: Array<[count: number, cap: number]>) {
  let left = free;
  let remaining = rows.reduce((sum, [count]) => sum + count, 0);

  for (let [count, cap] of rows.toSorted(([, a], [, b]) => a - b)) {
    if (cap * remaining > left) {
      return left / remaining;
    }

    left -= cap * count;
    remaining -= count;
  }

  return Infinity;
}

// The browser view at `zoom` with the rows of keys, steps and pads under the screen (the report's
// P1) or beside it (P3). The controls take the CSS px the viewport leaves: a row spans its column, a
// key or a pad is at most as tall as wide, a step as flat as the device's but at least
// `KEY_FLOOR` and a knob at most as wide as a pad and its strip cell; the rows share the height
// equally. Beside the screen the knobs take the height that the screen and the row leave. The row
// is `rowHeight` tall at its width. `smallest` is the least size of a played control; one below
// `KEY_FLOOR` is drawn at `KEY_FLOOR`, and the page scrolls
// eslint-disable-next-line @typescript-eslint/max-params -- the viewport, its display scale, the zoom and placement tried and the row's height
function arrange(
  viewport: {width: number; height: number},
  ratio: number,
  zoom: number,
  beside: boolean,
  rowHeight: (width: number) => number,
): {arrangement: Arrangement; zoom: number; smallest: number; keySize: number} {
  // Down to a whole device pixel, so that nothing moves past the viewport
  let snap = (css: number) => Math.floor(css * ratio) / ratio;
  let screenWidth = (480 * zoom) / ratio;
  let screenHeight = (272 * zoom) / ratio;
  let column = viewport.width - (beside ? 3 * MARGIN + screenWidth : 2 * MARGIN);
  let keyWidth = (column - 7 * GAP) / 8;
  let padWidth = (column - 5 * GAP) / 6;
  let stepCap = Math.max(KEY_FLOOR, (keyWidth * DEVICE_STEP.height) / DEVICE_STEP.width);
  let knobCap = Math.min(padWidth, screenWidth / 4 - GAP);
  let [key = 0, pad = 0] = [keyWidth, padWidth].map((size) => Math.max(KEY_FLOOR, size));
  let rowsWidth = Math.max(8 * key + 7 * GAP, 6 * pad + 5 * GAP);
  let rowTall = rowHeight(beside ? screenWidth : rowsWidth);
  let level =
    beside ?
      share(viewport.height - 4 * MARGIN - 4 * GAP, [
        [3, keyWidth],
        [2, stepCap],
        [2, padWidth],
      ])
    : share(viewport.height - screenHeight - 7 * MARGIN - 4 * GAP - rowTall, [
        [1, knobCap],
        [3, keyWidth],
        [2, stepCap],
        [2, padWidth],
      ]);
  let knobSize = Math.min(
    knobCap,
    beside ? viewport.height - screenHeight - 4 * MARGIN - rowTall : level,
  );
  let keyHeight = Math.min(keyWidth, level);
  let padHeight = Math.min(padWidth, level);
  let [keyTall = 0, stepTall = 0, padTall = 0, knob = 0] = [
    keyHeight,
    Math.min(stepCap, level),
    padHeight,
    knobSize,
  ].map((size) => Math.max(KEY_FLOOR, size));
  let columnHeight = 3 * keyTall + 2 * stepTall + 2 * padTall + 4 * GAP + 2 * MARGIN;
  let screen = {
    x: snap(beside ? MARGIN : MARGIN + Math.max(0, (rowsWidth - screenWidth) / 2)),
    y: snap(MARGIN),
    width: screenWidth,
    height: screenHeight,
  };
  let knobsY = screen.y + screenHeight + MARGIN;
  let columnX = beside ? screen.x + screenWidth + MARGIN : MARGIN;
  let keysY =
    beside ? Math.max(MARGIN, (viewport.height - columnHeight) / 2) : knobsY + knob + MARGIN;
  let stepsY = keysY + 3 * keyTall + 2 * GAP + MARGIN;
  let padsY = stepsY + 2 * stepTall + GAP + MARGIN;
  let rowY = beside ? knobsY + knob + MARGIN : padsY + 2 * padTall + GAP + MARGIN;

  // A control in its cell: a knob is round and centred in it
  let cell = (name: string, {x, y, width, height}: Rectangle): PanelControl => {
    let control = BY_NAME.get(name) as PanelControl;
    let size = Math.min(width, height);

    return control.shape === 'knob' ?
        {
          ...control,
          x: x + (width - size) / 2,
          y: y + (height - size) / 2,
          width: size,
          height: size,
        }
      : {...control, x, y, width, height};
  };

  // Rows of cells like `first`, `GAP` apart
  let rows = (names: ReadonlyArray<ReadonlyArray<string | undefined>>, first: Rectangle) =>
    names.flatMap((line, row) =>
      line.flatMap((name, index) =>
        name === undefined ?
          []
        : [
            cell(name, {
              ...first,
              x: first.x + index * (first.width + GAP),
              y: first.y + row * (first.height + GAP),
            }),
          ],
      ),
    );

  return {
    zoom,
    smallest:
      beside || screenWidth <= column ? Math.min(keyWidth, keyHeight, padHeight, knobSize) : 0,
    keySize: Math.min(keyWidth, keyHeight),
    arrangement: {
      width: Math.max(
        viewport.width,
        Math.max(screen.x + screenWidth, columnX + rowsWidth) + MARGIN,
      ),
      height: Math.max(viewport.height, Math.max(rowY + rowTall, keysY + columnHeight) + MARGIN),
      scale: Math.min(key, keyTall) / DEVICE_KEY,
      screen,
      controls: [
        ...Array.from({length: 4}, (_, index) =>
          cell(encoderName(index), {
            x: screen.x + (index * screenWidth) / 4,
            y: knobsY,
            width: screenWidth / 4,
            height: knob,
          }),
        ),
        ...rows(KEY_ROWS, {x: columnX, y: keysY, width: key, height: keyTall}),
        ...rows(STEP_ROWS, {x: columnX, y: stepsY, width: key, height: stepTall}),
        ...rows(PAD_ROWS, {x: columnX, y: padsY, width: pad, height: padTall}),
      ],
      row: {x: beside ? screen.x : MARGIN, y: rowY, width: beside ? screenWidth : rowsWidth},
      labelsUnderKnobs: false,
    },
  };
}

// The browser view (owner's choice, 2026-11-24): the panel's controls arranged to fit the viewport,
// the rows of keys, steps and pads under the screen or beside it, whichever gives the larger zoom,
// and on a tie the larger keys. The screen takes the largest whole zoom, whole device pixels a
// screen pixel, that leaves every played control 44 CSS px, or 40 when no zoom leaves 44. A
// viewport too small even for zoom 1 with 40 px controls gets zoom 1 and scrolls. The row with the
// status line and the buttons is `rowHeight` tall at a width, as its text wraps there
export function fitPanel(
  viewport: {width: number; height: number},
  devicePixelRatio: number,
  rowHeight: (width: number) => number,
): Arrangement {
  let most = Math.floor(
    Math.min((viewport.width * devicePixelRatio) / 480, (viewport.height * devicePixelRatio) / 272),
  );
  // On a full tie the rows go under the screen in a viewport taller than wide
  let tall = viewport.height > viewport.width;
  let [best] = Array.from({length: most}, (_, index) => most - index)
    .flatMap((zoom) =>
      [!tall, tall].map((beside) => arrange(viewport, devicePixelRatio, zoom, beside, rowHeight)),
    )
    .filter(({smallest}) => smallest >= KEY_FLOOR)
    .toSorted(
      (a, b) =>
        Number(b.smallest >= KEY_GOAL) - Number(a.smallest >= KEY_GOAL) ||
        b.zoom - a.zoom ||
        b.keySize - a.keySize,
    );

  return (best ?? arrange(viewport, devicePixelRatio, 1, !tall, rowHeight)).arrangement;
}

// The real-size view (owner's choice, 2026-11-24): the device as "The panel" in the plan measures
// it, at `pixelsPerMm` CSS px a mm, with the row under it. The screen is scaled by a fraction
export function realSizePanel(pixelsPerMm: number): Arrangement {
  let scale = MM_PER_PIXEL * pixelsPerMm;
  let panel = {width: PANEL_PIXELS.width * scale, height: PANEL_PIXELS.height * scale};

  // A rectangle in mm, rounded to screen pixels as every position is
  let inCss = ({x, y, width, height}: Rectangle) => ({
    x: toScreenPixels(x) * scale,
    y: toScreenPixels(y) * scale,
    width: toScreenPixels(width) * scale,
    height: toScreenPixels(height) * scale,
  });

  return {
    ...panel,
    scale,
    screen: inCss(DISPLAY.picture),
    module: inCss(DISPLAY.module),
    controls: CONTROLS.map((control) => ({...control, ...inCss(control)})),
    row: {x: MARGIN, y: panel.height + MARGIN, width: panel.width - 2 * MARGIN},
    labelsUnderKnobs: true,
  };
}
