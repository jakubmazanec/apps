import {EventChannel} from '../../engine/ecs/EventChannel.js';
import {PlaySoundEvent} from '../events/PlaySoundEvent.js';

// A game module singleton, imported directly by SFX producers (like
// wallHitChannel today) and registered on the world so its swap() runs.
// Lives in its own module (not game/core/audio.ts) so systems and their
// happy-dom unit tests can import the channel without evaluating the mixer
// bootstrap, which constructs a real AudioContext.
export const playSoundChannel = new EventChannel({
  event: PlaySoundEvent,
  displayName: 'Play sound',
});
