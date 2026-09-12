import type * as pixi from 'pixi.js';

// Builds the per-state background record each widget keeps, resolving every state the caller left
// unspecified to the widget's default background.
export function resolveBackgrounds<State extends string>(
  states: readonly State[],
  fallback: pixi.Container,
  overrides: Partial<Record<NoInfer<State>, pixi.Container | undefined>>,
): Record<State, pixi.Container> {
  return Object.fromEntries(states.map((state) => [state, overrides[state] ?? fallback])) as Record<
    State,
    pixi.Container
  >;
}
