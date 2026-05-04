/* eslint-disable no-param-reassign -- needed */
import {GameScreen} from '../engine/app/GameScreen.js';
import {Text} from '../engine/graphics/Text.js';
import {game} from './game.js';
import {world} from './world.js';

export const mainScreen = new GameScreen({
  assetBundles: ['default', 'game'],
  onAdd: () => {
    let title = new Text({
      text: 'SOMEWHERE',
      fontFamily: 'px sans nouveaux',
      fontSize: 16,
      fill: 0xffffff,
      outlineColor: 'rgba(0,0,0,0.8)',
    });
    let fillExample = new Text({
      text: 'Solid fill (#ff5577)',
      fontFamily: 'px sans nouveaux',
      fontSize: 16,
      fill: 0xff5577,
    });
    let tintExample = new Text({
      text: 'Animated tint',
      fontFamily: 'px sans nouveaux',
      fontSize: 16,
      fill: 0xffffff,
    });
    let outlineMR = new Text({
      text: 'Multi-render outline',
      fontFamily: 'px sans nouveaux',
      fontSize: 16,
      fill: 0xffffff,
      outlineColor: 'rgba(0,0,0,0.8)',
    });
    let shadowMR = new Text({
      text: 'Multi-render shadow',
      fontFamily: 'px sans nouveaux',
      fontSize: 16,
      fill: 0xffffff,
      shadowColor: 'rgba(0,0,0,0.8)',
    });

    return {title, fillExample, tintExample, outlineMR, shadowMR};
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();
    for (let label of [
      screen.state.title,
      // screen.state.fillExample,
      // screen.state.tintExample,
      // screen.state.outlineMR,
      // screen.state.shadowMR,
    ]) {
      screen.view.addChild(label);
    }
  },
  onHide: (screen) => {
    world.stop();
    screen.removeFromView(world);
    for (let label of [
      screen.state.title,
      // screen.state.fillExample,
      // screen.state.tintExample,
      // screen.state.outlineMR,
      // screen.state.shadowMR,
    ]) {
      screen.view.removeChild(label);
    }
  },
  onUpdate: (ticker, screen) => {
    // let cx = screen.game.app.screen.width / 2;
    // let labels = [
    //   screen.state.title,
    //   screen.state.fillExample,
    //   screen.state.tintExample,
    //   screen.state.outlineMR,
    //   screen.state.shadowMR,
    // ];

    screen.state.title.x = 4 * 3;
    screen.state.title.y = 0;

    // for (let [index, label] of labels.entries()) {
    //   label.x = 0;
    //   label.y = 0 + index * 64;
    // }

    // let h = ((ticker.lastTime / 1000) * 0.2) % 1;
    // let i = Math.floor(h * 6);
    // let f = h * 6 - i;
    // let q = 1 - f;
    // let rgb: readonly [number, number, number] = [
    //   [1, f, 0],
    //   [q, 1, 0],
    //   [0, 1, f],
    //   [0, q, 1],
    //   [f, 0, 1],
    //   [1, 0, q],
    // ][i % 6] as [number, number, number];

    // screen.state.tintExample.tint =
    //   // eslint-disable-next-line no-bitwise -- needed
    //   (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
  },
});

game.addScreen(mainScreen);
