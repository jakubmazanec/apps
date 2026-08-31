import {Entity} from '../../engine/ecs/Entity.js';
import {AudioComponent} from '../components/AudioComponent.js';
import {assets} from './assets.js';
import {audio} from './audio.js';
import {playSoundChannel} from './playSoundChannel.js';

export const audioEntity = new Entity({
  components: [new AudioComponent({mixer: audio, channel: playSoundChannel, assets})],
});
