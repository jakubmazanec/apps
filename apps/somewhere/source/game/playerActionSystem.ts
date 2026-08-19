import {PlaySound} from '../engine/audio/PlaySound.js';
import {System} from '../engine/ecs/System.js';
import {InputComponent} from '../engine/input/InputComponent.js';
import {playSoundChannel} from './audio.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueQuery} from './dialogueQuery.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {inputQuery} from './inputQuery.js';
import {PlayerActionFinished} from './PlayerActionFinished.js';
import {playerActionFinishedChannel} from './playerActionFinishedChannel.js';
import {PlayerComponent} from './PlayerComponent.js';

export const playerActionSystem = new System({
  displayName: 'Player action system',
  components: [PlayerComponent, GraphicsComponent],
  onUpdate: (ticker, system) => {
    // Last frame's finished spin chimes — the completion emit consumed the
    // standard way, one frame later, like every timer/tween emit.
    if (playerActionFinishedChannel.events.length > 0) {
      playSoundChannel.push(new PlaySound({name: 'chime'}));
    }

    // Dialogue movement lock, same policy as playerSystem: no actions while
    // a conversation runs.
    if (dialogueQuery.getFirst().getComponent(DialogueComponent).active !== null) {
      return;
    }

    let {input} = inputQuery.getFirst().getComponent(InputComponent);

    if (input.pressed('spin')) {
      for (let entity of system.entities) {
        let {sprite, spriteNamePrefix} = entity.getComponent(GraphicsComponent);

        sprite.show(`${spriteNamePrefix}spin`, {
          emit: {
            channel: playerActionFinishedChannel,
            event: new PlayerActionFinished({entity}),
          },
        });
      }
    }
  },
});
