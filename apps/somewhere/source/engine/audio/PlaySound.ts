import {defineEvent} from '../ecs/Event.js';

// Engine-generic gameplay SFX, identified by its asset cache key. No bus field
// — gameplay SFX are always the `sfx` bus (§1 boundary rule). Per-play
// pitch/gain variation is a named future field.
export const PlaySound = defineEvent<{name: string}>();
