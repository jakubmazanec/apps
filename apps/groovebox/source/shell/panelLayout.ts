import {type ButtonName, encoderName, STEP_BUTTONS} from './protocol.js';

export const PANEL_MM = {width: 321, height: 128};

// One screen pixel is 0.198 mm, so the 480 × 272 screen is 95.04 × 53.86 mm
export const MM_PER_PIXEL = 0.198;

// The panel's size in screen pixels, 1,621.2 × 646.5 rounded up to 1,622 × 647 (answer 17). It
// rounds up, unlike the positions and sizes of the controls, so that the panel covers its whole
// extent and no part of it is cut off
export const PANEL_PIXELS = {
  width: Math.ceil(PANEL_MM.width / MM_PER_PIXEL),
  height: Math.ceil(PANEL_MM.height / MM_PER_PIXEL),
};

// A length or a position in mm as screen pixels
export function toScreenPixels(mm: number) {
  return Math.round(mm / MM_PER_PIXEL);
}

type Rectangle = {x: number; y: number; width: number; height: number};

// The module is the black frame and the picture the screen inside it: exactly 480 × 272 screen
// pixels, with its position rounded as every position is
export const DISPLAY: {module: Rectangle; picture: Rectangle} = {
  module: {x: 87.75, y: 8, width: 105.5, height: 67.2},
  picture: {x: 93, y: 14.75, width: 95.04, height: 53.86},
};

export type PanelControl = Rectangle & {
  // A button's scene name, `encoder-1` to `encoder-4`, `volume` or `pad-0` to `pad-11` (the pad's
  // number in code)
  control: ButtonName | 'volume' | `encoder-${number}` | `pad-${number}`;
  shape: 'key' | 'knob' | 'pad';
  label: string;
};

const KEY_PITCH = 15;

// A row of keys of one size, 15 mm apart, starting at `first`
function keys(
  first: Pick<Rectangle, 'x' | 'y'>,
  size: Pick<Rectangle, 'height' | 'width'>,
  names: ReadonlyArray<[control: ButtonName, label: string]>,
): PanelControl[] {
  return names.map(([control, label], index) => ({
    control,
    shape: 'key',
    ...size,
    x: first.x + KEY_PITCH * index,
    y: first.y,
    label,
  }));
}

const KNOB_SIZE = {width: 22, height: 22};
const KNOB_Y = 8;
const ENCODER_PITCH = 25;

// The rectangles of "The panel" in the plan, in mm from the panel's top-left corner
export const CONTROLS: readonly PanelControl[] = [
  {control: 'volume', shape: 'knob', x: 8, y: KNOB_Y, ...KNOB_SIZE, label: 'VOL'},
  ...Array.from({length: 4}, (_, index): PanelControl => ({
    control: encoderName(index),
    shape: 'knob',
    x: 216 + ENCODER_PITCH * index,
    y: KNOB_Y,
    ...KNOB_SIZE,
    label: String(index + 1),
  })),
  ...keys({x: 241, y: 48}, {width: 12, height: 12}, [
    ['t1', 'T1'],
    ['t2', 'T2'],
    ['t3', 'T3'],
    ['t4', 'T4'],
    ['pads-keys', 'PADS'],
  ]),
  ...keys({x: 241, y: 63}, {width: 12, height: 12}, [
    ['roll', 'ROLL'],
    ['menu', 'MENU'],
    ['page', 'PAGE'],
    ['copy', 'COPY'],
    ['shift', 'SHIFT'],
  ]),
  ...keys({x: 8, y: 63}, {width: 12, height: 12}, [
    ['rec', 'REC'],
    ['play', 'PLAY'],
    ['stop', 'STOP'],
    ['tempo', 'TEMPO'],
  ]),
  ...keys(
    {x: 8, y: 80},
    {width: 12, height: 10},
    STEP_BUTTONS.map((step, index) => [step, String(index + 1)]),
  ),
  ...keys({x: 253, y: 80}, {width: 12, height: 18}, [
    ['minus', '−'],
    ['up', '▲'],
    ['plus', '+'],
    ['ok', 'OK'],
  ]),
  ...keys({x: 253, y: 100}, {width: 12, height: 18}, [
    ['left', '◀'],
    ['down', '▼'],
    ['right', '▶'],
    ['cancel', 'CANCEL'],
  ]),
  ...Array.from({length: 12}, (_, index): PanelControl => ({
    control: `pad-${index}`,
    shape: 'pad',
    x: 8 + 20 * index,
    y: 100,
    width: 17,
    height: 17,
    label: String(index + 1),
  })),
];
