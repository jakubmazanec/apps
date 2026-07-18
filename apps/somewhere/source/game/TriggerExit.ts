import {type Entity} from '../engine/ecs/Entity.js';
import {defineEvent} from '../engine/ecs/Event.js';

export const TriggerExit = defineEvent<{entity: Entity; trigger: Entity}>();
