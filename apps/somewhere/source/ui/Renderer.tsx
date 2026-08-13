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

  return <div ref={ref} className="h-dvh w-full" />;
}
