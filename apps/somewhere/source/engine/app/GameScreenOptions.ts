import {type EventEmitter} from 'eventemitter3';
import type * as pixi from 'pixi.js';

import {type UiFocusEvent} from '../ui/UiRoot';
import {type Game} from './Game';
import {type GameScreen} from './GameScreen';

export type GameScreenOptions<T, E extends EventEmitter.ValidEventTypes = Record<never, never>> = {
  assetBundles?: string[] | undefined;
  events?: EventEmitter<E> | undefined;
  onFocusEvent?: ((event: UiFocusEvent) => void) | undefined;
  onShow?: ((screen: GameScreen<T, E>, game: Game) => Promise<void> | void) | undefined;
  onHide?: ((screen: GameScreen<T, E>, game: Game) => Promise<void> | void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, screen: GameScreen<T, E>, game: Game) => void) | undefined;
  onResize?: ((screen: GameScreen<T, E>, game: Game) => void) | undefined;
  // Escape (the `cancel` focus command) that no focus scope claimed. The game
  // screen opens the pause menu here; a menu screen can go back.
  onCancel?: ((screen: GameScreen<T, E>, game: Game) => void) | undefined;
} & (undefined extends T ? {onAttach?: ((screen: GameScreen<T, E>, game: Game) => T) | undefined}
: {onAttach: (screen: GameScreen<T, E>, game: Game) => T});
