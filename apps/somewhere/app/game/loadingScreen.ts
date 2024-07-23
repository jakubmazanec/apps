// import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/GameScreen.js';
import {game} from './game.js';

export const loadingScreen = new GameScreen({
  game,
  assetBundles: ['default'],
  onInit: (screen) => {},
  onUpdate: (delta, screen) => {},
});

game.addLoadingScreen(loadingScreen);
