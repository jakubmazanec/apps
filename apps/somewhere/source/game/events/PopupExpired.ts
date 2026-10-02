import {defineEvent, type Entity} from 'tellurion';

export const PopupExpired = defineEvent<{entity: Entity}>();
