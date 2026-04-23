import {type Entity} from '../engine/ecs/Entity.js';
import {defineEvent} from '../engine/ecs/Event.js';

export const PopupExpired = defineEvent<{entity: Entity}>();
