import {type FocusCommand} from '../app/FocusCommand.js';
import {type InputBinding} from './GameInput.js';

export type GameInputOptions = {
  /**
   * Focus commands; routed by `Game` into the current screen's `UiRoot`, and observable by a
   * screen as well.
   */
  focus?: Partial<Record<FocusCommand, InputBinding>> | undefined;

  /** Game-named actions, polled by systems through `pressed`/`held`/`released`. */
  actions?: Record<string, InputBinding> | undefined;
};
