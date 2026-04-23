import {defineEvent} from '../engine/ecs/Event.js';

export type DialogueCommandType = 'advance' | 'choose' | 'down' | 'interact' | 'select' | 'up';

// `index` rides only `select` and `choose`; producers omit it otherwise
// (exactOptionalPropertyTypes rejects an explicit `index: undefined`).
export const DialogueCommand = defineEvent<{type: DialogueCommandType; index?: number}>();
