import * as pixi from 'pixi.js';

import {GameScreen} from '../engine/app/GameScreen.js';
import {easeOutQuad} from '../engine/scheduler/easing.js';
import {Button} from '../engine/ui/Button.js';
import {Container} from '../engine/ui/Container.js';
import {Panel} from '../engine/ui/Panel.js';
import {Text} from '../engine/ui/Text.js';
import {TextInput} from '../engine/ui/TextInput.js';
import {Toggle} from '../engine/ui/Toggle.js';
import {game} from './game.js';
import {type UIEventMap, uiEvents} from './uiEvents.js';
import {world} from './world.js';

type MainScreenState = {
  bannerPanel: Panel;
  hitCounter: Text;
  newGameButton: Button;
};

let wallHitCount = 0;

export const mainScreen = new GameScreen<MainScreenState, UIEventMap>({
  assetBundles: ['default', 'game'],
  events: uiEvents,
  focusRing: {
    assetName: 'focus-ring',
    leftWidth: 4,
    topHeight: 4,
    rightWidth: 4,
    bottomHeight: 4,
    padding: 8,
  },
  onAdd: (screen): MainScreenState => {
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
    let buttonActiveSlice = {leftWidth: 4, topHeight: 8, rightWidth: 4, bottomHeight: 4};
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
        active: nineSlice('button-active', buttonActiveSlice),
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
      },
    });

    bannerPanel.addChild(newGameButton);

    // --- DEMO (temporary): verify Toggle + TextInput ---
    let toggleSprite = (name: string) => new pixi.Sprite(pixi.Assets.get(name));

    // Each Toggle owns and destroys its background sprites, so build a fresh set
    // per toggle rather than sharing instances.
    let toggleBackgrounds = () => ({
      unchecked: toggleSprite('toggle-unchecked'),
      checked: toggleSprite('toggle-checked'),
      hovered: toggleSprite('toggle-hovered'),
      hoveredChecked: toggleSprite('toggle-hovered-checked'),
      disabled: toggleSprite('toggle-disabled'),
      disabledChecked: toggleSprite('toggle-disabled-checked'),
    });

    let demoToggle = new Toggle({
      backgrounds: toggleBackgrounds(),
      onChange: (toggle) => {
        // eslint-disable-next-line no-console -- demo
        console.log('toggle', toggle.isChecked);
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

    let enableToggle = new Toggle({
      backgrounds: toggleBackgrounds(),
      checked: true,
      onChange: (toggle) => {
        if (toggle.isChecked) {
          demoToggle.enable();
        } else {
          demoToggle.disable();
        }
      },
    });

    let enableToggleRow = new Container({
      children: [
        new Text({
          text: 'Enable sound',
          fontFamily: 'monogram-outline',
          fontSize: 48,
          fill: 0xffffff,
          layout: true,
        }),
        enableToggle,
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
        minWidth: 220,
        padding: 16,
      },
    });

    bannerPanel.addChild(demoToggleRow, enableToggleRow, demoInput);
    // --- END DEMO ---

    // --- Reminder dialog: after a user-supplied delay, fade in a dismissable panel ---
    // Exercises scheduler.after (the delay) and scheduler.tween (the fade in / out); if the screen
    // hides mid-flight, GameScreen.hide()'s scheduler.clear() cancels the pending timer/tween.
    let openReminder = () => {
      // Forward-declared so the Close button's handler can fade out the panel that owns it.
      let panel: Panel;

      let closeButton = new Button({
        backgrounds: {
          normal: nineSlice('button-normal', buttonSlice),
          hovered: nineSlice('button-hovered', buttonSlice),
          active: nineSlice('button-active', buttonActiveSlice),
          disabled: nineSlice('button-disabled', buttonSlice),
        },
        children: [
          new Text({
            text: 'Close',
            fontFamily: 'monogram-outline',
            fontSize: 48,
            fill: 0xffffff,
            layout: true,
          }),
        ],
        pressOffset: 4,
        onClick: () => {
          // Fade out, then remove and destroy once fully transparent.
          screen.scheduler.tween({
            target: panel.view,
            to: {alpha: 0},
            duration: 200,
            easing: easeOutQuad,
            onComplete: () => {
              screen.ui.removeChild(panel);
              panel.destroy();
            },
          });
        },
        layout: {padding: 8},
      });

      panel = new Panel({
        background: nineSlice('banner', {
          leftWidth: 12,
          topHeight: 4,
          rightWidth: 12,
          bottomHeight: 12,
        }),
        children: [
          new Text({
            text: 'Time is up!',
            fontFamily: 'monogram-outline',
            fontSize: 48,
            fill: 0xffffff,
            layout: true,
          }),
          closeButton,
        ],
        layout: {flexDirection: 'column', gap: 16, padding: 24, alignItems: 'center'},
      });

      // Start hidden and roughly centered on screen, then fade in.
      panel.view.alpha = 0;
      panel.view.position.set(
        Math.round(game.app.screen.width / 2 - 160),
        Math.round(game.app.screen.height / 2 - 80),
      );
      screen.ui.addChild(panel);
      screen.scheduler.tween({
        target: panel.view,
        to: {alpha: 1},
        duration: 200,
        easing: easeOutQuad,
      });
    };

    let delayInput = new TextInput({
      backgrounds: {
        normal: nineSlice('text-input-normal', inputSlice),
        hovered: nineSlice('text-input-hovered', inputSlice),
        disabled: nineSlice('text-input-disabled', inputSlice),
      },
      placeholder: 'delay in ms',
      fontFamily: 'monogram',
      fontSize: 48,
      fill: 0xffffff,
      maxLength: 6,
      container: game.app.canvas.parentElement ?? document.body,
      layout: {minWidth: 220, padding: 16},
    });

    let startButton = new Button({
      backgrounds: {
        normal: nineSlice('button-normal', buttonSlice),
        hovered: nineSlice('button-hovered', buttonSlice),
        active: nineSlice('button-active', buttonActiveSlice),
        disabled: nineSlice('button-disabled', buttonSlice),
      },
      children: [
        new Text({
          text: 'Start reminder',
          fontFamily: 'monogram-outline',
          fontSize: 48,
          fill: 0xffffff,
          layout: true,
        }),
      ],
      pressOffset: 4,
      onClick: () => {
        // TextInput is text-only, so parse and guard before scheduling.
        let ms = Number(delayInput.value);

        if (!Number.isFinite(ms) || ms <= 0) {
          return;
        }

        screen.scheduler.after(ms, openReminder);
      },
      layout: {padding: 8},
    });

    bannerPanel.addChild(delayInput, startButton);
    // --- END Reminder dialog ---

    let hitCounter = new Text({
      text: 'Wall hits: 0',
      fontFamily: 'monogram-outline',
      fontSize: 48,
      fill: 0xffffff,
      layout: true,
    });

    return {
      bannerPanel,
      newGameButton,
      hitCounter,
    };
  },
  onShow: (screen) => {
    screen.addToView(world);
    world.start();

    wallHitCount = 0;
    screen.state.hitCounter.setText('Wall hits: 0');
    screen.ui.addChild(screen.state.bannerPanel);
    screen.ui.addChild(screen.state.hitCounter);

    screen.subscribe('world:wallHit', () => {
      wallHitCount += 1;
      screen.state.hitCounter.setText(`Wall hits: ${wallHitCount}`);
    });
  },
  onHide: (screen) => {
    world.stop();
    screen.removeFromView(world);
    screen.ui.removeChild(screen.state.bannerPanel);
    screen.ui.removeChild(screen.state.hitCounter);
  },
  onResize: () => {},
  onUpdate: () => {},
});
