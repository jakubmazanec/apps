import {type Disposables} from '../source/engine/utilities/Disposables.js';

/**
 * Compile-time assertions, enforced by `npm run typecheck`. The stacks arrive as parameters
 * rather than `declare const`s so nothing here references a binding that does not exist at
 * runtime. The function is never called and never imported.
 */
export function assertDisposablesShape(
  widget: Disposables<'instance', 'editing'>,
  renewableOnly: Disposables<never, 'mounted'>,
  fresh: DisposableStack,
) {
  // A permanent stack is always there...
  let instance: DisposableStack = widget.instance;

  // @ts-expect-error ...and never reassigned.
  widget.instance = fresh;

  // A renewable stack is null between lifetimes, so it is not a stack outright...
  // @ts-expect-error null must be checked first
  let unchecked: DisposableStack = widget.editing;
  let checked: DisposableStack | null = widget.editing;

  // ...and is assigned when its lifetime starts and nulled when it ends.
  widget.editing = fresh;
  widget.editing = null;

  // A class with no permanent stack has only its renewable keys.
  let mounted: DisposableStack | null = renewableOnly.mounted;
  // @ts-expect-error no permanent key was declared
  let missing: keyof typeof renewableOnly = 'instance';

  return {instance, unchecked, checked, mounted, missing};
}
