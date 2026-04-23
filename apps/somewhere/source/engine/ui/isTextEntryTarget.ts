/**
 * Whether a keyboard event targets a text-entry element, i.e. every key
 * belongs to the element and keyboard consumers must stand down. `TextInput`
 * drives its editing through a hidden DOM `<input>`; this predicate lives next
 * to it so the module that creates that element owns the knowledge of what
 * counts as one. Both `Game`'s focus-key handler and `GameInput`'s key listeners
 * call it.
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
