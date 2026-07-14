/**
 * Whether a keyboard event targets a text-entry element, i.e. every key
 * belongs to the element and keyboard consumers must stand down. `TextInput`
 * drives its editing through a hidden DOM `<input>`; this predicate lives next
 * to it so the module that creates that element owns the knowledge of what
 * counts as one. Both `Game`'s focus-key handler and `Input`'s key listeners
 * call it.
 */
export function isTextEntryTarget(event: Event): boolean {
  return event.target instanceof HTMLInputElement;
}
