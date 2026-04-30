import {GameScreen} from '../engine/GameScreen.js';
import {game} from './game.js';
import {world} from './world.js';

export const mainScreen = new GameScreen({
  assetBundles: ['default', 'game'],
  onShow: (screen) => {
    screen.addToView(world);
    world.start();
  },
  onHide: (screen) => {
    world.stop();
    screen.removeFromView(world);
  },
  onUpdate: (ticker, screen) => {},
});

game.addScreen(mainScreen);
