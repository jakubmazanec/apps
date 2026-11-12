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
  let shell = await runShell(mount());

  onTestFinished(shell.stop);

  return shell;
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
});
