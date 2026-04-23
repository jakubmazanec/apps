import {type ErrorScreenContents} from '../source/engine/app/ErrorScreenContents.js';
import {type Game} from '../source/engine/app/Game.js';
import {type GameScreen} from '../source/engine/app/GameScreen.js';

// A richer error screen: satisfies the ErrorScreenContents minimum and carries its own members.
// While GameScreen<T> was invariant, none of the assignments below could compile.
type RichErrorContents = {
  attempts: number;
  retry: () => void;
  showError: (error: unknown) => void;
};

/**
 * Compile-time assertions, enforced by `npm run typecheck`. The screens and `Game` arrive as
 * parameters rather than `declare const`s so nothing here references a binding that does not
 * exist at runtime. The function is never called and never imported.
 */
export function assertContentsCovariance(
  richErrorScreen: GameScreen<RichErrorContents>,
  baseScreen: GameScreen<ErrorScreenContents>,
  game: Game,
) {
  // Covariance: a richer screen satisfies the minimum contract.
  let asContract: GameScreen<ErrorScreenContents> = richErrorScreen;
  // The `any` in Game's T position can be `unknown` once GameScreen is covariant.
  let asUnknown: GameScreen<unknown> = richErrorScreen;
  let heterogeneous: Array<GameScreen<unknown>> = [richErrorScreen];
  // @ts-expect-error base->rich must NOT be assignable; if this ever compiles, GameScreen<T>
  // has drifted to bivariant and the rich->base assertions above stopped proving anything.
  let notAssignable: GameScreen<RichErrorContents> = baseScreen;

  // The production call site: a richer screen is accepted where only the minimum is required.
  game.addErrorScreen(richErrorScreen);

  return {asContract, asUnknown, heterogeneous, notAssignable};
}
