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
        flexDirection: 'column',
      },
    });

    let buttonSlice = {leftWidth: 12, topHeight: 12, rightWidth: 12, bottomHeight: 12};

    let makeButtonBackground = () =>
      new pixi.NineSliceSprite({
        texture: pixi.Texture.EMPTY,
        ...buttonSlice,
      });

    let newGameBgNormal = makeButtonBackground();
    let newGameBgHover = makeButtonBackground();
    let newGameBgPressed = makeButtonBackground();
    let newGameBgDisabled = makeButtonBackground();

    let newGameLabel = new Text({
      text: 'New game',
      fontFamily: 'monogram',
      fontSize: 12,
      fill: 0xffffff,
      layout: true,
    });

    let newGameButton = new Button({
      backgrounds: {
        normal: newGameBgNormal,
        hover: newGameBgHover,
        pressed: newGameBgPressed,
        disabled: newGameBgDisabled,
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

    bannerPanel.view.addChild(newGameButton.view);

    return {
      banner,
      bannerPanel,
      newGameButton,
      newGameBackgrounds: {
        normal: newGameBgNormal,
        hover: newGameBgHover,
        pressed: newGameBgPressed,
        disabled: newGameBgDisabled,
      },
    };
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();

    screen.state.banner.texture = pixi.Assets.get('banner');

    for (let [background, asset] of [
      [screen.state.newGameBackgrounds.normal, 'banner'],
      [screen.state.newGameBackgrounds.hover, 'banner-hover'],
      [screen.state.newGameBackgrounds.pressed, 'banner-active'],
      [screen.state.newGameBackgrounds.disabled, 'banner'],
    ] as const) {
      background.texture = pixi.Assets.get(asset);
    }

    screen.view.addChild(screen.state.bannerPanel.view);
  },
  onHide: (screen) => {
    world.stop();
    screen.removeFromView(world);
    screen.view.removeChild(screen.state.bannerPanel.view);
  },
  onResize: () => {},
  onUpdate: () => {},
});
