import {Button, Container, type Modal, Panel, Text} from 'tellurion';

// The confirmation is a Modal holding one Panel. Its children are, in this
// order: the title block, a Container of the title and the rule; the line's
// Text; and the buttons' row, a Container of the action and Close. It imports
// no game module, so a browser test may import it at its top.
export function getConfirmParts(modal: Modal): {
  action: Button;
  close: Button;
  line: Text;
  title: Text;
} {
  let [panel] = modal.children;
  let [titleBlock, line, buttonRow] = panel instanceof Panel ? panel.children : [];
  let title = titleBlock instanceof Container ? titleBlock.children[0] : undefined;
  let [action, close] = buttonRow instanceof Container ? buttonRow.children : [];

  if (
    !(title instanceof Text) ||
    !(line instanceof Text) ||
    !(action instanceof Button) ||
    !(close instanceof Button)
  ) {
    throw new TypeError('The confirmation has no title, no line, no action or no Close!');
  }

  return {action, close, line, title};
}
