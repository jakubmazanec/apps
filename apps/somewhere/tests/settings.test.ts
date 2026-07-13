import {describe, expect, test} from 'vitest';

import {settings} from '../source/game/settings.js';

describe('settings', () => {
  test('defaults', () => {
    expect(settings).toEqual({playerName: '', soundEnabled: true});
  });

  test('mutations stick (plain mutable object)', () => {
    settings.playerName = 'Ada';
    settings.soundEnabled = false;

    expect(settings.playerName).toBe('Ada');
    expect(settings.soundEnabled).toBeFalsy();

    // Restore the module singleton for any other consumer in this run.
    settings.playerName = '';
    settings.soundEnabled = true;
  });
});
