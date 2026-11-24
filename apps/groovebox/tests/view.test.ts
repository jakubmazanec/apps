import {describe, expect, onTestFinished, test, vitest} from 'vitest';

import {MM_PER_PIXEL, PANEL_PIXELS} from '../source/shell/panelLayout.js';
import {realSizePanel} from '../source/shell/present.js';
import {storedPixelsPerMm, storedView, storePixelsPerMm, storeView} from '../source/shell/view.js';

function unstub() {
  vitest.unstubAllGlobals();
}

function blocked(): never {
  throw new DOMException('The storage is blocked', 'SecurityError');
}

// A local storage that keeps its items in a map
function stubStorage() {
  let items = new Map<string, string>();

  onTestFinished(unstub);
  vitest.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  });

  return items;
}

// A local storage that throws, as a blocked one does
function stubBlockedStorage() {
  onTestFinished(unstub);
  vitest.stubGlobal('localStorage', {getItem: blocked, setItem: blocked});
}

describe(storedView, () => {
  test('is the browser view until another is kept', () => {
    stubStorage();

    expect(storedView()).toBe('browser');

    storeView('real-size');

    expect(storedView()).toBe('real-size');

    storeView('browser');

    expect(storedView()).toBe('browser');
  });

  test('is the browser view for an item it does not know', () => {
    stubStorage().set('groovebox-view', 'gallery');

    expect(storedView()).toBe('browser');
  });

  test('is the browser view and keeps nothing when the storage throws', () => {
    stubBlockedStorage();

    expect(() => {
      storeView('real-size');
    }).not.toThrow();
    expect(storedView()).toBe('browser');
  });
});

describe(storedPixelsPerMm, () => {
  test('is the size set last, and the real-size view draws the device at it', () => {
    stubStorage();

    expect(storedPixelsPerMm()).toBeUndefined();

    storePixelsPerMm(4.2);

    expect(storedPixelsPerMm()).toBe(4.2);
    expect(realSizePanel(storedPixelsPerMm() ?? 0).width).toBe(
      PANEL_PIXELS.width * MM_PER_PIXEL * 4.2,
    );
  });

  test.each(['', 'wide', '0', '-3', 'Infinity'])('is not set by the item "%s"', (item) => {
    stubStorage().set('groovebox-pixels-per-mm', item);

    expect(storedPixelsPerMm()).toBeUndefined();
  });

  test('is not set and keeps nothing when the storage throws', () => {
    stubBlockedStorage();

    expect(() => {
      storePixelsPerMm(4.2);
    }).not.toThrow();
    expect(storedPixelsPerMm()).toBeUndefined();
  });
});
