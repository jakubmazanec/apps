import {defineEvent, type Entity} from 'tellurion';

export const PlayerActionFinished = defineEvent<{entity: Entity}>();
