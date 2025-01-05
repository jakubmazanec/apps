import {useEffect, useRef} from 'react';

import {useGame} from '../engine/useGame.js';

export default function Renderer() {
  let game = useGame();
  let ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (game) {
      game.addRef(ref);
    }

    return () => {
      if (game) {
        game.removeRef();
      }
    };
  }, [game]);

  return <div ref={ref} className="h-screen w-full" />;
}
