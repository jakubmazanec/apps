import {type UiFocusEvent} from 'tellurion';

import {assets} from './assets.js';
import {audio} from './audio.js';

// The focus-sound callback every screen passes as onFocusEvent: a semantic
// focus event becomes a UI sound here, which keeps UiRoot audio-agnostic.
// `move` plays the click clip and `reject` the error clip.
export function playFocusSound(event: UiFocusEvent): void {
  if (event.type === 'move') {
    audio.play(assets.sound('ui-click'), {bus: 'ui'});
  } else {
    audio.play(assets.sound('ui-error'), {bus: 'ui'});
  }
}
