import {KNOB_SIZE, type Rectangle, toScreenPixels} from './panelLayout.js';
import {type Arrangement} from './present.js';

// The look of the parts that "The panel" in the plan leaves to Look's panel.png, in screen pixels
const PANEL_RADIUS = 16;
const PANEL_EDGE = 2;
const KEY_RADIUS = 5;
const PAD_RADIUS = 7;
const KNOB_RING = 4;
const MARK = {top: 8, width: 3, height: 30};
const LABEL_SIZE = 12;
const KNOB_LABEL_GAP = 4;

function px(css: number) {
  return `${css}px`;
}

// The panel's stylesheet at one scale. A control is lit by its `data-lit` attribute
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
      display: flex;
      align-items: center;
      justify-content: center;
      background: #2b2b2b;
      border-style: solid;
      border-color: #bebeba;
      border-radius: 50%;
      color: #f0f0f0;
      font-weight: bold;
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

// Draws `arrangement` into `container`: the panel at its size and every part at its rectangle, in
// CSS px, with the radii, borders and labels at its scale. The screen canvas sits at its screen.
// `lights` holds the keys and pads by their names
export function buildPanel(
  container: HTMLElement,
  arrangement: Arrangement,
): {canvas: HTMLCanvasElement; lights: Map<string, Element>; dispose: () => void} {
  let panel = document.createElement('div');
  let stylesheet = document.createElement('style');
  let canvas = document.createElement('canvas');
  let lights = new Map<string, Element>();

  // A part at its rectangle in CSS px
  let place = (element: HTMLElement, {x, y, width, height}: Rectangle) => {
    Object.assign(element.style, {left: px(x), top: px(y), width: px(width), height: px(height)});
    panel.append(element);
  };

  panel.className = 'groovebox-panel';
  panel.style.width = px(arrangement.width);
  panel.style.height = px(arrangement.height);
  stylesheet.textContent = style((pixels) => px(pixels * arrangement.scale));
  panel.append(stylesheet);

  if (arrangement.module) {
    let module = document.createElement('div');

    module.className = 'module';
    place(module, arrangement.module);
  }

  canvas.width = 480;
  canvas.height = 272;
  canvas.setAttribute('aria-label', 'Screen');
  place(canvas, arrangement.screen);

  for (let {control, shape, label, ...rectangle} of arrangement.controls) {
    let element = document.createElement('div');

    element.className = shape;
    element.dataset.control = control;
    place(element, rectangle);

    if (shape === 'knob') {
      let mark = document.createElement('div');
      // A knob is the device's knob at its size: its ring and mark are its screen pixels times this
      let unit = rectangle.width / toScreenPixels(KNOB_SIZE.width);

      element.style.borderWidth = px(KNOB_RING * unit);
      // The mark is inside the knob's ring, so its position counts from there
      mark.className = 'mark';
      Object.assign(mark.style, {
        left: px((rectangle.width - MARK.width * unit) / 2 - KNOB_RING * unit),
        top: px((MARK.top - KNOB_RING) * unit),
        width: px(MARK.width * unit),
        height: px(MARK.height * unit),
      });
      element.append(mark);

      if (arrangement.labelsUnderKnobs) {
        let caption = document.createElement('div');

        caption.className = 'label';
        caption.textContent = label;
        Object.assign(caption.style, {
          left: px(rectangle.x),
          top: px(rectangle.y + rectangle.height + KNOB_LABEL_GAP * arrangement.scale),
          width: px(rectangle.width),
        });
        panel.append(caption);
      } else {
        element.append(label);
      }
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
