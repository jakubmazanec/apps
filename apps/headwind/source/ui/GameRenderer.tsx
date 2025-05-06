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
import {type ChangeCardEffectConfig} from '../engine/Effect.js';
import {getCardEvadeCost} from '../engine/getCardEvadeCost.js';
import {rotateHex} from '../engine/rotateHex.js';

const MAP_WIDTH = 500;
const MAP_HEIGHT = 500;

export const GameRenderer: FC = observer(() => {
  let game = useGame();
  let [hoveredCard, setHoveredCard] = useState<number | null>(null);

  // console.log('GameRenderer...', game);

  let cameraX = -game.map.grid.getHex([game.activeShip.q, game.activeShip.r])!.x + MAP_WIDTH * 0.5;
  let cameraY = -game.map.grid.getHex([game.activeShip.q, game.activeShip.r])!.y + MAP_HEIGHT * 0.5;

  return (
    <div className="flex gap-x-6">
      <section className="relative flex flex-col gap-y-6">
        {game.status === 'in-progress' ?
          <div className="absolute left-4 top-4 flex gap-2">
            {Array.from({length: game.map.windStrength}).map((_, index) => (
              <MoveUp key={index} style={{transform: `rotate(${game.map.windDirection}deg)`}} />
            ))}
          </div>
        : null}

        {game.status === 'in-progress' ?
          <svg
            className="grid border border-gray-500"
            height={MAP_WIDTH}
            version="1.1"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            width={MAP_HEIGHT}
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

            {game.map.grid.toArray().map((hex, i) => (
              <g key={`${hex.q}-${hex.r}`} data-hex-q={hex.q} data-hex-r={hex.r}>
                <polygon
                  className={
                    hex.isEscapable ? 'fill-fuchsia-300 stroke-gray-300 stroke-1'
                    : hex.isLand ?
                      'fill-green-500 stroke-gray-300 stroke-1'
                    : 'fill-blue-50 stroke-gray-300 stroke-1'
                  }
                  points={hex.corners.map(({x, y}) => `${x + cameraX},${y + cameraY}`).join(' ')}
                />
              </g>
            ))}

            {hoveredCard !== null && game.activeShip.hand[hoveredCard]?.config.type === 'attack' ?
              game.activeShip.hand[hoveredCard].config.rangeVectors
                .map((rangeVector) => rotateHex(rangeVector, game.activeShip.direction))
                .map(([q, r], index) => (
                  <g key={`${game.activeShipIndex}-${index}`} data-name="attack-card-range">
                    <polygon
                      points={game.map.grid
                        .getHex([q + game.activeShip.q, r + game.activeShip.r])
                        ?.corners.map(({x, y}) => `${x + cameraX},${y + cameraY}`)
                        .join(' ')}
                      className="fill-orange-100/50"
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
                          points={game.map.grid
                            .getHex([q + attack.ship.q, r + attack.ship.r])
                            ?.corners.map(({x, y}) => `${x + cameraX},${y + cameraY}`)
                            .join(' ')}
                          className="fill-orange-200/20"
                        />
                      </g>
                    ))
                : null}
                <line
                  className="stroke-gray-400 stroke-1"
                  x1={game.map.grid.getHex([attack.ship.q, attack.ship.r])!.x + cameraX}
                  x2={game.map.grid.getHex([attack.target.q, attack.target.r])!.x + cameraX}
                  y1={game.map.grid.getHex([attack.ship.q, attack.ship.r])!.y + cameraY}
                  y2={game.map.grid.getHex([attack.target.q, attack.target.r])!.y + cameraY}
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
                    transform={`rotate(${ship.direction} ${game.map.grid.getHex([ship.q, ship.r])!.x - 0} ${game.map.grid.getHex([ship.q, ship.r])!.y - 0})`}
                    width={12}
                    x={game.map.grid.getHex([ship.q, ship.r])!.x - 6 + cameraX}
                    y={game.map.grid.getHex([ship.q, ship.r])!.y - 6 + cameraY}
                  />
                </g>
              ))}
          </svg>
        : null}
      </section>

      <section className="flex flex-col gap-y-6">
        {game.status === 'in-progress' ?
          <div className="flex flex-col gap-2">
            <h3>Evade</h3>

            <div className="flex gap-2">
              {/*<button
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
              </button>*/}
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
              {/*<button
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
              </button>*/}
            </div>
          </div>
        : null}

        {game.status === 'in-progress' ?
          <div className="flex flex-col gap-2">
            <h3>Cards</h3>

            {game.activeShip.hand.map((card, index) => {
              let description = (
                <h4 className="flex flex-col">
                  <span>{card.name}</span>
                  {card.config.type === 'effect' ?
                    card.config.effects.map((effect, index) => (
                      <span key={index}>{effect.getDescription().join('; ')}</span>
                    ))
                  : null}
                  {card.config.type === 'attack' ?
                    <span>{`${Math.round(card.config.accuracy * 100)} % ${card.config.damage}`}</span>
                  : null}
                  <span className="font-bold">
                    {getCardEnergyCost(game, game.activeShip, card)}
                    {card.config.isExhaustible ? '(exhaust)' : null}
                    {card.config.isTemporary ? '(temporary)' : null}
                  </span>
                  {card.effects.length ?
                    <span className="text-sm">
                      {card.effects.map((effect, index) => (
                        <span key={index}>{effect.getDescription().join('; ')}</span>
                      ))}
                    </span>
                  : null}
                </h4>
              );

              let useButton = null;

              if (card.config.type === 'attack' || card.config.type === 'board') {
                useButton = (
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
                );
              } else if (card.config.type === 'effect' && !card.config.useOnSelf) {
                useButton = (
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
                );
              } else if (
                card.config.type === 'effect' &&
                card.config.effects.every((effect) => effect.config.type === 'change-card')
              ) {
                let {cardType} = card.config.effects[0]!.config as ChangeCardEffectConfig;

                useButton = (
                  <select
                    onChange={(event) =>
                      game.playCard(
                        card,
                        game.activeShip.allCards[event.target.value as unknown as number],
                      )
                    }
                  >
                    <option value="">--select a card--</option>
                    {game.activeShip.allCards.map((targetCard, index) =>
                      targetCard.config.type === cardType ?
                        <option key={index} value={index}>
                          {targetCard.name}
                        </option>
                      : null,
                    )}
                  </select>
                );
              } else {
                useButton = (
                  <button
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
                );
              }

              return (
                <div
                  key={`${game.activeShipIndex}-${index}-${card.name}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 rounded border border-gray-500 p-1"
                  onMouseEnter={() => setHoveredCard(index)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  {description}
                  {useButton}
                </div>
              );
            })}
          </div>
        : null}

        {game.status === 'in-progress' ?
          <button type="button" onClick={() => game.nextShip()}>
            {game.getRemainingShips().length > 0 ? 'Next ship' : 'Next round'}
          </button>
        : null}
      </section>

      <section className="flex flex-col gap-y-6">
        <div className="flex gap-6">
          <div>{`Round: ${game.round}`}</div>
          {game.status === 'not-started' ?
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
            {`Game over! Winning teams: ${Object.entries(game.result)
              .filter(([, hasWon]) => hasWon)
              .map(([teamName]) => teamName)
              .join(', ')}`}
          </div>
        : null}

        <pre>{JSON.stringify(game.map.objectives, null, 2)}</pre>

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
              <span>{`(${ship.team})`}</span>
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
              {ship.roundsUntilAutomove <= 0 ?
                <span className="flex gap-x-2">Will move!</span>
              : null}
              <span className="flex flex-col gap-x-2">
                {ship.effects.map((effect, index) => (
                  <span key={index}>{effect.getDescription().join('; ')}</span>
                ))}
              </span>
            </div>
          ))}
        </div>

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
                  <span>{`${Math.round(attack.card.config.accuracy * 100)} % ${attack.card.config.damage}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
});
