import {Button, Container, type Modal, Panel, TextInput} from 'tellurion';

// The New night window is a Modal holding one Panel. Its children are, in this
// order: the title block; the field's row, a Container of the Seed label and
// the field; and the buttons' row, a Container of Start and Close. It imports
// no game module, so a browser test may import it at its top.
export function getNewNightParts(modal: Modal): {input: TextInput; start: Button; close: Button} {
  let [panel] = modal.children;
  let [, fieldRow, buttonRow] = panel instanceof Panel ? panel.children : [];
  let input = fieldRow instanceof Container ? fieldRow.children[1] : undefined;
  let [start, close] = buttonRow instanceof Container ? buttonRow.children : [];

  if (!(input instanceof TextInput) || !(start instanceof Button) || !(close instanceof Button)) {
    throw new TypeError('The New night window has no field, no Start or no Close!');
  }

  return {input, start, close};
}
