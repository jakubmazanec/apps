import {AudioBus} from '../../engine/audio/AudioBus.js';
import {AudioMixer} from '../../engine/audio/AudioMixer.js';
import {setAudioDecodeContext} from '../../engine/pixi-tools/audioBufferAsset.js';
import {settings} from './settings.js';

// The one mixer for the whole app. The UI/screen layer imports `audio` and
// calls it directly (it must work with no world, e.g. the main menu); the ECS
// layer reaches the same mixer through audioSystem's direct import.
// Constructing the mixer builds a real AudioContext, so this module is
// browser-only: it is reached solely through the route's client-side dynamic
// import (routes/_index.tsx), never on the server or under happy-dom.
export const audio = new AudioMixer();

// Initial volumes go through the same setter the Options sliders use, so
// settings persistence only ever has to hydrate `settings`, never touch the mixer.
for (let bus of AudioBus) {
  audio.setVolume(bus, settings.volumes[bus]);
}

// Hand the mixer's context to the loader parser BEFORE any audio bundle loads
// (Game.init loads the `default` bundle, which carries the UI/menu sounds),
// then arm the first-gesture unlock.
setAudioDecodeContext(audio.context);
audio.unlock();
