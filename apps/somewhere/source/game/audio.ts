import {AudioComponent} from '../engine/audio/AudioComponent.js';
import {AUDIO_BUSES, AudioMixer} from '../engine/audio/AudioMixer.js';
import {PlaySound} from '../engine/audio/PlaySound.js';
import {Entity} from '../engine/ecs/Entity.js';
import {EventChannel} from '../engine/ecs/EventChannel.js';
import {setAudioDecodeContext} from '../engine/pixi-tools/audioBufferAsset.js';
import {type UiFocusEvent} from '../engine/ui/UiRoot.js';
import {assets} from './assets.js';
import {settings} from './settings.js';

// The one mixer for the whole app. The UI/screen layer imports `audio` and
// calls it directly (it must work with no world, e.g. the main menu); the ECS
// layer reaches the same mixer through audioEntity's AudioComponent.
export const audio = new AudioMixer({createContext: () => new AudioContext()});

// A game module singleton, imported directly by SFX producers (like
// wallHitChannel today) and registered on the world so its swap() runs.
export const playSoundChannel = new EventChannel({event: PlaySound, displayName: 'Play sound'});

export const audioEntity = new Entity({
  components: [new AudioComponent({mixer: audio, channel: playSoundChannel, assets})],
});

// Initial volumes go through the same setter the Options sliders use, so
// settings persistence only ever has to hydrate `settings`, never touch the mixer.
for (let bus of AUDIO_BUSES) {
  audio.setVolume(bus, settings.volumes[bus]);
}

// The shared focus-sound callback passed to every screen (§4): a semantic focus
// event becomes a UI sound here, keeping UiRoot audio-agnostic. `move` reuses
// the click clip (no separate blip asset); `reject` is the error clip.
export function playFocusSound(event: UiFocusEvent): void {
  if (event.type === 'move') {
    audio.play(assets.sound('ui-click'), {bus: 'ui'});
  } else {
    audio.play(assets.sound('ui-error'), {bus: 'ui'});
  }
}

// Client-only bootstrap. The `typeof AudioContext` guard also keeps this safe
// under the happy-dom test env (which has `window` but no AudioContext), so any
// test that transitively imports this module does not construct a context.
/* eslint-disable unicorn/prefer-global-this -- SSR-guarded by `typeof window`; `globalThis` would force a `var` global (vars-on-top) and a no-typeof-undefined/no-unnecessary-condition conflict on the guard */
if (typeof window !== 'undefined' && typeof AudioContext !== 'undefined') {
  // Hand the mixer's context to the loader parser BEFORE any audio bundle
  // loads (Game.init loads the `default` bundle, which carries the UI/menu
  // sounds), then arm the first-gesture unlock.
  setAudioDecodeContext(audio.context);
  audio.unlock();
}
/* eslint-enable unicorn/prefer-global-this */
