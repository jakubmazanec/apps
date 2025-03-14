import {Lightbulb, Ship, User} from 'lucide-react';
import {observer} from 'mobx-react-lite';
import {type FC} from 'react';

import {canPlayCard, getCardCost, useGame} from '../engine.js';
import {defineHex, Grid, Orientation, rectangle} from '../honeycomb/index.js';
import {rotateHex} from '../engine/rotateHex.js';

const SHIP_ICONS: Record<number, string> = {
  0: '↑',
  60: '↗',
  120: '↘',
  180: '↓',
  240: '↙',
  300: '↖',
  360: '↑',
};

const Hex = defineHex({
  orientation: Orientation.FLAT,
  dimensions: {xRadius: 20, yRadius: 20},
});
const grid = new Grid(Hex, rectangle({width: 20, height: 20}));

export const GameRenderer: FC = observer(() => {
  const game = useGame();

  console.log('GameRenderer...', game);

  console.log(rotateHex([0, -2], -60));

  return (
    <div className="flex gap-x-6">
      <section className="flex flex-col gap-y-6">
        <div>
          Wind: {game.map.windStrength}/{SHIP_ICONS[game.map.windDirection]}
        </div>

        <svg
          className="grid"
          height="500"
          version="1.1"
          viewBox="0 0 500 500"
          width="500"
          xmlns="http://www.w3.org/2000/svg"
        >
          {grid.toArray().map((hex, i) => (
            <g key={i}>
              <polygon
                className="fill-gray-100 stroke-gray-300 stroke-1"
                points={hex.corners.map(({x, y}) => `${x},${y}`).join(' ')}
              />
            </g>
          ))}
          {game.ships.map((ship, index) => (
            <g key={ship.name} data-name={ship.name}>
              <text
                className={index === 0 ? 'fill-blue-600' : 'fill-red-600'}
                x={grid.getHex([ship.q, ship.r])?.x}
                y={grid.getHex([ship.q, ship.r])?.y}
              >
                {SHIP_ICONS[ship.direction]}
              </text>
            </g>
          ))}
        </svg>
      </section>

      <section className="flex flex-col gap-y-6">
        <div className="flex gap-6">
          <div>{`Round: ${game.round}`}</div>
          <button type="button" onClick={() => game.start()}>
            {game.round < 1 ? 'Start!' : 'Reset!'}
          </button>
        </div>

        <div className="flex gap-x-6">
          {game.ships.map((ship) => (
            <div key={ship.name} className="flex flex-col gap-x-4">
              <span>{ship.name}</span>
              <span className="flex gap-x-2">
                <Ship />
                <span>
                  {ship.hull}/{ship.sails}
                </span>
              </span>
              <span className="flex gap-x-2">
                <User />
                <span>{ship.crew}</span>
              </span>
              <span className="flex gap-x-2">
                <Lightbulb />
                <span>{ship.energy}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <h3>Cards</h3>

          {game.activeShip.hand.map((card, index) => (
            <div
              // eslint-disable-next-line react/no-array-index-key -- needed, cards have no ID
              key={`${game.activeShipIndex}-${index}-${card.name}`}
              className="flex items-center justify-between gap-x-4 rounded border border-gray-500 p-1"
            >
              <h4>{`${card.name} (${getCardCost(game, game.activeShip, card)})`}</h4>
              {card.config.type === 'attack' ?
                <>
                  {game.ships.map((ship, index) =>
                    ship.team === game.activeShip.team ?
                      null
                    : <button
                        // eslint-disable-next-line react/no-array-index-key -- needed, ships have no ID
                        key={`${game.activeShipIndex}-${index}-${ship.name}`}
                        className={
                          canPlayCard(game, game.activeShip, card, ship) ? 'rounded bg-gray-200 p-1'
                          : 'cursor-not-allowed rounded bg-gray-100 p-1 text-gray-300'
                        }
                        type="button"
                        onClick={() => {
                          game.playCard(card);
                        }}
                      >
                        {`Use on "${ship.name}"`}
                      </button>,
                  )}
                </>
              : <button
                  className={
                    canPlayCard(game, game.activeShip, card) ? 'rounded bg-gray-200 p-1' : (
                      'cursor-not-allowed rounded bg-gray-100 p-1 text-gray-300'
                    )
                  }
                  type="button"
                  onClick={() => {
                    game.playCard(card);
                  }}
                >
                  Use
                </button>
              }
            </div>
          ))}
        </div>

        <button type="button" onClick={() => game.nextRound()}>
          Next round!
        </button>
      </section>
    </div>
  );
});
