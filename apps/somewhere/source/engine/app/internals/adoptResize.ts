import type * as pixi from 'pixi.js';

import {type Game} from '../Game.js';

/**
 * Keeps the canvas, renderer, hit area and layout in sync with the size of the
 * element the game's ref points at, resizing the attached screens with them.
 * Sizes the game once up front, then on every window resize. Registers the
 * listener removal on `disposables`, so it lives exactly as long as the game's
 * ref does.
 */
export function adoptResize(game: Game, disposables: DisposableStack): void {
  let handleResize = () => {
    if (!game.ref?.current) {
      return;
    }

    let cssWidth = Math.trunc(game.ref.current.clientWidth);
    let cssHeight = Math.trunc(game.ref.current.clientHeight);
    let pixelWidth = Math.round(cssWidth * window.devicePixelRatio);
    let pixelHeight = Math.round(cssHeight * window.devicePixelRatio);

    game.app.canvas.style.width = `${cssWidth}px`;
    game.app.canvas.style.height = `${cssHeight}px`;

    // The hit area and layout live in the view's local space.
    if (game.view.hitArea) {
      let hitArea = game.view.hitArea as pixi.Rectangle;

      hitArea.x = 0;
      hitArea.y = 0;
      hitArea.width = pixelWidth / game.pixelScale;
      hitArea.height = pixelHeight / game.pixelScale;
    }

    window.scrollTo(0, 0);
    game.app.renderer.resize(pixelWidth, pixelHeight);

    game.view.layout = {
      width: game.app.screen.width / game.pixelScale,
      height: game.app.screen.height / game.pixelScale,
    }; // Must be called after renderer.resize() call, apparently.

    if (game.currentScreen) {
      game.currentScreen.resize();
    }

    if (game.loadingScreen) {
      game.loadingScreen.resize();
    }

    if (game.errorScreen) {
      game.errorScreen.resize();
    }
  };

  window.addEventListener('resize', handleResize);
  disposables.defer(() => {
    window.removeEventListener('resize', handleResize);
  });
  handleResize();
}
