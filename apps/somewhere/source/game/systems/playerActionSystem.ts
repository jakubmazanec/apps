import {System} from '../../engine/ecs/System.js';
import {DialogueComponent} from '../components/DialogueComponent.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {InputComponent} from '../components/InputComponent.js';
import {PlayerComponent} from '../components/PlayerComponent.js';
import {playSoundChannel} from '../core/playSoundChannel.js';
import {PlayerActionFinished} from '../events/PlayerActionFinished.js';
import {playerActionFinishedChannel} from '../events/playerActionFinishedChannel.js';
import {PlaySoundEvent} from '../events/PlaySoundEvent.js';
import {dialogueQuery} from '../queries/dialogueQuery.js';
import {inputQuery} from '../queries/inputQuery.js';

export const playerActionSystem = new System({
  displayName: 'Player action system',
  components: [PlayerComponent, GraphicsComponent],
  onUpdate: (ticker, system) => {
    // Last frame's finished spin chimes — the completion emit consumed the
    // standard way, one frame later, like every timer/tween emit.
    if (playerActionFinishedChannel.events.length > 0) {
      playSoundChannel.push(new PlaySoundEvent({name: 'chime'}));
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
