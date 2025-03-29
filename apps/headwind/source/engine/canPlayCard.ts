import {canAttack} from './canAttack.js';
import {type Card} from './Card.js';
import {type Game} from './Game.js';
import {getCardEnergyCost} from './getCardCost.js';
import {getCardEvadeCost} from './getCardEvadeCost.js';
import {type Ship} from './Ship.js';

export function canPlayCard(game: Game, ship: Ship, card: Card, target?: Ship) {
  // console.log('canPlayCard()...', game, ship, card, target);
  switch (card.config.type) {
    case 'attack': {
      if (!target) {
        throw new Error('Target is undefined!');
      }

      let energyCost = getCardEnergyCost(game, ship, card);

      if (energyCost > ship.energy) {
        return false;
      }

      let evadeCost = getCardEvadeCost(game, ship, card);

      if (evadeCost > ship.evade) {
        return false;
      }

      if (!canAttack(game, ship, card, target)) {
        return false;
      }

      return true;
    }

    case 'effect': {
      let energyCost = getCardEnergyCost(game, ship, card);

      if (energyCost > ship.energy) {
        return false;
      }

      let evadeCost = getCardEvadeCost(game, ship, card);

      if (evadeCost > ship.evade) {
        return false;
      }

      return true;
    }

    case 'evade': {
      let energyCost = getCardEnergyCost(game, ship, card);

      if (energyCost > ship.energy) {
        return false;
      }

      let evadeCost = getCardEvadeCost(game, ship, card);

      if (evadeCost > ship.evade) {
        return false;
      }

      return true;
    }

    case 'move': {
      let energyCost = getCardEnergyCost(game, ship, card);

      if (energyCost > ship.energy) {
        return false;
      }

      let evadeCost = getCardEvadeCost(game, ship, card);

      if (evadeCost > ship.evade) {
        return false;
      }

      let directionDelta = game.map.windDirection - ship.direction;

      if (directionDelta >= 360) {
        directionDelta -= 360;
      }

      if (directionDelta < 0) {
        directionDelta += 360;
      }

      if (game.map.windStrength === 2 && directionDelta === 180) {
        return false;
      }

      if (game.map.windStrength === 3 && directionDelta >= 120 && directionDelta <= 240) {
        return false;
      }

      return true;
    }

    case 'turn': {
      let energyCost = getCardEnergyCost(game, ship, card);

      if (energyCost > ship.energy) {
        return false;
      }

      let evadeCost = getCardEvadeCost(game, ship, card);

      if (evadeCost > ship.evade) {
        return false;
      }

      return true;
    }

    // no default
  }

  return false;
}
