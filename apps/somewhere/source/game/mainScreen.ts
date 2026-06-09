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

    let nineSlice = (
      name: string,
      slice: {bottomHeight: number; leftWidth: number; rightWidth: number; topHeight: number},
    ) => new pixi.NineSliceSprite({texture: pixi.Assets.get(name), ...slice});

    let buttonSlice = {leftWidth: 4, topHeight: 8, rightWidth: 4, bottomHeight: 8};
    let buttonPressedSlice = {leftWidth: 4, topHeight: 8, rightWidth: 4, bottomHeight: 4};
    let inputSlice = {leftWidth: 4, topHeight: 4, rightWidth: 4, bottomHeight: 4};

    let newGameLabel = new Text({
      text: 'Ňew game',
      fontFamily: 'monogram-outline',
      fontSize: 48,
      fill: 0xffffff,
      layout: true,
    });

    let newGameButton = new Button({
      backgrounds: {
        normal: nineSlice('button-normal', buttonSlice),
        hovered: nineSlice('button-hovered', buttonSlice),
        pressed: nineSlice('button-pressed', buttonPressedSlice),
        disabled: nineSlice('button-disabled', buttonSlice),
      },
      children: [newGameLabel],
      pressOffset: 4,
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
      backgrounds: {
        normal: nineSlice('text-input-normal', inputSlice),
        hovered: nineSlice('text-input-hovered', inputSlice),
        disabled: nineSlice('text-input-disabled', inputSlice),
      },
      placeholder: 'Name...',
      fontFamily: 'monogram',
      fontSize: 48,
      fill: 0xffffff,
      maxLength: 16,
      container: game.app.canvas.parentElement ?? document.body,
      onChange: (input) => {
        // eslint-disable-next-line no-console -- demo
        console.log('input', input.value);
      },
      layout: {
        height: 72,
        minWidth: 220,
        paddingLeft: 16,
        paddingRight: 16,
        justifyContent: 'center',
        alignItems: 'flex-start',
      },
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
