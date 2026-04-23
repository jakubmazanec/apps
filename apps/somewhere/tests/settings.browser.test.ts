import {afterEach, describe, expect, test, vitest} from 'vitest';

const SETTINGS_KEY = 'somewhere:settings';
const DEFAULT_VOLUMES = {master: 1, music: 1, sfx: 1, ui: 1};
// settings.ts hydrates at module load, so each test re-imports a fresh copy
// after seeding localStorage. resetModules is unsupported in browser mode, so
// a cache-busting query makes each dynamic import a fresh module instance.
// The @vite-ignore comment is required: Vite rewrites variable dynamic
// imports into a glob-map lookup that cannot match a query-suffixed module.
// The specifier needs the real .ts extension: on Windows the test module is
// served from an /@fs/ URL, and relative imports resolved against it bypass
// Vite's .js -> .ts resolution, so settings.js would 404.
let settingsImport = 0;

interface SettingsModule {
  settings: {playerName: string; volumes: {master: number; music: number; sfx: number; ui: number}};
  saveSettings: () => void;
}

async function importSettings() {
  settingsImport += 1;

  return import(
    /* @vite-ignore */ `../source/game/settings.ts?fresh=${settingsImport}`
  ) as Promise<SettingsModule>;
}

describe('settings', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('defaults when nothing is stored', async () => {
    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', volumes: DEFAULT_VOLUMES});
  });

  test('a seeded valid payload hydrates settings at module load', async () => {
    let volumes = {master: 0.5, music: 0.2, sfx: 0.8, ui: 0.3};

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 'Ada', volumes}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: 'Ada', volumes});
  });

  test('a schema-rejected payload resets to defaults with one warning', async () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 42}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', volumes: DEFAULT_VOLUMES});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('a pre-migration payload (soundEnabled, no volumes) resets everything, including playerName', async () => {
    let warn = vitest.spyOn(console, 'warn').mockImplementation(() => {});

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({playerName: 'Ada', soundEnabled: false}));

    let {settings} = await importSettings();

    expect(settings).toEqual({playerName: '', volumes: DEFAULT_VOLUMES});
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  test('saveSettings writes the current object', async () => {
    let {settings, saveSettings} = await importSettings();

    settings.playerName = 'Ada';
    settings.volumes.master = 0.5;
    saveSettings();

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '')).toEqual({
      playerName: 'Ada',
      volumes: {master: 0.5, music: 1, sfx: 1, ui: 1},
    });
  });
});
