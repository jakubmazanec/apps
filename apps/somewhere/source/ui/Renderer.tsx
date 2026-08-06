import {useEffect, useRef} from 'react';

import {useGame} from '../engine/app/useGame.js';

export default function Renderer() {
  let game = useGame();
  let ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (game) {
      game.mount(ref);
    }

    return () => {
      if (game) {
        game.unmount();
      }
    };
  }, [game]);

  // The height unit is load-bearing: 100vh is the LARGE viewport, the height
  // the page gets with the mobile browser UI retracted, so on Android Chrome a
  // 100vh canvas runs under the toolbar and hides its own bottom edge -- where
  // the dialogue box lives. 100dvh tracks the visible viewport instead, and
  // adoptResize already re-lays the game out on the resizes that come with it.
  return <div ref={ref} className="h-dvh w-full" />;
}
