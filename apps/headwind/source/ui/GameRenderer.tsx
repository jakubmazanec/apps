/* eslint-disable react/no-array-index-key */
import {
  ArrowRightLeft,
  CornerUpLeft,
  CornerUpRight,
  Lightbulb,
  MoveUp,
  Ship,
  User,
} from 'lucide-react';
import {observer} from 'mobx-react-lite';
import {type FC, useState} from 'react';

import {
  canPlayCard,
  evadeMoveCard,
  evadeTurnLeftCard,
  evadeTurnRightCard,
  getCardEnergyCost,
  useGame,
} from '../engine.js';
import {getCardEvadeCost} from '../engine/getCardEvadeCost.js';
import {rotateHex} from '../engine/rotateHex.js';
import {defineHex, Grid, Orientation, rectangle} from '../honeycomb/index.js';

const Hex = defineHex({
  orientation: Orientation.FLAT,
  dimensions: {xRadius: 20, yRadius: 20},
});
const grid = new Grid(Hex, rectangle({width: 20, height: 20}));

export const GameRenderer: FC = observer(() => {
  let game = useGame();
  let [hoveredCard, setHoveredCard] = useState<number | null>(null);

  // console.log('GameRenderer...', game);

  return (
    <div className="flex gap-x-6">
      <section className="relative flex flex-col gap-y-6">
        <div className="absolute left-4 top-4 flex gap-2">
          {Array.from({length: game.map.windStrength}).map((_, index) => (
            <MoveUp key={index} style={{transform: `rotate(${game.map.windDirection}deg)`}} />
          ))}
        </div>

        <svg
          className="grid"
          height="500"
          version="1.1"
          viewBox="0 0 500 500"
          width="500"
          xmlns="http://www.w3.org/2000/svg"
        >
          <symbol
            fill="none"
            id="ship"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="m18 9-6-6-6 6" />
            <path d="M12 3v14" />
            <path d="M5 21h14" />
          </symbol>

          {grid.toArray().map((hex, i) => (
            <g key={i}>
              <polygon
                className="fill-gray-100 stroke-gray-300 stroke-1"
                points={hex.corners.map(({x, y}) => `${x},${y}`).join(' ')}
              />
            </g>
          ))}

          {hoveredCard !== null && game.activeShip.hand[hoveredCard]?.config.type === 'attack' ?
            game.activeShip.hand[hoveredCard].config.rangeVectors
              .map((rangeVector) => rotateHex(rangeVector, game.activeShip.direction))
              .map(([q, r], index) => (
                <g key={`${game.activeShipIndex}-${index}`} data-name="attack-card-range">
                  <polygon
                    points={grid
                      .getHex([q + game.activeShip.q, r + game.activeShip.r])
                      ?.corners.map(({x, y}) => `${x},${y}`)
                      .join(' ')}
                    className="fill-orange-100/30"
                  />
                </g>
              ))
          : null}
          {game.attacks.map((attack, index) => (
            <g key={`${index}-${attack.ship.name}`}>
              {attack.card.config.type === 'attack' ?
                attack.card.config.rangeVectors
                  .map((rangeVector) => rotateHex(rangeVector, attack.ship.direction))
                  .map(([q, r], index) => (
                    <g key={`${index}`} data-name="attack-card-range">
                      <polygon
                        points={grid
                          .getHex([q + attack.ship.q, r + attack.ship.r])
                          ?.corners.map(({x, y}) => `${x},${y}`)
                          .join(' ')}
                        className="fill-blue-100/30"
                      />
                    </g>
                  ))
              : null}
              <line
                className="stroke-gray-400 stroke-1"
                x1={grid.getHex([attack.ship.q, attack.ship.r])?.x}
                x2={grid.getHex([attack.target.q, attack.target.r])?.x}
                y1={grid.getHex([attack.ship.q, attack.ship.r])?.y}
                y2={grid.getHex([attack.target.q, attack.target.r])?.y}
              />
            </g>
          ))}
          {game.ships
            .filter((ship) => !ship.isDestroyed)
            .map((ship, index) => (
              <g key={ship.name} data-name={ship.name}>
                <use
                  className={
                    ship.team === 'UK' ? 'text-red-600'
                    : ship.team === 'France' ?
                      'text-blue-600'
                    : 'text-orange-600'
                  }
                  height={12}
                  href="#ship"
                  transform={`rotate(${ship.direction} ${grid.getHex([ship.q, ship.r])!.x - 0} ${grid.getHex([ship.q, ship.r])!.y - 0})`}
                  width={12}
                  x={grid.getHex([ship.q, ship.r])!.x - 6}
                  y={grid.getHex([ship.q, ship.r])!.y - 6}
                />
              </g>
            ))}
        </svg>
      </section>

      <section className="flex flex-col gap-y-6">
        <div className="flex gap-x-6">
          {game.ships.map((ship) => (
            <div
              key={ship.name}
              className={
                game.activeShip === ship && game.status === 'in-progress' ?
                  'flex flex-col gap-x-4 rounded border border-gray-500 p-1'
                : 'flex flex-col gap-x-4 rounded border border-transparent p-1'
              }
            >
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
              <span className="flex gap-x-2">
                <ArrowRightLeft />
                <span>{ship.evade}</span>
              </span>
            </div>
          ))}
        </div>

        {game.status === 'in-progress' ?
          <div className="flex flex-col gap-2">
            <h3>Evade</h3>

            <div className="flex gap-2">
              <button
                className={
                  canPlayCard(game, game.activeShip, evadeTurnLeftCard) ?
                    'flex rounded bg-gray-200 p-1'
                  : 'flex cursor-not-allowed rounded bg-gray-100 p-1 text-gray-300'
                }
                type="button"
                onClick={() => {
                  game.playEvadeTurnPort();
                }}
              >
                <CornerUpLeft />
                {getCardEvadeCost(game, game.activeShip, evadeTurnLeftCard)}
              </button>
              <button
                className={
                  canPlayCard(game, game.activeShip, evadeMoveCard) ?
                    'flex rounded bg-gray-200 p-1'
                  : 'flex cursor-not-allowed rounded bg-gray-100 p-1 text-gray-300'
                }
                type="button"
                onClick={() => {
                  game.playEvadeSail();
                }}
              >
                <MoveUp />
                {getCardEvadeCost(game, game.activeShip, evadeMoveCard)}
              </button>
              <button
                className={
                  canPlayCard(game, game.activeShip, evadeTurnRightCard) ?
                    'flex rounded bg-gray-200 p-1'
                  : 'flex cursor-not-allowed rounded bg-gray-100 p-1 text-gray-300'
                }
                type="button"
                onClick={() => {
                  game.playEvadeTurnStarboard();
                }}
              >
                <CornerUpRight />
                {getCardEvadeCost(game, game.activeShip, evadeTurnRightCard)}
              </button>
            </div>
          </div>
        : null}

        {game.status === 'in-progress' ?
          <div className="flex flex-col gap-2">
            <h3>Cards</h3>

            {game.activeShip.hand.map((card, index) => (
              <div
                key={`${game.activeShipIndex}-${index}-${card.name}`}
                className="flex flex-wrap items-center justify-between gap-x-4 rounded border border-gray-500 p-1"
                onMouseEnter={() => setHoveredCard(index)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <h4>{`${card.name} (${getCardEnergyCost(game, game.activeShip, card)})`}</h4>
                {card.config.type === 'attack' ?
                  <span>{`${card.config.minHullDamage}-${card.config.maxHullDamage}/${card.config.minSailsDamage}-${card.config.maxSailsDamage}/${card.config.minCrewDamage}-${card.config.maxCrewDamage}`}</span>
                : null}
                {card.config.type === 'attack' ?
                  <>
                    {game.ships.map((ship, index) =>
                      ship.team === game.activeShip.team ?
                        null
                      : <button
                          key={`${game.activeShipIndex}-${index}-${ship.name}`}
                          className={
                            canPlayCard(game, game.activeShip, card, ship) ?
                              'rounded bg-gray-200 p-1'
                            : 'cursor-not-allowed rounded bg-gray-100 p-1 text-gray-300'
                          }
                          type="button"
                          onClick={() => {
                            game.playCard(card, ship);
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
        : null}

        {game.status === 'in-progress' ?
          <button type="button" onClick={() => game.nextShip()}>
            Next!
          </button>
        : null}
      </section>

      <section className="flex flex-col gap-y-6">
        <div className="flex gap-6">
          <div>{`Round: ${game.round}`}</div>
          {game.status === 'not-started' || game.status === 'finished' ?
            <button type="button" onClick={() => game.start()}>
              Start game!
            </button>
          : null}
        </div>

        {game.status === 'in-progress' ?
          <div>{`Next ships in the round: ${
            game
              .getRemainingShips()
              .map((ship) => ship.name)
              .join(', ') || '-'
          }`}</div>
        : null}

        {game.status === 'finished' ?
          <div>
            {`Game over! Winning team: ${Object.entries(game.result).find(([, hasWon]) => hasWon)![0]}`}
          </div>
        : null}

        <div className="flex flex-col gap-2">
          <h3>Attacks</h3>

          <div className="flex flex-col gap-2">
            {game.attacks.map((attack, index) => {
              if (attack.card.config.type !== 'attack') {
                return null;
              }

              return (
                <div
                  key={`${index}-${attack.ship.name}-${attack.target.name}`}
                  className="flex gap-4"
                >
                  <span>{`${attack.ship.name} (${attack.ship.team})`}</span>
                  <span>{`${attack.target.name} (${attack.target.team})`}</span>
                  <span>{`${attack.card.config.minHullDamage}-${attack.card.config.maxHullDamage}`}</span>
                  <span>{`${attack.card.config.minSailsDamage}-${attack.card.config.maxSailsDamage}`}</span>
                  <span>{`${attack.card.config.minCrewDamage}-${attack.card.config.maxCrewDamage}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
});
