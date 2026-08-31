import {z} from 'zod';

import {PersistedStore} from '../../engine/storage/PersistedStore.js';
import {debounce} from '../../engine/utilities/debounce.js';

const settingsStore = new PersistedStore({
  key: 'somewhere:settings',
  schema: z.object({
    playerName: z.string(),
    volumes: z.object({
      master: z.number().min(0).max(1),
      music: z.number().min(0).max(1),
      sfx: z.number().min(0).max(1),
      ui: z.number().min(0).max(1),
    }),
  }),
  defaults: () => ({playerName: '', volumes: {master: 1, music: 1, sfx: 1, ui: 1}}),
});

// Game settings: a plain mutable object, written directly by the Options UI
// and read where needed (no getter/setter ceremony). Hydrated from
// localStorage at module load; write sites call saveSettings() right after
// each mutation. A corrupt or schema-rejected payload silently resets to
// defaults — the schema is the only gate. A payload from before the volumes
// migration (a single soundEnabled boolean, no volumes key) also fails
// validation and resets everything, including playerName — accepted, see
// docs/superpowers/specs/2026-07-25-audio-levels-design.md.
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
