import {type MODIFIER_CODES} from './GameInput.js';

export type Modifier = keyof typeof MODIFIER_CODES;
// Canonical prefix order, so 'Ctrl+Shift+KeyS' and 'Shift+Ctrl+KeyS' are one
// binding and cannot be bound twice.
export const Modifier = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const satisfies readonly Modifier[];
