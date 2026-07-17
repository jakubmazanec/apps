import {afterEach, describe, expect, test, vi} from 'vitest';

const SETTINGS_KEY = 'somewhere:settings';

// settings.ts hydrates at module load, so each test re-imports a fresh copy
// after seeding happy-dom's real localStorage.
async function importSettings() {
  vi.resetModules();

  return import('../source/game/settings.js');
}

describe('settings', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('defaults when nothing is stored', async () => {
    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', soundEnabled: true});
  });

  test('a seeded valid payload hydrates settings at module load', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 'Ada', soundEnabled: false}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: 'Ada', soundEnabled: false});
  });

  test('a schema-rejected payload resets to defaults with one warning', async () => {
    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 42}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', soundEnabled: true});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('saveSettings writes the current object', async () => {
    let {settings, saveSettings} = await importSettings();

    settings.playerName = 'Ada';
    settings.soundEnabled = false;
    saveSettings();

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '')).toEqual({
      playerName: 'Ada',
      soundEnabled: false,
    });
  });
});
