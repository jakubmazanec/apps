import {Button, GameScreen, Panel, Text} from 'tellurion';

import {assets} from '../core/assets.js';
import {audio} from '../core/audio.js';
import {game} from '../core/game.js';
import {playFocusSound} from '../core/playFocusSound.js';

type MainMenuScreenContents = {
  newGameButton: Button;
  optionsButton: Button;
};

export const mainMenuScreen = new GameScreen<MainMenuScreenContents>({
  assetBundles: ['default'],
  onFocusEvent: playFocusSound,
  onAttach: (screen): MainMenuScreenContents => {
    // The background is the app's black (Game.init). Centering via flex on the
    // root layout path: the percentages resolve against game.view, so a window
    // resize is handled for free.

    screen.view.layout = {width: '100%', height: '100%'};

    screen.ui.view.layout = {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
    };

    let title = new Text({text: 'Foam', theme: game.theme, layout: true});
    // No onClick: the screen New Game opens does not exist yet. The button is
    // disabled below, which also takes it out of the focus order.
    let newGameButton = new Button({
      theme: game.theme,
      children: [new Text({text: 'New Game', theme: game.theme, layout: true})],
    });
    let optionsButton = new Button({
      theme: game.theme,
      children: [new Text({text: 'Options', theme: game.theme, layout: true})],
    });

    newGameButton.disable();
    screen.ui.addChild(
      new Panel({
        theme: game.theme,
        children: [title, newGameButton, optionsButton],
        layout: {
          padding: 8,
          alignItems: 'center',
          flexDirection: 'column',
          gap: 4,
        },
      }),
    );

    return {newGameButton, optionsButton};
  },
  onShow: () => {
    // Music is driven by direct mixer calls from the screen. playMusic
    // replaces the current track.
    audio.playMusic(assets.sound('menu-music'));
  },
});
