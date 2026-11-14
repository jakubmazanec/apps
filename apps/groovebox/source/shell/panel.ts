import {CONTROLS, DISPLAY, PANEL_PIXELS, toScreenPixels} from './panelLayout.js';

// The look of the parts that "The panel" in the plan leaves to Look's panel.png, in screen pixels
const PANEL_RADIUS = 16;
const PANEL_EDGE = 2;
const KEY_RADIUS = 5;
const PAD_RADIUS = 7;
const KNOB_RING = 4;
const MARK = {top: 8, width: 3, height: 30};
const LABEL_SIZE = 12;
const KNOB_LABEL_GAP = 4;

// The panel's stylesheet at one zoom. A control is lit by its `data-lit` attribute
function style(css: (pixels: number) => string) {
  return `
    .groovebox-panel {
      position: relative;
      background: #d6d6d2;
      border-radius: ${css(PANEL_RADIUS)};
      box-shadow: inset 0 0 0 ${css(PANEL_EDGE)} #787874;
      touch-action: none;
      user-select: none;
      font-size: ${css(LABEL_SIZE)};
      line-height: 1;
    }
    .groovebox-panel > * {
      position: absolute;
      box-sizing: border-box;
    }
    .groovebox-panel .key, .groovebox-panel .pad {
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
    }
    .groovebox-panel .key {
      background: #ecece8;
      border: ${css(1)} solid #969692;
      border-radius: ${css(KEY_RADIUS)};
      color: #1e1e1e;
    }
    .groovebox-panel .pad {
      background: #2b2b2b;
      border: ${css(1)} solid #141414;
      border-radius: ${css(PAD_RADIUS)};
      color: #f0f0f0;
    }
    .groovebox-panel [data-lit] {
      background: #ffaa82;
      color: #1e1e1e;
    }
    .groovebox-panel .knob {
      background: #2b2b2b;
      border: ${css(KNOB_RING)} solid #bebeba;
      border-radius: 50%;
    }
    .groovebox-panel .mark {
      position: absolute;
      background: #ff7a2f;
    }
    .groovebox-panel .label {
      color: #5b5b5a;
      text-align: center;
    }
    .groovebox-panel .module {
      background: #161616;
    }
    .groovebox-panel canvas {
      image-rendering: pixelated;
    }
  `;
}

// Draws the panel into `container` at `zoom` device pixels per screen pixel. Every part sits at
// whole device pixels: its position and size in screen pixels times the zoom, in CSS px. The
// screen canvas sits at the display's picture. `lights` holds the keys and pads by their names
export function buildPanel(
  container: HTMLElement,
  zoom: number,
  devicePixelRatio: number,
): {canvas: HTMLCanvasElement; lights: Map<string, Element>; dispose: () => void} {
  let css = (pixels: number) => `${(pixels * zoom) / devicePixelRatio}px`;
  let panel = document.createElement('div');
  let stylesheet = document.createElement('style');
  let module = document.createElement('div');
  let canvas = document.createElement('canvas');
  let lights = new Map<string, Element>();

  // A part at its rectangle in mm, rounded to screen pixels
  let place = (
    element: HTMLElement,
    {x, y, width, height}: {x: number; y: number; width: number; height: number},
  ) => {
    Object.assign(element.style, {
      left: css(toScreenPixels(x)),
      top: css(toScreenPixels(y)),
      width: css(toScreenPixels(width)),
      height: css(toScreenPixels(height)),
    });
    panel.append(element);
  };

  panel.className = 'groovebox-panel';
  panel.style.width = css(PANEL_PIXELS.width);
  panel.style.height = css(PANEL_PIXELS.height);
  stylesheet.textContent = style(css);
  panel.append(stylesheet);
  module.className = 'module';
  place(module, DISPLAY.module);
  canvas.width = 480;
  canvas.height = 272;
  canvas.setAttribute('aria-label', 'Screen');
  place(canvas, DISPLAY.picture);

  for (let {control, shape, label, ...rectangle} of CONTROLS) {
    let element = document.createElement('div');

    element.className = shape;
    element.dataset.control = control;
    place(element, rectangle);

    if (shape === 'knob') {
      let mark = document.createElement('div');
      let caption = document.createElement('div');
      let size = toScreenPixels(rectangle.width);

      // The mark is inside the knob's ring, so its position counts from there
      mark.className = 'mark';
      Object.assign(mark.style, {
        left: css(Math.round((size - MARK.width) / 2) - KNOB_RING),
        top: css(MARK.top - KNOB_RING),
        width: css(MARK.width),
        height: css(MARK.height),
      });
      element.append(mark);
      caption.className = 'label';
      caption.textContent = label;
      Object.assign(caption.style, {
        left: css(toScreenPixels(rectangle.x)),
        top: css(toScreenPixels(rectangle.y) + toScreenPixels(rectangle.height) + KNOB_LABEL_GAP),
        width: css(size),
      });
      panel.append(caption);
    } else {
      element.textContent = label;
      lights.set(control, element);
    }
  }

  container.append(panel);

  return {
    canvas,
    lights,
    dispose: () => {
      panel.remove();
    },
  };
}
