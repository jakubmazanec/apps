import {type ErrorScreenContents} from './ErrorScreenContents.js';
import {type GameScreen} from './GameScreen.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- needed
export type AnyErrorGameScreen = GameScreen<ErrorScreenContents, any>;
