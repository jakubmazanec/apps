import {Dialogue} from '../engine/dialogue/Dialogue.js';
import {System} from '../engine/ecs/System.js';
import {dialogueCommandChannel} from './dialogueCommandChannel.js';
import {DialogueComponent} from './DialogueComponent.js';
import {dialogueQuery} from './dialogueQuery.js';
import {dialogueRegistry, type DialogueRegistryName} from './dialogueRegistry.js';
import {findPromptEntity} from './findPromptEntity.js';
import {flags} from './flags.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';
import {TriggerComponent} from './TriggerComponent.js';
import {triggerEnterChannel} from './triggerEnterChannel.js';

const REVEAL_SPEED = 40; // characters per second

function startDialogue(component: InstanceType<typeof DialogueComponent>, name: string): void {
  // Spawn-time validation already failed loud on a bad name; here it means an
  // inert NPC or sign, so the start silently no-ops.
  if (!Object.hasOwn(dialogueRegistry, name)) {
    return;
  }

  // eslint-disable-next-line no-param-reassign -- needed
  component.active = new Dialogue({
    script: dialogueRegistry[name as DialogueRegistryName],
    context: flags,
    revealSpeed: REVEAL_SPEED,
  });

  // Stop the player dead on every start, both paths (the doorSystem pattern).
  // The sign path needs it most: its enter edge fires precisely because the
  // player was walking, and the playerSystem lock stops input handling, not
  // already-set velocity; without this, motionSystem slides the locked player
  // through the whole conversation.
  let motion = playersQuery.getFirst().getComponent(MotionComponent);

  motion.target = undefined;
  motion.velocity.set(0, 0);
}

export const dialogueSystem = new System({
  displayName: 'Dialogue system',
  // The component filter gives this system the trigger entities: the set the
  // interact command resolves the standing NPC against.
  components: [TriggerComponent],
  onUpdate: (ticker, system) => {
    let component = dialogueQuery.getFirst().getComponent(DialogueComponent);

    // Every dialogue state decision lives in this one system; channel reads
    // are shared snapshots, so a second deciding consumer would double-fire
    // commands (start a dialogue and instantly skip its first page).
    for (let command of dialogueCommandChannel.events) {
      let {active} = component;

      switch (command.type) {
        case 'advance': {
          // The tap command: dropped while choosing, so a stray tap on the
          // text panel can never confirm a choice. Stale-phase drops are
          // silent; with one-frame channel latency that is buffered-input
          // reality, not an error.
          if (active !== null && (active.phase === 'revealing' || active.phase === 'idle')) {
            active.advance();
          }

          break;
        }

        case 'choose': {
          if (active !== null && command.index !== undefined) {
            active.choose(command.index);
          }

          break;
        }

        case 'down': {
          active?.moveSelection(1);

          break;
        }

        case 'interact': {
          if (active === null) {
            // Start the script of the prompted trigger (the npc the player
            // stands in, or the sign zone they stand near), if any, then move
            // on: the starting press can never also advance.
            let entity = findPromptEntity(system.entities);
            let dialogue = entity?.getComponent(TriggerComponent).properties.dialogue;

            if (typeof dialogue === 'string') {
              startDialogue(component, dialogue);
            }
          } else {
            active.advance();
          }

          break;
        }

        case 'select': {
          if (active !== null && command.index !== undefined) {
            active.select(command.index);
          }

          break;
        }

        case 'up': {
          active?.moveSelection(-1);

          break;
        }
      }
    }

    // Sign auto-start: a zone with a dialogue property starts on the enter
    // edge when none is active (re-entering re-shows, correct for a sign); an
    // enter arriving while a dialogue is active is dropped for good, and only
    // exit-and-re-enter brings it back. Zone sound and dialogue properties
    // compose; zoneSystem is untouched.
    for (let {trigger} of triggerEnterChannel.events) {
      let zone = trigger.getComponent(TriggerComponent);

      if (zone.type !== 'zone' || component.active !== null) {
        continue;
      }

      let {dialogue} = zone.properties;

      if (typeof dialogue === 'string') {
        startDialogue(component, dialogue);
      }
    }

    // Tick on world time after command handling, so a dialogue started this
    // frame starts revealing this frame; a paused world never runs this
    // system, which is the whole pause story.
    if (component.active !== null) {
      component.active.tick(ticker.deltaMS);

      if (component.active.phase === 'ended') {
        component.active = null;
      }
    }
  },
});
