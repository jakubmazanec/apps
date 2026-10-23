import {type EventEmitter} from 'eventemitter3';
import type * as pixi from 'pixi.js';

import {type UiFocusEvent} from '../ui/UiFocusEvent.js';
import {type Game} from './Game.js';
import {type GameScreen} from './GameScreen.js';

// TODO: proper document comments for these options!
export type GameScreenOptions<T, E extends EventEmitter.ValidEventTypes = Record<never, never>> = {
  assetBundles?: string[] | undefined;
  events?: EventEmitter<E> | undefined;
  onFocusEvent?: ((event: UiFocusEvent) => void) | undefined;
  onShow?: ((screen: GameScreen<T, E>, game: Game) => Promise<void> | void) | undefined;
  onHide?: ((screen: GameScreen<T, E>, game: Game) => Promise<void> | void) | undefined;
  onUpdate?: ((ticker: pixi.Ticker, screen: GameScreen<T, E>, game: Game) => void) | undefined;
  onResize?: ((screen: GameScreen<T, E>, game: Game) => void) | undefined;
} & (undefined extends T ? {onAttach?: ((screen: GameScreen<T, E>, game: Game) => T) | undefined}
: {onAttach: (screen: GameScreen<T, E>, game: Game) => T});
