import type * as pixi from 'pixi.js';
import {describe, expect, test} from 'vitest';

import {resolveBackgrounds} from '../source/engine/ui/resolveBackgrounds.js';

// Labelled so a failed identity assertion names the container it got.
function background(label: string): pixi.Container {
  return {label} as unknown as pixi.Container;
}

describe(resolveBackgrounds, () => {
  test('keeps the container each specified state was given', () => {
    let fallback = background('fallback');
    let hovered = background('hovered');
    let disabled = background('disabled');
    let resolved = resolveBackgrounds(['normal', 'hovered', 'disabled'], fallback, {
      hovered,
      disabled,
    });

    expect(resolved.normal).toBe(fallback);
    expect(resolved.hovered).toBe(hovered);
    expect(resolved.disabled).toBe(disabled);
  });

  test('resolves every unspecified state to the fallback', () => {
    let fallback = background('fallback');
    let resolved = resolveBackgrounds(['normal', 'hovered', 'disabled'], fallback, {});

    expect(resolved.normal).toBe(fallback);
    expect(resolved.hovered).toBe(fallback);
    expect(resolved.disabled).toBe(fallback);
  });

  // swapBackground skips the swap when the outgoing and incoming containers are the same object,
  // so unspecified states must share one container rather than each get a copy of it.
  test('unspecified states share one container', () => {
    let resolved = resolveBackgrounds(['normal', 'hovered', 'disabled'], background('fallback'), {
      hovered: background('hovered'),
    });

    expect(resolved.disabled).toBe(resolved.normal);
  });

  test('an override explicitly set to undefined falls back', () => {
    let fallback = background('fallback');
    let resolved = resolveBackgrounds(['normal', 'hovered'], fallback, {hovered: undefined});

    expect(resolved.hovered).toBe(fallback);
  });

  test('has an entry for every state and no others', () => {
    let resolved = resolveBackgrounds(
      ['normal', 'hovered', 'disabled'],
      background('fallback'),
      {},
    );

    expect(Object.keys(resolved)).toStrictEqual(['normal', 'hovered', 'disabled']);
  });
});
