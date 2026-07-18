import {PlaySound} from '../engine/audio/PlaySound.js';
import {System} from '../engine/ecs/System.js';
import {playSoundChannel} from './audio.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';

export const zoneSystem = new System({
  components: [],
  displayName: 'Zone system',
  onUpdate: () => {
    for (let {trigger} of triggerEnterChannel.events) {
      let zone = trigger.getComponent(TriggerComponent);

      if (zone.type !== 'zone') {
        continue;
      }

      // A zone without a sound is valid: its enter/exit events still fire
      // for future consumers.
      let {sound} = zone.properties;

      if (typeof sound === 'string') {
        playSoundChannel.push(new PlaySound({name: sound}));
      }
    }
  },
});
