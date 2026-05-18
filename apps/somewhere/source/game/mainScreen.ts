import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {Text} from '../engine/graphics/Text.js';
import {Button} from '../engine/ui/Button.js';
import {Panel} from '../engine/ui/Panel.js';
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
      layout: true,
    });

    let banner = new pixi.NineSliceSprite({
      texture: pixi.Texture.EMPTY,
      leftWidth: 12,
      topHeight: 4,
      rightWidth: 12,
      bottomHeight: 12,
    });

    let bannerPanel = new Panel({
      background: banner,
      children: [title.view],
      layout: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
      },
    });

    let buttonSlice = {leftWidth: 12, topHeight: 12, rightWidth: 12, bottomHeight: 12};

    let makeButtonSprite = (tint: number) => {
      let sprite = new pixi.NineSliceSprite({
        texture: pixi.Texture.EMPTY,
        ...buttonSlice,
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
      layout: true,
    });

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
      layout: {
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
      },
    });
    newGameButton.view.addChild(newGameLabel.view);

    return {
      banner,
      bannerPanel,
      newGameButton,
      newGameSprites: [newGameNormal, newGameHover, newGamePressed, newGameDisabled],
    };
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();

    screen.state.banner.texture = pixi.Assets.get('banner');

    for (let sprite of screen.state.newGameSprites) {
      sprite.texture = pixi.Assets.get('banner');
    }

    screen.view.addChild(screen.state.bannerPanel.view);
    // screen.view.addChild(screen.state.newGameButton.view);
  },
  onHide: (screen) => {
    world.stop();
    screen.removeFromView(world);
    screen.view.removeChild(screen.state.bannerPanel.view);
    screen.view.removeChild(screen.state.newGameButton.view);
  },
  onResize: () => {},
  onUpdate: () => {},
});
