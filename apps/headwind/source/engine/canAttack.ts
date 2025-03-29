import {type Card} from './Card.js';
import {type Game} from './Game.js';
import {rotateHex} from './rotateHex.js';
import {type Ship} from './Ship.js';

export function canAttack(game: Game, ship: Ship, card: Card, target?: Ship) {
  if (card.config.type !== 'attack') {
    throw new Error('Card must be attack card!');
  }

  if (!target) {
    throw new Error('Target is undefined!');
  }

  let hexes = card.config.rangeVectors
    .map((rangeVector) => rotateHex(rangeVector, ship.direction))
    .map(([q, r]) => [q + ship.q, r + ship.r]);

  if (hexes.some(([q, r]) => target.q === q && target.r === r)) {
    return true;
  }

  return false;
}
