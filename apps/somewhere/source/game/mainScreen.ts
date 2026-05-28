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
      text: 'Somewhere.',
      fontFamily: 'monogram',
      fontSize: 48,
      fill: 0xffffff,
      layout: true,
    });

    let title2 = new Text({
      text: 'Somewhere',
      fontFamily: 'monogram-outline',
      fontSize: 48,
      // fill: 0xffff00,
      layout: true,
    });

    let banner = new pixi.NineSliceSprite({
      texture: pixi.Assets.get('banner'),
      leftWidth: 12,
      topHeight: 4,
      rightWidth: 12,
      bottomHeight: 12,
    });

    let bannerPanel = new Panel({
      background: banner,
      children: [title.view, title2.view],
      layout: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
      },
    });

    let buttonSlice = {leftWidth: 12, topHeight: 12, rightWidth: 12, bottomHeight: 12};

    let makeButtonBackground = (texture: pixi.Texture) =>
      new pixi.NineSliceSprite({
        texture,
        ...buttonSlice,
      });

    let newGameBgNormal = makeButtonBackground(pixi.Assets.get('banner'));
    let newGameBgHover = makeButtonBackground(pixi.Assets.get('banner-hover'));
    let newGameBgPressed = makeButtonBackground(pixi.Assets.get('banner-active'));
    let newGameBgDisabled = makeButtonBackground(pixi.Assets.get('banner'));

    let newGameLabel = new Text({
      text: 'New game',
      fontFamily: 'monogram-outline',
      fontSize: 48,
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
      bannerPanel,
      newGameButton,
    };
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();

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
