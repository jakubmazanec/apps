import {type Card} from './Card.js';
import {type Game} from './Game.js';
import {getCardCost} from './getCardCost.js';
import {type Ship} from './Ship.js';

export function canPlayCard(game: Game, ship: Ship, card: Card, target?: Ship) {
  if (card.config.type === 'move') {
    return true;
  } else if (card.config.type === 'turn') {
    let cost = getCardCost(game, ship, card);

    if (cost > ship.energy) {
      return false;
    }

    return true;
  } else if (card.config.type === 'attack') {
    return true;
  }

  return true;
}
