import * as pixi from 'pixi.js';

import {Entity} from '../engine/Entity.js';
import {GameScreen} from '../engine/GameScreen.js';
import {GraphicsComponent} from '../engine/GraphicsComponent.js';
import {LevelComponent} from '../engine/LevelComponent.js';
import {MotionComponent} from '../engine/MotionComponent.js';
import {PlayerComponent} from '../engine/PlayerComponent.js';
import {Vector} from '../engine/Vector.js';
import {game} from './game.js';
import {world} from './world.js';

export const mainScreen = new GameScreen({
  game,
  assetBundles: ['default', 'game'],
  onShow: async (screen, game) => {
    let map = new Entity({
      components: [
        new LevelComponent({
          mapOptions: {
            assetName: 'map2',
          },
        }),
      ],
    });
    let player = new Entity({
      components: [
        new PlayerComponent({name: 'Jakub'}),
        new MotionComponent({position: new Vector(95, 70), velocity: new Vector(0, 0)}),
        new GraphicsComponent({
          spriteOptions: {
            assetName: 'character2',
            spriteNames: [
              'standing-down',
              'walking-down',
              'standing-left',
              'walking-left',
              'standing-up',
              'walking-up',
              'standing-right',
              'walking-right',
            ],
          },
          boundingBox: new pixi.Rectangle(0, 40, 64, 40),
        }),
      ],
    });

    world.addEntity(map);
    world.addEntity(player);
    screen.addToView(world);
  },
  onUpdate: (ticker, screen) => {},
});

game.addScreen(mainScreen);

void game.showScreen(mainScreen);
