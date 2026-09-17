// The typed mutable flags object: the dialogue context and a save-blob field.
// Module state outlives the world, so world.onStart resets it to defaults
// before applyStagedSave runs; New Game after a finished playthrough starts
// clean and Continue still restores the saved values.
export type Flags = {
  metMira: boolean;
};

function createDefaults(): Flags {
  return {metMira: false};
}

export const flags: Flags = createDefaults();

export function resetFlags(): void {
  Object.assign(flags, createDefaults());
}
