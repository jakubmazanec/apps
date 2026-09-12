/**
 * Whether a keyboard event targets a text-entry element, i.e. every key
 * belongs to the element and keyboard consumers must stand down. `TextInput`
 * drives its editing through a hidden DOM `<input>`, so `GameInput`'s key
 * listener calls this before consuming a key, letting text entry (or any
 * other native text field) keep its own keys instead of the game.
 */
export function isTextEntryTarget(event: Event): boolean {
  let {target} = event;

  // `GameInput` consumes every key it does not stand down from here, so any
  // element whose keys belong to the DOM has to be named: a textarea, a select
  // and a contenteditable region all handle their own arrows and typing.
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
