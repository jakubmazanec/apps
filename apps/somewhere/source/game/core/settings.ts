import {z} from 'zod';

import {PersistedStore} from '../../engine/storage/PersistedStore.js';
import {debounce} from '../../engine/utilities/debounce.js';

// `.default()` covers a key the payload is missing, `.catch()` a value that is
// present but unusable; zod only makes the former optional in the input type,
// so a field that must survive both needs the pair.
const volume = z.number().min(0).max(1).default(1).catch(1);
// Every field recovers on its own, so a payload only loses what is actually
// wrong: a key it predates defaults in, a value out of range snaps back, and
// the rest of the stored settings survive. Adding a field is therefore not a
// breaking change for players who already have settings stored.
const settingsSchema = z.object({
  playerName: z.string().default('').catch(''),
  volumes: z.object({master: volume, music: volume, sfx: volume, ui: volume}).prefault({}),
});
const settingsStore = new PersistedStore({
  key: 'somewhere:settings',
  // `{}` rather than a spelled-out literal: the per-field defaults above are
  // the single source of the values, and prefault re-parses to fill them in.
  schema: settingsSchema.prefault({}),
});

// Game settings: a plain mutable object, written directly by the Options UI
// and read where needed (no getter/setter ceremony). Hydrated from
// localStorage at module load; write sites call saveSettings() right after
// each mutation.
export const settings = settingsStore.load();

export function saveSettings(): void {
  settingsStore.save(settings);
}

// A Slider drag mutates a volume on every pointermove tick, and each
// saveSettings() is a synchronous JSON.stringify + localStorage.setItem.
// Continuous controls call this instead, so a drag costs one write on its
// trailing edge; discrete write sites (playerName) keep calling saveSettings()
// directly. Anything that can tear down mid-drag must call
// saveSettingsSoon.flush() so a pending write is not lost.
export const saveSettingsSoon = debounce(saveSettings, 250);
