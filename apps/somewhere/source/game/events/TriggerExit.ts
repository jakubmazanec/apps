import {defineEvent, type Entity} from 'tellurion';

export const TriggerExit = defineEvent<{entity: Entity; trigger: Entity}>();
