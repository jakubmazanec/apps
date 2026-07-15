import * as pixi from 'pixi.js';

import {System} from '../ecs/System.js';
import {AudioComponent} from './AudioComponent.js';

export const audioSystem = new System({
  displayName: 'Audio system',
  components: [AudioComponent],
  onUpdate: (ticker, system) => {
    // getFirst() throws loudly when the singleton entity is missing (the
    // inputSystem/cameraSystem precedent). The system is the only holder of
    // the mixer on the SFX path; gameplay systems only push events.
    let {mixer, channel} = system.getFirst().getComponent(AudioComponent);

    for (let {name} of channel.events) {
      let buffer = pixi.Assets.get<AudioBuffer | undefined>(name);

      if (!buffer) {
        // DEV-throw / prod-warn, then skip (house style): a silent drop
        // reproduces as an inexplicably missing sound effect.
        let message = `No audio buffer loaded for sound "${name}"!`;

        if (import.meta.env.DEV) {
          throw new Error(message);
        }

        // eslint-disable-next-line no-console -- loud failure in production builds (DEV throws)
        console.warn(message);

        continue;
      }

      mixer.play(buffer, {bus: 'sfx'});
    }
  },
});
