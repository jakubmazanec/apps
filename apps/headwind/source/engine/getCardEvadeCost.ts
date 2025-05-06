/* eslint-disable perfectionist/sort-switch-case -- bad sorting */
import {type Card} from './Card.js';
import {type Game} from './Game.js';
import {type Ship} from './Ship.js';

function getWindMoveBonus(game: Game, ship: Ship) {
  // console.log('getWindBonus()...');
  let strength = game.map.windStrength;
  let directionDelta = game.map.windDirection - ship.direction;
  let result;

  if (directionDelta >= 360) {
    directionDelta -= 360;
  }

  if (directionDelta < 0) {
    directionDelta += 360;
  }

  switch (directionDelta) {
    case 0: {
      if (strength === 0) {
        result = -3;
      } else {
        result = 2;
      }

      break;
    }

    case 60: {
      if (strength === 0) {
        result = -3;
      } else {
        result = 1;
      }

      break;
    }

    case 120: {
      if (strength === 0) {
        result = -3;
      } else {
        result = -1;
      }

      break;
    }

    case 180: {
      if (strength === 0) {
        result = -3;
      } else {
        result = -2;
      }

      break;
    }

    case 240: {
      if (strength === 0) {
        result = -3;
      } else {
        result = -1;
      }

      break;
    }

    case 300: {
      if (strength === 0) {
        result = -3;
      } else {
        result = 1;
      }

      break;
    }

    default: {
      result = 0;
    }
  }

  return result;
}

function getWindTurnBonus(game: Game, ship: Ship) {
  let strength = game.map.windStrength;

  if (strength === 3) {
    return -2;
  }

  if (strength === 2) {
    return -1;
  }

  return 0;
}

function getDamageMoveBonus(game: Game, ship: Ship) {
  if (ship.sails / ship.maxSails <= 0.1) {
    return -2;
  }

  if (ship.sails / ship.maxSails <= 0.5) {
    return -1;
  }

  return 0;
}

function getDamageTurnBonus(game: Game, ship: Ship) {
  if (ship.sails / ship.maxSails <= 0.1) {
    return -2;
  }

  if (ship.sails / ship.maxSails <= 0.5) {
    return -1;
  }

  return 0;
}

export function getCardEvadeCost(game: Game, ship: Ship, card: Card) {
  // cards that cost less than 0 evade, i.e. usual cards, can never cost anything
  if (card.config.evadeCost < 0) {
    return 0;
  }

  if (card.config.type === 'move') {
    let windBonus = getWindMoveBonus(game, ship);
    let damageBonus = getDamageMoveBonus(game, ship);

    return Math.max(card.config.evadeCost - ship.moveCardCostBonus - windBonus - damageBonus, 1);
  } else if (card.config.type === 'turn') {
    let windBonus = getWindTurnBonus(game, ship);
    let damageBonus = getDamageTurnBonus(game, ship);

    return Math.max(card.config.evadeCost - ship.turnCardCostBonus - windBonus - damageBonus, 1);
  }

  return card.config.evadeCost;
}
