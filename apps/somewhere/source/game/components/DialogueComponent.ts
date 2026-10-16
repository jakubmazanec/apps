import {defineComponent, type Dialogue} from 'tellurion';

import {type Flags} from '../core/flags.js';

// One dialogue at a time, structurally: the singleton entity carries the
// active runner (the camera/input/audio pattern). Component sets stay fixed
// at construction; starting a dialogue assigns `active`, ending clears it.
export const DialogueComponent = defineComponent<{active: Dialogue<Flags> | null}>();
