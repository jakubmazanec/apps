import type * as pixi from 'pixi.js';

import {type Entity} from '../../engine/ecs/Entity.js';
import {doRectanglesOverlap} from '../../engine/utilities/doRectanglesOverlap.js';
import {GraphicsComponent} from '../components/GraphicsComponent.js';
import {MotionComponent} from '../components/MotionComponent.js';
import {TriggerComponent} from '../components/TriggerComponent.js';
import {playersQuery} from '../queries/playersQuery.js';

// Art px the prompt band extends beyond a dialogue zone's rect. Zones sit in
// unreachable geometry (a sign flush against its wall), so the band is what
// the player can actually stand in; npcs use their authored interaction rect.
const PROMPT_RANGE = 12;

/**
 * The trigger the interact prompt, and an interact press, resolve against: an
 * npc or same-map door the player stands in, a dialogue zone the player
 * stands near, or an exit the player stands in or near. The zone case covers
 * the approach band (walking on into the zone still auto-starts it) and
 * re-reads after a dismissal while still inside. First match wins across
 * overlapping triggers; dialogueSystem, travelSystem, doorSystem and
 * dialogueBoxSystem share this resolution so the bubble always advertises
 * exactly what an interact press would do — talk, travel or teleport.
 */
export function findPromptEntity<TEntity extends Entity>(
  entities: Iterable<TEntity>,
): TEntity | null {
  for (let entity of entities) {
    let trigger = entity.getComponent(TriggerComponent);

    // An exit advertises travel, not dialogue: in or near its rect (the near
    // band — exits sit in doorway geometry the player may only brush
    // against) makes it the prompt.
    if (trigger.type === 'exit') {
      if (isPlayerNearRect(trigger.rect)) {
        return entity;
      }

      continue;
    }

    // A door advertises a same-map teleport. It sits on a walkable doorway
    // tile the player steps onto, so standing in it is the prompt; no band,
    // which would otherwise steal the prompt from a neighbor's band (the
    // village hut door sits right under the keep-out sign).
    if (trigger.type === 'door') {
      if (isPlayerNearRect(trigger.rect, 0)) {
        return entity;
      }

      continue;
    }

    if (typeof trigger.properties.dialogue !== 'string') {
      continue;
    }

    if (trigger.type === 'npc' && trigger.isPlayerInside === true) {
      return entity;
    }

    if (trigger.type === 'zone' && isPlayerNearRect(trigger.rect)) {
      return entity;
    }
  }

  return null;
}

function isPlayerNearRect(rect: pixi.Rectangle, range = PROMPT_RANGE): boolean {
  // The [0] guard (world.ts onStop precedent): a DEV throw mid-spawn can leave
  // no player while systems still run.
  let player = playersQuery.entities[0];
  let graphics = player?.getComponent(GraphicsComponent);

  if (player === undefined || graphics === undefined) {
    return false;
  }

  let {position} = player.getComponent(MotionComponent);
  let {boundingBox} = graphics;

  return doRectanglesOverlap(
    position.x + boundingBox.x,
    position.y + boundingBox.y,
    boundingBox.width,
    boundingBox.height,
    rect.x - range,
    rect.y - range,
    rect.width + 2 * range,
    rect.height + 2 * range,
  );
}
