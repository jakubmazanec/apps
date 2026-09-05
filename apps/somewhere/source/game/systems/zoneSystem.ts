import {System} from '../../engine/ecs/System.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {playSoundChannel} from '../core/playSoundChannel.js';
import {PlaySoundEvent} from '../events/PlaySoundEvent.js';
import {triggerEnterChannel} from '../events/triggerEnterChannel.js';

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
        playSoundChannel.push(new PlaySoundEvent({name: sound}));
      }
    }
  },
});
