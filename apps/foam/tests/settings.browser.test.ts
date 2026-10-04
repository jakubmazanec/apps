import {afterEach, describe, expect, test} from 'vitest';

const SETTINGS_KEY = 'foam:settings';
const DEFAULT_VOLUMES = {master: 1, music: 1, sfx: 1, ui: 1};
// settings.ts hydrates at module load, so each test re-imports a fresh copy
// after seeding localStorage. resetModules is unsupported in browser mode, so
// a cache-busting query makes each dynamic import a fresh module instance.
// The @vite-ignore comment is required: Vite rewrites variable dynamic
// imports into a glob-map lookup that cannot match a query-suffixed module.
// The specifier needs the real .ts extension, because a query-suffixed
// specifier bypasses Vite's .js -> .ts resolution.
let settingsImport = 0;

interface SettingsModule {
  settings: {volumes: {master: number; music: number; sfx: number; ui: number}};
  saveSettings: () => void;
  saveSettingsSoon: {flush: () => void} & (() => void);
}

async function importSettings() {
  settingsImport += 1;

  return import(
    /* @vite-ignore */ `../source/game/core/settings.ts?fresh=${settingsImport}`
  ) as Promise<SettingsModule>;
}

describe('settings', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('nothing stored gives the defaults', async () => {
    let {settings} = await importSettings();

    expect(settings).toEqual({volumes: DEFAULT_VOLUMES});
  });

  test('a stored valid payload is loaded', async () => {
    let volumes = {master: 0.5, music: 0.2, sfx: 0.8, ui: 0.3};

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({volumes}));

    let {settings} = await importSettings();

    expect(settings).toEqual({volumes});
  });

  test('a value of the wrong type resets alone', async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({volumes: {master: 'loud', music: 0.2, sfx: 0.8, ui: 0.3}}),
    );

    let {settings} = await importSettings();

    expect(settings).toEqual({volumes: {master: 1, music: 0.2, sfx: 0.8, ui: 0.3}});
  });

  test('an out-of-range volume snaps back without disturbing the others', async () => {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({volumes: {master: 9, music: 0.2, sfx: 0.8, ui: 0.3}}),
    );

    let {settings} = await importSettings();

    expect(settings).toEqual({volumes: {master: 1, music: 0.2, sfx: 0.8, ui: 0.3}});
  });

  test('text that is not JSON gives the defaults', async () => {
    localStorage.setItem(SETTINGS_KEY, '{"volumes": {"master": 0.5');

    let {settings} = await importSettings();

    expect(settings).toEqual({volumes: DEFAULT_VOLUMES});
  });

  test('volumes of the wrong type give the defaults', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({volumes: 'loud'}));

    let {settings} = await importSettings();

    expect(settings).toEqual({volumes: DEFAULT_VOLUMES});
  });

  test('saveSettings writes the current object', async () => {
    let {settings, saveSettings} = await importSettings();

    settings.volumes.master = 0.5;
    saveSettings();

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '')).toEqual({
      volumes: {master: 0.5, music: 1, sfx: 1, ui: 1},
    });
  });

  test('saveSettingsSoon waits, and flush writes at once', async () => {
    let {settings, saveSettingsSoon} = await importSettings();

    settings.volumes.music = 0.3;
    saveSettingsSoon();

    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();

    saveSettingsSoon.flush();

    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '')).toEqual({
      volumes: {master: 1, music: 0.3, sfx: 1, ui: 1},
    });
  });
});
