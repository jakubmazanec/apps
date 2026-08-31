import {System} from '../../engine/ecs/System.js';
import {AudioComponent} from '../components/AudioComponent.js';

export const audioSystem = new System({
  displayName: 'Audio system',
  components: [AudioComponent],
  onUpdate: (ticker, system) => {
    // getFirst() throws loudly when the singleton entity is missing (the
    // cameraSystem precedent). The system is the only holder of
    // the mixer on the SFX path; gameplay systems only push events.
    let {mixer, channel, assets} = system.getFirst().getComponent(AudioComponent);

    for (let {name} of channel.events) {
      mixer.play(assets.sound(name), {bus: 'sfx'});
    }
  },
});
