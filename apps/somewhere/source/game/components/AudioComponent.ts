import {type GameAssets} from '../../engine/app/GameAssets.js';
import {type AudioMixer} from '../../engine/audio/AudioMixer.js';
import {defineComponent} from '../../engine/ecs/Component.js';
import {type EventChannel} from '../../engine/ecs/EventChannel.js';
import {type PlaySoundEvent} from '../events/PlaySoundEvent.js';

// Purely for discoverability, mirroring InputComponent. It carries the mixer
// AND the channel because audioSystem reaches the game-owned channel through
// the component rather than importing the module directly. Singleton entity +
// query per the T1.1 pattern; not a module singleton, not a world resource
// (that API arrives with T2.15; the read migrates then). `assets` rides along
// for the same reason: the GameAssets instance is game-created, and its
// accessors are how the system turns an event's asset name into a buffer.
export const AudioComponent = defineComponent<{
  mixer: AudioMixer;
  channel: EventChannel<typeof PlaySoundEvent>;
  assets: GameAssets;
}>();
