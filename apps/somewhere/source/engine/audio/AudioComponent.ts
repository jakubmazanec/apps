import {defineComponent} from '../ecs/Component.js';
import {type EventChannel} from '../ecs/EventChannel.js';
import {type AudioMixer} from './AudioMixer.js';
import {type PlaySound} from './PlaySound.js';

// Purely for discoverability, mirroring InputComponent. It carries the mixer
// AND the channel because the engine audioSystem cannot import a game-created
// channel (engine must not depend on game) — the component is how the engine
// system reaches a game-owned channel. Singleton entity + query per the T1.1
// pattern; not a module singleton, not a world resource (that API arrives with
// T2.15; the read migrates then).
export const AudioComponent = defineComponent<{
  mixer: AudioMixer;
  channel: EventChannel<typeof PlaySound>;
}>();
