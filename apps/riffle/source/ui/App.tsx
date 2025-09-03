import {type PropsWithChildren, useMemo} from 'react';

import {Game, GameProvider} from '../engine.js';

export type AppProps = PropsWithChildren;

export function App({children}: AppProps) {
  const game = useMemo(() => new Game(), []);

  return (
    <GameProvider game={game}>
      <main>{children}</main>
    </GameProvider>
  );
}
