import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  onTestFinished,
  test,
  vitest,
} from 'vitest';
import {cdp, page, userEvent} from 'vitest/browser';

import {type Core} from '../source/shell/boot.js';
import {fitPanel} from '../source/shell/present.js';
import {type StampedInput, type WorkerRequest} from '../source/shell/protocol.js';
import {runShell} from '../source/shell/shell.js';

// The palette entries the tests read
const BACKGROUND = 0;
const TEXT = 1;
const FAINT = 3;
const LINE = 4;
const ACCENT = 6;

// The header's text row and the value of SETTINGS' first item, Velocity
const HEADER = {x: 0, y: 1, width: 480, height: 13};
const VELOCITY_VALUE = {x: 100, y: 17, width: 60, height: 13};

// A stub, as a test has no MIDI devices and no permission to ask for them
let requestMidiAccess: MockInstance<Navigator['requestMIDIAccess']>;

// A MIDI access with no device until the test plugs one in
function fakeMidi() {
  let inputs = new Map<string, EventTarget>();
  let access = Object.assign(new EventTarget(), {inputs});

  return {
    access: access as unknown as MIDIAccess,
    // Returns a function that sends the bytes of one message from the new device
    plugIn: (id: string) => {
      let input = new EventTarget();

      inputs.set(id, input);
      access.dispatchEvent(new Event('statechange'));

      return (...bytes: number[]) =>
        input.dispatchEvent(new MIDIMessageEvent('midimessage', {data: Uint8Array.from(bytes)}));
    },
  };
}

function mount() {
  let main = document.createElement('main');
  let panel = document.createElement('div');
  let row = document.createElement('div');
  let status = document.createElement('p');
  let note = document.createElement('p');
  let saveSession = document.createElement('button');
  let savePicture = document.createElement('button');
  let switchView = document.createElement('button');
  let setSize = document.createElement('button');

  saveSession.textContent = 'Save session';
  savePicture.textContent = 'Save picture';
  switchView.textContent = 'Real size';
  setSize.textContent = 'Set size';
  setSize.hidden = true;
  Object.assign(row.style, {
    display: 'flex',
    flexWrap: 'wrap',
    alignContent: 'start',
    alignItems: 'center',
    gap: '4px 8px',
    fontSize: '12px',
  });
  row.append(status, note, saveSession, savePicture, switchView, setSize);
  main.append(panel, row);
  document.body.style.margin = '0';
  document.body.replaceChildren(main);

  return {panel, row, status, note, saveSession, savePicture, switchView, setSize};
}

async function runMounted() {
  let elements = mount();
  let shell = await runShell(elements);

  onTestFinished(shell.stop);

  return {...shell, ...elements};
}

// Starts the audio with a click on the status line, so that the shell sends inputs, and waits for
// the project to open after the library, as the core takes no input before (S13)
async function runStarted() {
  let shell = await runMounted();

  await userEvent.click(shell.status);
  await shell.start();

  // "Step" in the accent, where the header said "Loading library"
  await expect.poll(() => inkSpan(shell.core, HEADER, ACCENT)).toEqual([4, 26]);

  return shell;
}

function position({memory, addresses}: Core) {
  return Atomics.load(new BigUint64Array(memory.buffer, addresses.position, 1), 0);
}

// A copy of the frame the core shows
function frame({memory, addresses}: Core) {
  let front = Atomics.load(new Uint32Array(memory.buffer, addresses.front, 1), 0);

  return new Uint8Array(
    new Uint8Array(
      memory.buffer,
      front === 0 ? addresses.screens[0] : addresses.screens[1],
      480 * 272,
    ),
  );
}

function pixel(core: Core, x: number, y: number) {
  return frame(core)[y * 480 + x];
}

// The first and the last column of a rectangle of the shown frame that hold `colour`
function inkSpan(
  core: Core,
  area: {x: number; y: number; width: number; height: number},
  colour: number,
) {
  let pixels = frame(core);
  let columns = Array.from({length: area.width}, (_, column) => area.x + column).filter((x) =>
    Array.from({length: area.height}, (_, row) => area.y + row).some(
      (y) => pixels[y * 480 + x] === colour,
    ),
  );

  return [columns[0], columns.at(-1)];
}

function control(name: string) {
  return document.querySelector(`[data-control="${name}"]`) as HTMLElement;
}

// Where a control of the panel is on the page
function placeOf(name: string) {
  let {x, y, width, height} = control(name).getBoundingClientRect();

  return {x, y, width, height};
}

function button(text: string) {
  return [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text,
  );
}

// A rectangle on the page, to 0.05 CSS px, as the browser lays out in fractions of a px
function near({x, y, width, height}: {x: number; y: number; width: number; height: number}) {
  return {
    x: expect.closeTo(x, 1) as unknown,
    y: expect.closeTo(y, 1) as unknown,
    width: expect.closeTo(width, 1) as unknown,
    height: expect.closeTo(height, 1) as unknown,
  };
}

function isLit(name: string) {
  return control(name).dataset.lit !== undefined;
}

// Whether a key down sent to the page loses its browser default
function keyDefaultPrevented(init: KeyboardEventInit) {
  let event = new KeyboardEvent('keydown', {...init, bubbles: true, cancelable: true});

  document.body.dispatchEvent(event);

  return event.defaultPrevented;
}

function centre(element: Element) {
  let {left, top, width, height} = element.getBoundingClientRect();

  return {x: left + width / 2, y: top + height / 2};
}

// Real mouse input through the DevTools protocol. It takes points of the top page, where the
// test's frame is shown scaled
async function mouse(
  type: 'mouseMoved' | 'mousePressed' | 'mouseReleased',
  {x, y}: {x: number; y: number},
) {
  let frameBox = (globalThis.frameElement as Element).getBoundingClientRect();
  let scale = frameBox.width / globalThis.innerWidth;
  let held = type !== 'mouseReleased';

  await cdp().send('Input.dispatchMouseEvent', {
    type,
    x: frameBox.left + x * scale,
    y: frameBox.top + y * scale,
    button: 'left',
    buttons: held ? 1 : 0,
    clickCount: 1,
  });
}

// The pointer that `mouse` moves
const MOUSE_POINTER = 1;

// A pointer event of the mouse's pointer that the browser did not send, for what real mouse input
// cannot make: a cancel, a lost capture or a press whose release went missing
function pointerEvent(type: string, target: Element) {
  target.dispatchEvent(
    new PointerEvent(type, {pointerId: MOUSE_POINTER, button: 0, bubbles: true, cancelable: true}),
  );
}

// The inputs the shell sends to the control worker from now on
function watchInputs({core}: {core: Core}) {
  let postMessage = vitest.spyOn(core.worker, 'postMessage');

  onTestFinished(() => {
    postMessage.mockRestore();
  });

  return () =>
    postMessage.mock.calls.flatMap(([request]) =>
      (request as WorkerRequest).type === 'input' ?
        [(request as Extract<WorkerRequest, {type: 'input'}>).stamped]
      : [],
    );
}

function inputsOf(stamped: StampedInput[]) {
  return stamped.map(({input}) => input);
}

function stubDisplayScale(initialRatio: number) {
  let ratio = initialRatio;
  let watchers: Array<{query: string; target: EventTarget}> = [];
  let devicePixelRatio = vitest
    .spyOn(globalThis, 'devicePixelRatio', 'get')
    .mockImplementation(() => ratio);
  let matchMedia = vitest.spyOn(globalThis, 'matchMedia').mockImplementation((query) => {
    let target = new EventTarget();

    watchers.push({query, target});

    return target as MediaQueryList;
  });

  onTestFinished(() => {
    devicePixelRatio.mockRestore();
    matchMedia.mockRestore();
  });

  // A real query fires only when the ratio it was armed for stops matching
  return (nextRatio: number) => {
    let armedQuery = `(resolution: ${ratio}dppx)`;

    ratio = nextRatio;

    for (let {query, target} of watchers) {
      if (query === armedQuery) {
        target.dispatchEvent(new Event('change'));
      }
    }
  };
}

function shown({panel, note}: {panel: HTMLElement; note: HTMLElement}) {
  let {width, height} = (panel.querySelector('canvas') as HTMLCanvasElement).style;

  return {width, height, note: note.textContent};
}

// The row's height at a width, measured as the shell measures it, with the row's own width kept
function rowHeightAt(row: HTMLElement) {
  return (width: number) => {
    let kept = row.style.width;

    row.style.width = `${width}px`;

    let {height} = row.getBoundingClientRect();

    row.style.width = kept;

    return height;
  };
}

function fitted(ratio: number, row: HTMLElement) {
  let {screen} = fitPanel(
    {width: globalThis.innerWidth, height: globalThis.innerHeight},
    ratio,
    rowHeightAt(row),
  );

  return {
    width: `${screen.width}px`,
    height: `${screen.height}px`,
    note: Number.isInteger(ratio) ? '' : 'This display scale cannot show the screen pixel-exactly.',
  };
}

describe(runShell, () => {
  beforeEach(async () => {
    requestMidiAccess = vitest
      .spyOn(Navigator.prototype, 'requestMIDIAccess')
      .mockResolvedValue(fakeMidi().access);
    // Every test starts in the browser view with no real size set
    localStorage.removeItem('groovebox-view');
    localStorage.removeItem('groovebox-pixels-per-mm');
    await page.viewport(1700, 900);

    return () => {
      requestMidiAccess.mockRestore();
    };
  });

  test('the page is cross-origin isolated', () => {
    expect(crossOriginIsolated).toBe(true);
  });

  test('boots, runs the audio and draws the header of STEP', async () => {
    let {core} = await runMounted();

    await userEvent.click(document.body);

    await expect.poll(() => position(core), {timeout: 5000}).toBeGreaterThan(4800n);

    // The header's line, the "S" of "Step" in the accent and the faint line under the first lane
    expect(pixel(core, 0, 14)).toBe(LINE);
    expect(pixel(core, 4, 6)).toBe(ACCENT);
    expect(pixel(core, 240, 30)).toBe(FAINT);
  });

  test('two quick clicks start one audio graph', async () => {
    let addModule = vitest.spyOn(Worklet.prototype, 'addModule');

    onTestFinished(() => {
      addModule.mockRestore();
    });

    let {start} = await runMounted();

    await Promise.all([userEvent.click(document.body), userEvent.click(document.body)]);

    expect(start()).toBe(start());

    await start();

    expect(addModule).toHaveBeenCalledTimes(1);
    expect(requestMidiAccess).toHaveBeenCalledTimes(1);
  });

  test('a gesture starts audio only with user activation', async () => {
    let addModule = vitest.spyOn(Worklet.prototype, 'addModule');
    let activation = vitest
      .spyOn(Navigator.prototype, 'userActivation', 'get')
      .mockReturnValue({hasBeenActive: false, isActive: false});

    onTestFinished(() => {
      addModule.mockRestore();
      activation.mockRestore();
    });

    let {status} = await runMounted();

    await userEvent.click(document.body);

    expect(addModule).toHaveBeenCalledTimes(0);
    expect(requestMidiAccess).toHaveBeenCalledTimes(0);
    expect(status.textContent).toBe('Click to start');

    activation.mockRestore();
    await userEvent.click(document.body);

    await expect.poll(() => status.textContent).toBe('');

    expect(addModule).toHaveBeenCalledTimes(1);
  });

  test('a touch starts audio when it ends', async () => {
    let addModule = vitest.spyOn(Worklet.prototype, 'addModule');
    // A touch's pointerdown grants no activation; its pointerup does
    let activation = vitest
      .spyOn(Navigator.prototype, 'userActivation', 'get')
      .mockReturnValueOnce({hasBeenActive: false, isActive: false});

    onTestFinished(() => {
      addModule.mockRestore();
      activation.mockRestore();
    });

    await runMounted();
    await userEvent.click(document.body);

    expect(activation).toHaveBeenCalledTimes(2);
    expect(addModule).toHaveBeenCalledTimes(1);
  });

  test.each([
    {viewport: {width: 1700, height: 900}, ratio: 1},
    {viewport: {width: 1700, height: 900}, ratio: 2},
    {viewport: {width: 390, height: 660}, ratio: 3},
    {viewport: {width: 750, height: 340}, ratio: 3},
    {viewport: {width: 915, height: 356}, ratio: 2.625},
  ])(
    'the browser view fills the window with the screen at its zoom ($viewport.width × $viewport.height at $ratio)',
    async ({viewport, ratio}) => {
      await page.viewport(viewport.width, viewport.height);
      stubDisplayScale(ratio);

      let elements = await runMounted();
      let layout = fitPanel(viewport, ratio, rowHeightAt(elements.row));
      let canvas = elements.panel.querySelector('canvas') as HTMLCanvasElement;
      let row = elements.row.getBoundingClientRect();
      let {scrollWidth, scrollHeight} = document.scrollingElement as Element;

      expect(elements.panel.firstElementChild?.getBoundingClientRect().toJSON()).toMatchObject({
        left: 0,
        top: 0,
        ...viewport,
      });
      expect(canvas.getBoundingClientRect().toJSON()).toMatchObject(near(layout.screen));
      expect([canvas.width, canvas.height]).toEqual([480, 272]);
      expect(row.toJSON()).toMatchObject(near({...layout.row, height: row.height}));
      expect(row.bottom).toBeLessThanOrEqual(viewport.height);

      for (let {control: name, x, y, width, height} of layout.controls) {
        expect(control(name).getBoundingClientRect().toJSON()).toMatchObject(
          near({x, y, width, height}),
        );
      }

      expect(scrollWidth).toBeLessThanOrEqual(globalThis.innerWidth);
      expect(scrollHeight).toBeLessThanOrEqual(globalThis.innerHeight);
    },
  );

  test('a window too small for the screen at zoom 1 with 40 px keys scrolls', async () => {
    await page.viewport(300, 300);
    stubDisplayScale(1);

    let {panel} = await runMounted();
    let {scrollWidth, scrollHeight} = document.scrollingElement as Element;

    expect(panel.querySelector('canvas')?.getBoundingClientRect().toJSON()).toMatchObject({
      width: 480,
      height: 272,
    });
    expect(scrollWidth).toBeGreaterThan(globalThis.innerWidth);
    expect(scrollHeight).toBeGreaterThan(globalThis.innerHeight);
  });

  test('the zoom is fitted again each time the display scale changes', async () => {
    let changeRatio = stubDisplayScale(1);
    let elements = await runMounted();

    expect(shown(elements)).toEqual(fitted(1, elements.row));

    changeRatio(1.25);

    expect(shown(elements)).toEqual(fitted(1.25, elements.row));

    changeRatio(2);

    expect(shown(elements)).toEqual(fitted(2, elements.row));
  });

  test('a display scale change after stop is ignored', async () => {
    let changeRatio = stubDisplayScale(1);
    let elements = await runMounted();
    let before = shown(elements);

    elements.stop();
    changeRatio(1.25);

    expect(before).toEqual(fitted(1, elements.row));
    expect(elements.panel.children).toHaveLength(0);
  });

  test('the switch shows the device at the size set by the bank card and back, and MENU stays held', async () => {
    let shell = await runStarted();

    await userEvent.keyboard('{KeyL>}');

    // The first tile, STEP's, is outlined in the accent while MENU is held
    await expect.poll(() => pixel(shell.core, 1, 16)).toBe(ACCENT);

    let inputs = watchInputs(shell);

    await userEvent.click(shell.switchView);

    expect([shell.switchView.textContent, shell.setSize.hidden]).toEqual(['Browser view', false]);
    expect(shell.note.textContent).toBe('At real size the screen is not pixel-exact.');
    expect(localStorage.getItem('groovebox-view')).toBe('real-size');

    let plus = () => {
      let {x, y} = (button('+') as HTMLButtonElement).getBoundingClientRect();

      return {x, y};
    };
    let before = plus();

    await userEvent.click(button('+') as HTMLButtonElement);
    await userEvent.click(button('+') as HTMLButtonElement);

    // The card grows, and its buttons stay under the pointer
    expect(plus()).toEqual(before);

    await userEvent.click(button('Done') as HTMLButtonElement);

    let pixelsPerMm = (96 / 25.4) * 1.01 * 1.01;

    expect(button('Done')).toBeUndefined();
    expect(Number(localStorage.getItem('groovebox-pixels-per-mm'))).toBeCloseTo(pixelsPerMm);
    expect(shell.panel.firstElementChild?.getBoundingClientRect().width).toBeCloseTo(
      1622 * 0.198 * pixelsPerMm,
      1,
    );

    await userEvent.click(shell.switchView);

    expect(shell.switchView.textContent).toBe('Real size');
    expect(shell.panel.firstElementChild?.getBoundingClientRect().width).toBe(1700);
    expect(pixel(shell.core, 1, 16)).toBe(ACCENT);
    expect(inputs()).toEqual([]);

    await userEvent.keyboard('{/KeyL}');
  });

  test('a row that wraps is given its height, and the panel is fitted again when its text changes', async () => {
    let viewport = {width: 915, height: 356};

    await page.viewport(viewport.width, viewport.height);
    stubDisplayScale(2.625);

    let shell = await runMounted();
    let before = placeOf('encoder-1');

    // The shell sets the status line, here to one long enough to need a line of its own
    shell.status.textContent =
      'MIDI not allowed: a status line long enough to need a line of its own';

    await expect
      .poll(() => placeOf('encoder-1'))
      .toMatchObject(
        near(
          fitPanel(viewport, 2.625, rowHeightAt(shell.row)).controls.find(
            ({control: name}) => name === 'encoder-1',
          ) ?? before,
        ),
      );

    let {scrollWidth, scrollHeight} = document.scrollingElement as Element;

    expect(placeOf('encoder-1')).not.toEqual(before);
    expect(shell.row.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewport.height);
    expect([scrollWidth, scrollHeight]).toEqual([viewport.width, viewport.height]);
  });

  test('a stored real-size view starts at real size, with the bank card until the size is set', async () => {
    localStorage.setItem('groovebox-view', 'real-size');

    let shell = await runMounted();

    expect([shell.switchView.textContent, shell.setSize.hidden]).toEqual(['Browser view', false]);
    expect(shell.panel.firstElementChild?.getBoundingClientRect().width).toBeCloseTo(
      1622 * 0.198 * (96 / 25.4),
      1,
    );
    expect(button('Done')).toBeDefined();
  });

  test('a stored size draws the device at it without the card, and "Set size" shows the card again', async () => {
    localStorage.setItem('groovebox-view', 'real-size');
    localStorage.setItem('groovebox-pixels-per-mm', '5');

    let shell = await runMounted();
    let width = () => shell.panel.firstElementChild?.getBoundingClientRect().width;

    expect(width()).toBeCloseTo(1622 * 0.198 * 5, 1);
    expect(button('Done')).toBeUndefined();

    await userEvent.click(shell.setSize);
    await userEvent.click(button('−') as HTMLButtonElement);
    await userEvent.click(button('Done') as HTMLButtonElement);

    expect(width()).toBeCloseTo((1622 * 0.198 * 5) / 1.01, 1);
    expect(Number(localStorage.getItem('groovebox-pixels-per-mm'))).toBeCloseTo(5 / 1.01);
    expect(button('Done')).toBeUndefined();
  });

  test('L held and a click on step 8 shows SETTINGS', async () => {
    let {core} = await runStarted();

    await userEvent.keyboard('{KeyL>}');
    await userEvent.click(control('step-8'));
    await userEvent.keyboard('{/KeyL}');

    // "Settings" in the accent: 8 characters of 6 px from x 4
    await expect.poll(() => inkSpan(core, HEADER, ACCENT)).toEqual([4, 50]);
  });

  test('a pad clicked on the panel lights while the mouse is down, wherever it moves', async () => {
    let shell = await runStarted();
    let inputs = watchInputs(shell);

    // Syn 1 on pad 1 of T4, which the factory project leaves empty, then KEYS mode, where a pad is
    // lit while its note is on
    await userEvent.keyboard(
      '{BracketRight}{KeyL>}{Digit3}{/KeyL}{Enter}{ArrowDown}{ArrowDown}{Enter}{Backslash}',
    );

    await expect.poll(() => isLit('pads-keys')).toBe(true);

    await mouse('mouseMoved', centre(control('pad-4')));
    await mouse('mousePressed', centre(control('pad-4')));

    await expect.poll(() => isLit('pad-4')).toBe(true);

    await mouse('mouseMoved', {x: 1650, y: 850});
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(isLit('pad-4')).toBe(true);
    expect(inputsOf(inputs())).not.toContainEqual({kind: 'pad-release', pad: 4});

    await mouse('mouseReleased', {x: 1650, y: 850});

    await expect.poll(() => isLit('pad-4')).toBe(false);

    expect(inputsOf(inputs()).filter((input) => 'pad' in input && input.pad === 4)).toEqual([
      {kind: 'pad-hit', pad: 4, velocity: 127},
      {kind: 'pad-release', pad: 4},
    ]);
    expect(isLit('pad-0')).toBe(true);
  });

  test('a drag on encoder 1 over SETTINGS turns Velocity off', async () => {
    let shell = await runStarted();

    await userEvent.keyboard('{KeyL>}{Digit8}{/KeyL}');

    await expect.poll(() => inkSpan(shell.core, VELOCITY_VALUE, TEXT)).toEqual([148, 158]);

    let inputs = watchInputs(shell);
    let start = centre(control('encoder-1'));

    await mouse('mouseMoved', start);
    await mouse('mousePressed', start);
    await mouse('mouseMoved', {x: start.x, y: start.y + 10});
    await mouse('mouseReleased', {x: start.x, y: start.y + 10});

    // "Off" in place of "On", its ink ending where it did
    await expect.poll(() => inkSpan(shell.core, VELOCITY_VALUE, TEXT)).toEqual([142, 158]);

    expect(inputsOf(inputs())).toEqual([{kind: 'turn', encoder: 0, clicks: -2}]);
  });

  test('a click on encoder 1 without movement is a push', async () => {
    let shell = await runStarted();

    await userEvent.keyboard('{KeyL>}{Digit8}{/KeyL}');

    await expect.poll(() => inkSpan(shell.core, VELOCITY_VALUE, TEXT)).toEqual([148, 158]);

    let inputs = watchInputs(shell);

    await userEvent.click(control('encoder-1'));

    // A push is OK on the item, which flips Velocity
    await expect.poll(() => inkSpan(shell.core, VELOCITY_VALUE, TEXT)).toEqual([142, 158]);

    let [press, release] = inputs();

    expect(inputsOf(inputs())).toEqual([
      {kind: 'press', button: 'push-1'},
      {kind: 'release', button: 'push-1'},
    ]);
    expect(press?.sample).toBe(release?.sample);
  });

  test('the volume knob has no push', async () => {
    let shell = await runStarted();
    let inputs = watchInputs(shell);

    await userEvent.click(control('volume'));

    expect(inputs()).toEqual([]);
  });

  test('a turn of more than 127 clicks goes as several turns at one sample', async () => {
    let shell = await runStarted();
    let inputs = watchInputs(shell);
    let wheel = new WheelEvent('wheel', {deltaY: -30_000, bubbles: true, cancelable: true});

    control('encoder-2').dispatchEvent(wheel);

    let [first, ...rest] = inputs();

    expect(wheel.defaultPrevented).toBe(true);
    expect(inputsOf(inputs())).toEqual([
      {kind: 'turn', encoder: 1, clicks: 127},
      {kind: 'turn', encoder: 1, clicks: 127},
      {kind: 'turn', encoder: 1, clicks: 46},
    ]);
    expect(rest.map(({sample}) => sample)).toEqual([first?.sample, first?.sample]);
  });

  test.each(['blur', 'a hidden page'])('%s lets go of a held MENU', async (loss) => {
    let shell = await runStarted();

    await userEvent.keyboard('{KeyL>}');

    // The first tile, STEP's, is outlined in the accent while MENU is held
    await expect.poll(() => pixel(shell.core, 1, 16)).toBe(ACCENT);

    let inputs = watchInputs(shell);

    if (loss === 'blur') {
      globalThis.dispatchEvent(new Event('blur'));
    } else {
      let visibility = vitest
        .spyOn(Document.prototype, 'visibilityState', 'get')
        .mockReturnValue('hidden');

      onTestFinished(() => {
        visibility.mockRestore();
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }

    await expect.poll(() => pixel(shell.core, 1, 16)).toBe(BACKGROUND);

    await userEvent.keyboard('{/KeyL}');

    expect(inputsOf(inputs())).toEqual([{kind: 'release', button: 'menu'}]);
  });

  test('a key and the mouse on one pad send one hit and one release', async () => {
    let shell = await runStarted();
    let inputs = watchInputs(shell);

    await userEvent.keyboard('{KeyZ>}');
    await mouse('mouseMoved', centre(control('pad-0')));
    await mouse('mousePressed', centre(control('pad-0')));
    await userEvent.keyboard('{/KeyZ}');

    expect(inputsOf(inputs())).toEqual([{kind: 'pad-hit', pad: 0, velocity: 127}]);

    await mouse('mouseReleased', centre(control('pad-0')));

    expect(inputsOf(inputs())).toEqual([
      {kind: 'pad-hit', pad: 0, velocity: 127},
      {kind: 'pad-release', pad: 0},
    ]);
  });

  test.each(['pointercancel', 'lostpointercapture'])(
    '%s lets go of a held pad and drops a knob without a push',
    async (type) => {
      let shell = await runStarted();
      let inputs = watchInputs(shell);
      let pad = [
        {kind: 'pad-hit', pad: 0, velocity: 127},
        {kind: 'pad-release', pad: 0},
      ];

      await mouse('mouseMoved', centre(control('pad-0')));
      await mouse('mousePressed', centre(control('pad-0')));
      pointerEvent(type, shell.panel);

      expect(inputsOf(inputs())).toEqual(pad);

      // The release that may still come does nothing
      await mouse('mouseReleased', centre(control('pad-0')));

      expect(inputsOf(inputs())).toEqual(pad);

      await mouse('mouseMoved', centre(control('encoder-1')));
      await mouse('mousePressed', centre(control('encoder-1')));
      pointerEvent(type, shell.panel);
      await mouse('mouseReleased', centre(control('encoder-1')));

      expect(inputsOf(inputs())).toEqual(pad);
    },
  );

  test.each([
    {
      first: 'pad-0',
      sent: [
        {kind: 'pad-hit', pad: 0, velocity: 127},
        {kind: 'pad-release', pad: 0},
        {kind: 'pad-hit', pad: 2, velocity: 127},
        {kind: 'pad-release', pad: 2},
      ],
    },
    {
      first: 'encoder-1',
      sent: [
        {kind: 'pad-hit', pad: 2, velocity: 127},
        {kind: 'pad-release', pad: 2},
      ],
    },
  ])('a second press of one pointer lets go of $first first', async ({first, sent}) => {
    let shell = await runStarted();
    let inputs = watchInputs(shell);

    await mouse('mouseMoved', centre(control(first)));
    await mouse('mousePressed', centre(control(first)));
    // The release went missing, and the pointer goes down again on pad 3
    pointerEvent('pointerdown', control('pad-2'));
    await mouse('mouseReleased', centre(control(first)));

    expect(inputsOf(inputs())).toEqual(sent);
  });

  test('only mapped keys lose their browser default, repeats too', async () => {
    await runMounted();

    expect(keyDefaultPrevented({code: 'Space'})).toBe(true);
    expect(keyDefaultPrevented({code: 'ArrowDown', repeat: true})).toBe(true);
    expect(keyDefaultPrevented({code: 'KeyA'})).toBe(false);
    expect(keyDefaultPrevented({code: 'KeyL', ctrlKey: true})).toBe(false);
  });

  test('MIDI from every input, one plugged in later too, reaches the core', async () => {
    let midi = fakeMidi();
    let sendFromA = midi.plugIn('a');

    requestMidiAccess.mockResolvedValue(midi.access);

    let shell = await runStarted();
    let inputs = watchInputs(shell);

    sendFromA(0x90, 60, 100);

    let sendFromB = midi.plugIn('b');

    // Each input keeps its own reference for CC 20: the first value of each only sets it
    sendFromB(0xb0, 20, 10);
    sendFromA(0xb0, 20, 50);
    sendFromB(0xb0, 20, 12);
    sendFromA(0xb0, 20, 52);
    sendFromB(0x80, 60, 0);

    expect(inputsOf(inputs())).toEqual([
      {kind: 'note-on', note: 60, velocity: 100},
      {kind: 'turn', encoder: 0, clicks: 2},
      {kind: 'turn', encoder: 0, clicks: 2},
      {kind: 'note-off', note: 60},
    ]);
  });

  test.each(['refused', 'missing'])('MIDI %s says "MIDI not allowed"', async (midi) => {
    if (midi === 'refused') {
      requestMidiAccess.mockRejectedValue(new DOMException('', 'NotAllowedError'));
    } else {
      requestMidiAccess.mockImplementation(() => {
        throw new TypeError('navigator.requestMIDIAccess is not a function');
      });
    }

    let {status} = await runStarted();

    await expect.poll(() => status.textContent).toBe('MIDI not allowed');
  });

  test('Save picture downloads screen-<position>.png', async () => {
    let downloads: Array<{name: string; url: string}> = [];
    let click = vitest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function recordDownload(this: HTMLAnchorElement) {
        downloads.push({name: this.download, url: this.href});
      });
    let revoke = vitest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    onTestFinished(() => {
      click.mockRestore();
      revoke.mockRestore();
    });

    let {core, savePicture} = await runStarted();

    await expect.poll(() => position(core), {timeout: 5000}).toBeGreaterThan(4800n);

    await userEvent.click(savePicture);

    await expect.poll(() => downloads).toHaveLength(1);

    let [{name, url} = {name: '', url: ''}] = downloads;
    let sample = BigInt(/^screen-(?<sample>\d+)\.png$/u.exec(name)?.groups?.sample ?? -1);
    let picture = await createImageBitmap(await (await fetch(url)).blob());

    expect(sample).toBeGreaterThan(4800n);
    expect(sample).toBeLessThanOrEqual(position(core));
    expect([picture.width, picture.height]).toEqual([1920, 1088]);
  });
});
