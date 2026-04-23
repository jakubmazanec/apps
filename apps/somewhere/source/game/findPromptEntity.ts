import type * as pixi from 'pixi.js';

import {type Entity} from '../engine/ecs/Entity.js';
import {doRectanglesOverlap} from '../utilities/doRectanglesOverlap.js';
import {GraphicsComponent} from './GraphicsComponent.js';
import {MotionComponent} from './MotionComponent.js';
import {playersQuery} from './playersQuery.js';
import {TriggerComponent} from './TriggerComponent.js';

// Art px the prompt band extends beyond a dialogue zone's rect. Zones sit in
// unreachable geometry (a sign flush against its wall), so the band is what
// the player can actually stand in; npcs use their authored interaction rect.
const PROMPT_RANGE = 12;

/**
 * The trigger the interact prompt, and an interact press, resolve against: an
 * npc the player stands in, or a dialogue zone the player stands near. The
 * zone case covers the approach band (walking on into the zone still
 * auto-starts it) and re-reads after a dismissal while still inside. First
 * match wins across overlapping triggers; dialogueSystem and dialogueBoxSystem
 * share this resolution so the bubble always advertises exactly what an
 * interact press would start.
 */
export function findPromptEntity<TEntity extends Entity>(
  entities: Iterable<TEntity>,
): TEntity | null {
  for (let entity of entities) {
    let trigger = entity.getComponent(TriggerComponent);

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

function isPlayerNearRect(rect: pixi.Rectangle): boolean {
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
    rect.x - PROMPT_RANGE,
    rect.y - PROMPT_RANGE,
    rect.width + 2 * PROMPT_RANGE,
    rect.height + 2 * PROMPT_RANGE,
  );
}
