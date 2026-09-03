import {System} from '../../engine/ecs/System.js';
import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {playSoundChannel} from '../core/playSoundChannel.js';

export const audioSystem = new System({
  displayName: 'Audio system',
  components: [],
  onUpdate: () => {
    // The system is the only holder of the mixer on the SFX path; gameplay
    // systems only push events.
    for (let {name} of playSoundChannel.events) {
      // Zone sounds are map-authored strings (zoneSystem), so `name` is a plain
      // string rather than one of the table's names; the accessor throws on an
      // unknown or unloaded one.
      audio.play(assets.sound(name as Parameters<typeof assets.sound>[0]), {bus: 'sfx'});
    }
  },
});
