import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/GameScreen.js';
import {game} from './game.js';

let graphics = new pixi.Graphics();

export const loadingScreen = new GameScreen({
  game,
  assetBundles: ['default'],
  onInit: (screen) => {
    screen.view.addChild(graphics);
  },
  onUpdate: (delta, screen) => {
    // graphics.clear();
    // graphics.lineStyle(10, 0xff0000, 1);
    // graphics.beginFill(0xff00cc, 0.5);
    // graphics.moveTo(-120 + Math.sin(0) * 20, -100 + Math.cos(0) * 20);
    // graphics.lineTo(120 + Math.cos(0) * 20, -100 + Math.sin(0) * 20);
    // graphics.lineTo(120 + Math.sin(0) * 20, 100 + Math.cos(0) * 20);
    // graphics.lineTo(-120 + Math.cos(0) * 20, 100 + Math.sin(0) * 20);
    // graphics.lineTo(-120 + Math.sin(0) * 20, -100 + Math.cos(0) * 20);
    // graphics.closePath();
  },
});

game.addLoadingScreen(loadingScreen);
