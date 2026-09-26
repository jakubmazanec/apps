import {defineEvent} from '../../engine/ecs/Event.js';

// Gameplay SFX, identified by its asset cache key. No bus field — gameplay
// SFX are always the `sfx` bus (§1 boundary rule). Per-play pitch/gain
// variation is a named future field.
export const PlaySoundEvent = defineEvent<{name: string}>();
