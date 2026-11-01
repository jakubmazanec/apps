import {AudioBus, AudioMixer, setAudioDecodeContext} from 'tellurion';

import {settings} from './settings.js';

// The one mixer for the whole app; screens import `audio` and call it
// directly. Constructing the mixer builds a real AudioContext, so this module
// is browser-only: it is reached solely through the route's client-side
// dynamic import (routes/_index.tsx), never on the server.
export const audio = new AudioMixer();

// Initial volumes go through the same setter the Options sliders use, so
// settings persistence only ever has to hydrate `settings`, never touch the
// mixer.
for (let bus of AudioBus) {
  audio.setVolume(bus, settings.volumes[bus]);
}

// Hand the mixer's context to the loader parser BEFORE any audio loads
// (Game.init loads the `default` bundle, which carries the UI sounds and the
// menu music), then arm the first-gesture unlock.
setAudioDecodeContext(audio.context);
audio.unlock();
