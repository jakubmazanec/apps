import {z} from 'zod';

import {PersistedStore} from '../engine/storage/PersistedStore.js';

const settingsStore = new PersistedStore({
  key: 'somewhere:settings',
  schema: z.object({playerName: z.string(), soundEnabled: z.boolean()}),
  defaults: () => ({playerName: '', soundEnabled: true}),
});

// Game settings: a plain mutable object, written directly by the Options UI
// and read where needed (no getter/setter ceremony). Hydrated from
// localStorage at module load; write sites call saveSettings() right after
// each mutation. A corrupt or schema-rejected payload silently resets to
// defaults — the schema is the only gate.
export const settings = settingsStore.load();

export function saveSettings(): void {
  settingsStore.save(settings);
}
