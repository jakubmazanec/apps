import {type UiFocusEvent} from '../../engine/ui/UiRoot.js';
import {assets} from './assets.js';
import {audio} from './audio.js';

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
