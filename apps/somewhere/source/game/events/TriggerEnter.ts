import {defineEvent, type Entity} from 'tellurion';

export const TriggerEnter = defineEvent<{entity: Entity; trigger: Entity}>();
