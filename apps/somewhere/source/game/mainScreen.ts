import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {Button} from '../engine/ui/Button.js';
import {Container} from '../engine/ui/Container.js';
import {Panel} from '../engine/ui/Panel.js';
import {Text} from '../engine/ui/Text.js';
import {TextInput} from '../engine/ui/TextInput.js';
import {Toggle} from '../engine/ui/Toggle.js';
import {game} from './game.js';
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
      children: [title, title2],
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
        hovered: newGameBgHover,
        pressed: newGameBgPressed,
        disabled: newGameBgDisabled,
      },
      children: [newGameLabel],
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

    bannerPanel.addChild(newGameButton);

    // --- DEMO (temporary): verify Toggle + TextInput ---
    let toggleSprite = (name: string) => new pixi.Sprite(pixi.Assets.get(name));

    let demoToggle = new Toggle({
      backgrounds: {
        unchecked: toggleSprite('toggle-unchecked'),
        checked: toggleSprite('toggle-checked'),
        hovered: toggleSprite('toggle-hovered'),
        hoveredChecked: toggleSprite('toggle-hovered-checked'),
        disabled: toggleSprite('toggle-disabled'),
        disabledChecked: toggleSprite('toggle-disabled-checked'),
      },
      onChange: (toggle) => {
        // eslint-disable-next-line no-console -- demo
        console.log('toggle', toggle.checked);
      },
    });

    let demoToggleRow = new Container({
      children: [
        new Text({
          text: 'Sound',
          fontFamily: 'monogram-outline',
          fontSize: 48,
          fill: 0xffffff,
          layout: true,
        }),
        demoToggle,
      ],
      layout: {gap: 12},
    });

    let demoInput = new TextInput({
      background: makeButtonBackground(pixi.Assets.get('banner')),
      placeholder: 'Name...',
      fontFamily: 'monogram',
      fontSize: 32,
      fill: 0xffffff,
      maxLength: 16,
      container: game.app.canvas.parentElement ?? document.body,
      onChange: (input) => {
        // eslint-disable-next-line no-console -- demo
        console.log('input', input.value);
      },
      layout: {padding: 12, minWidth: 220},
    });

    bannerPanel.addChild(demoToggleRow, demoInput);
    // --- END DEMO ---

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
