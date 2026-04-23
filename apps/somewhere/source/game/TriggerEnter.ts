import {type Entity} from '../engine/ecs/Entity.js';
import {defineEvent} from '../engine/ecs/Event.js';

export const TriggerEnter = defineEvent<{entity: Entity; trigger: Entity}>();
