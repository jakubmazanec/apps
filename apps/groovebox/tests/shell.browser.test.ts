import {describe, expect, onTestFinished, test, vitest} from 'vitest';
import {userEvent} from 'vitest/browser';

import {type Core} from '../source/shell/boot.js';
import {runShell} from '../source/shell/shell.js';

function mount() {
  let canvas = document.createElement('canvas');
  let status = document.createElement('p');
  let note = document.createElement('p');
  let save = document.createElement('button');

  canvas.width = 480;
  canvas.height = 272;
  document.body.replaceChildren(canvas, status, note, save);

  return {canvas, status, note, save};
}

async function runMounted() {
  let elements = mount();
  let shell = await runShell(elements);

  onTestFinished(shell.stop);

  return {...shell, ...elements};
}

function position({memory, addresses}: Core) {
  return Atomics.load(new BigUint64Array(memory.buffer, addresses.position, 1), 0);
}

function pixel({memory, addresses}: Core, x: number, y: number) {
  let front = Atomics.load(new Uint32Array(memory.buffer, addresses.front, 1), 0);

  return new Uint8Array(memory.buffer)[
    (front === 0 ? addresses.screens[0] : addresses.screens[1]) + y * 480 + x
  ];
}

describe(runShell, () => {
  test('the page is cross-origin isolated', () => {
    expect(crossOriginIsolated).toBe(true);
  });

  test('boots, draws the test picture and plays pad 0', async () => {
    let {core} = await runMounted();

    await userEvent.click(document.body);

    await expect.poll(() => position(core), {timeout: 5000}).toBeGreaterThan(4800n);

    expect(pixel(core, 0, 0)).toBe(4);
    expect(pixel(core, 240, 30)).toBe(0);

    await userEvent.keyboard('{z>}');

    await expect.poll(() => pixel(core, 36, 136), {timeout: 500}).toBe(6);

    await userEvent.keyboard('{/z}');

    await expect.poll(() => pixel(core, 36, 136)).toBe(0);
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
});
