/* eslint-disable no-param-reassign -- needed */
import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {Text} from '../engine/graphics/Text.js';
import {Button} from '../engine/ui/Button.js';
import {game} from './game.js';
import {world} from './world.js';

export const mainScreen = new GameScreen({
  assetBundles: ['default', 'game'],
  onAdd: () => {
    let title = new Text({
      text: 'Somewhere',
      fontFamily: 'monogram',
      fontSize: 12,
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
    let banner = new pixi.NineSliceSprite({
      texture: pixi.Texture.EMPTY,
      leftWidth: 12,
      topHeight: 4,
      rightWidth: 12,
      bottomHeight: 12,
      width: 240,
      height: 52,
    });

    let buttonSlice = {leftWidth: 12, topHeight: 12, rightWidth: 12, bottomHeight: 12};
    let buttonWidth = 160;
    let buttonHeight = 32;

    let makeButtonSprite = (tint: number) => {
      let sprite = new pixi.NineSliceSprite({
        texture: pixi.Texture.EMPTY,
        ...buttonSlice,
        width: buttonWidth,
        height: buttonHeight,
      });

      sprite.tint = tint;

      return sprite;
    };

    let newGameNormal = makeButtonSprite(0xffffff);
    let newGameHover = makeButtonSprite(0xccccff);
    let newGamePressed = makeButtonSprite(0x8888bb);
    let newGameDisabled = makeButtonSprite(0x555555);

    let newGameLabel = new Text({
      text: 'New game',
      fontFamily: 'monogram',
      fontSize: 12,
      fill: 0xffffff,
      anchor: {x: 0.5, y: 0.5},
    });
    newGameLabel.view.position.set(buttonWidth / 2, buttonHeight / 2);

    let newGameButton = new Button({
      sprites: {
        normal: newGameNormal,
        hover: newGameHover,
        pressed: newGamePressed,
        disabled: newGameDisabled,
      },
      onClick: () => {
        // eslint-disable-next-line no-console -- placeholder until Game screen exists
        console.log('New game clicked');
      },
    });
    newGameButton.view.addChild(newGameLabel.view);

    return {
      title,
      fillExample,
      tintExample,
      outlineMR,
      shadowMR,
      banner,
      newGameButton,
      newGameSprites: [newGameNormal, newGameHover, newGamePressed, newGameDisabled],
    };
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();
    screen.state.banner.texture = pixi.Assets.get('banner');
    screen.view.addChild(screen.state.banner);

    screen.state.banner.width = 300;

    for (let sprite of screen.state.newGameSprites) {
      sprite.texture = pixi.Assets.get('banner');
    }

    screen.view.addChild(screen.state.newGameButton.view);

    for (let label of [
      screen.state.title,
      // screen.state.fillExample,
      // screen.state.tintExample,
      // screen.state.outlineMR,
      // screen.state.shadowMR,
    ]) {
      screen.view.addChild(label.view);
    }
  },
  onHide: (screen) => {
    world.stop();
    screen.removeFromView(world);
    screen.view.removeChild(screen.state.banner);
    screen.view.removeChild(screen.state.newGameButton.view);
    for (let label of [
      screen.state.title,
      // screen.state.fillExample,
      // screen.state.tintExample,
      // screen.state.outlineMR,
      // screen.state.shadowMR,
    ]) {
      screen.view.removeChild(label.view);
    }
  },
  onResize: (screen, game) => {
    screen.state.title.view.x = 4 * 3;
    screen.state.title.view.y = 0;
    screen.state.banner.x = 4 * 3;
    screen.state.banner.y = 24;
    screen.state.newGameButton.view.x = 4 * 3;
    screen.state.newGameButton.view.y = 90;
  },
  onUpdate: (ticker, screen) => {
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
