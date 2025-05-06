import _ from 'lodash';
import {makeAutoObservable} from 'mobx';

import {canAttack} from './canAttack.js';
import {canPlayCard} from './canPlayCard.js';
import {Card} from './Card.js';
import {type Effect} from './Effect.js';
import {getCardEnergyCost} from './getCardEnergyCost.js';
import {getCardEvadeCost} from './getCardEvadeCost.js';
import {Map} from './Map.js';
import {rotateHex} from './rotateHex.js';
import {Ship, type ShipAmmo} from './Ship.js';

export const windMoveCard = new Card(Card.getTemplate('internal-move-wind'));
export const evadeMoveCard = new Card(Card.getTemplate('internal-move-evade'));
export const evadeTurnRightCard = new Card(Card.getTemplate('internal-turn-right-evade'));
export const evadeTurnLeftCard = new Card(Card.getTemplate('internal-turn-left-evade'));

export type GameStatus = 'finished' | 'in-progress' | 'not-started';

export type GameAttack = {
  card: Card;
  ship: Ship;
  target: Ship;
  // ammo: ShipAmmo;
};

export type GameOptions = {
  map?: Map;
};

export class Game {
  map: Map;
  ships: Ship[];

  round = 0;
  status: GameStatus = 'not-started';

  activeShipIndex = 0;

  attacks: GameAttack[] = [];

  get activeShip() {
    return this.ships[this.activeShipIndex]!;
  }

  constructor({map}: GameOptions = {}) {
    makeAutoObservable(this);

    // TODO: hard-coded game settings, fix!
    this.map = new Map({
      ...Map.getTemplate('map-1'),
      game: this,
    });
    this.ships = [
      new Ship({...Ship.getTemplate('ship-1'), game: this}),
      new Ship({...Ship.getTemplate('ship-2'), game: this}),
    ];

    // TODO: remove this and finish game-restarting logic
    this.ships[0]!.q = 7;
    this.ships[0]!.r = 3;
    this.ships[1]!.q = 8;
    this.ships[1]!.r = 2;

    // TODO: remove
    if (typeof window !== 'undefined') {
      window.game = this;
    }
  }

  get result() {
    let result: Record<string, boolean> = {};
    let teams = _.groupBy(this.ships, 'team');

    for (let [teamName, teamShips] of Object.entries(teams)) {
      result[teamName] = false;

      if (this.map.objectives[teamName] === 'escape') {
        result[teamName] = true;

        if (teamShips.some((ship) => !this.map.grid.getHex([ship.q, ship.r])?.isEscapable)) {
          result[teamName] = false;
        }
      } else if (this.map.objectives[teamName] === 'capture') {
        result[teamName] = true;

        for (let [otherTeamName, otherTeamShips] of Object.entries(teams)) {
          if (otherTeamName !== teamName && otherTeamShips.length) {
            result[teamName] = false;

            break;
          }
        }
      } else if (this.map.objectives[teamName] === 'destroy') {
        result[teamName] = true;

        for (let [otherTeamName, otherTeamShips] of Object.entries(teams)) {
          if (otherTeamName !== teamName && otherTeamShips.some((ship) => !ship.isDestroyed)) {
            result[teamName] = false;

            break;
          }
        }
      }
    }

    return result;
  }

  start() {
    console.log('Game.start()...');

    this.status = 'in-progress';

    for (let ship of this.ships) {
      ship.reset();
    }

    this.round = 0;

    this.nextRound();
  }

  reset() {
    this.status = 'not-started';
  }

  end() {
    this.status = 'finished';
  }

  nextRound() {
    console.log('Game.nextRound()...');

    this.round += 1;

    // apply attacks
    for (let attack of this.attacks) {
      if (canAttack(this, attack.ship, attack.card, attack.target)) {
        if (attack.card.config.type !== 'attack') {
          throw new Error('Card must be attack card!');
        }

        // TODO: implmenet relative orientation of ships

        let bonus = 0;
        let multiplier = 1;

        for (let effect of attack.ship.effects) {
          if (effect.config.type === 'accuracy') {
            bonus += effect.config.accuracyBonus;
            multiplier += effect.config.accuracyMultiplier;

            if (effect.duration.type === 'uses') {
              attack.ship.decreaseEffectDuration(effect);
            }
          }
        }

        let probability = (attack.card.config.accuracy + bonus) * multiplier;
        let isHit = Math.random() <= probability;
        let {damage} = attack.card.config;
        let ammo: ShipAmmo = 'round';

        for (let effect of attack.ship.effects) {
          if (effect.config.type === 'ammo') {
            ammo = effect.config.ammo;

            if (effect.duration.type === 'uses') {
              attack.ship.decreaseEffectDuration(effect);
            }
          }
        }

        if (!isHit) {
          console.log(
            `"${attack.ship.name}" misess "${attack.target.name}" (probability was ${Math.round(probability * 100)} %).`,
          );

          continue;
        }

        switch (ammo) {
          case 'chain': {
            attack.target.sails = Math.max(attack.target.sails - damage, 0);

            console.log(
              `"${attack.ship.name}" damages "${attack.target.name}": -${damage} sails (probability was ${Math.round(probability * 100)} %).`,
            );

            break;
          }

          case 'grape': {
            attack.target.crew = Math.max(attack.target.crew - damage, 0);

            console.log(
              `"${attack.ship.name}" damages "${attack.target.name}": -${damage} crew (probability was ${Math.round(probability * 100)} %).`,
            );

            break;
          }

          case 'round': {
            attack.target.hull = Math.max(attack.target.hull - damage, 0);

            console.log(
              `"${attack.ship.name}" damages "${attack.target.name}": -${damage} hull (probability was ${Math.round(probability * 100)} %).`,
            );

            break;
          }

          // no default
        }
      }
    }

    this.attacks = [];

    this.checkEnd();

    // apply automove
    for (let ship of this.ships) {
      if (ship.roundsUntilAutomove <= 0) {
        if (!canPlayCard(this, ship, windMoveCard)) {
          continue;
        }

        this.applyCard(ship, windMoveCard);
      }
    }

    // map starts new round
    this.map.startRound();

    // starts all ships round
    for (let ship of this.ships) {
      ship.startRound();
    }

    // starts next ship action
    this.nextShip();
  }

  nextShip() {
    if (this.status !== 'in-progress') {
      return;
    }

    console.log('Game.nextShip()...');

    this.checkEnd();

    const nextShipIndex = this.getNextShipIndex();

    console.log('nextShipIndex', nextShipIndex);

    if (nextShipIndex === null) {
      this.nextRound();
    } else {
      this.activeShipIndex = nextShipIndex;

      this.activeShip.startAction();
    }
  }

  // checks if game needs to end
  checkEnd() {
    if (Object.values(this.result).some(Boolean)) {
      this.end();
    }
  }

  playCard(card: Card, target?: Card | Ship) {
    if (this.status !== 'in-progress') {
      return;
    }

    console.log('Game.playCard()...');

    if (!canPlayCard(this, this.activeShip, card, target)) {
      return;
    }

    let cardIndex = this.activeShip.hand.findIndex((handCard) => handCard === card);

    if (cardIndex < 0) {
      throw new Error('Invalid card played!');
    }

    this.applyCard(this.activeShip, card, target);

    // move the cards
    if (card.config.isTemporary) {
      this.activeShip.hand.splice(cardIndex, 1);
    } else if (card.config.isExhaustible) {
      this.activeShip.exhaustPile.push(this.activeShip.hand.splice(cardIndex, 1)[0]!);
    } else {
      this.activeShip.discardPile.push(this.activeShip.hand.splice(cardIndex, 1)[0]!);
    }

    // effects
    this.activeShip.decreaseEffectsDuration('cards');

    for (let card of [
      ...this.activeShip.drawPile,
      ...this.activeShip.discardPile,
      ...this.activeShip.exhaustPile,
      ...this.activeShip.hand,
    ]) {
      card.decreaseEffectsDuration('cards');
    }
  }

  playEvadeSail() {
    if (!canPlayCard(this, this.activeShip, evadeMoveCard)) {
      return;
    }

    this.applyCard(this.activeShip, evadeMoveCard);
  }

  playEvadeTurnStarboard() {
    if (!canPlayCard(this, this.activeShip, evadeTurnRightCard)) {
      return;
    }

    this.applyCard(this.activeShip, evadeTurnRightCard);
  }

  playEvadeTurnPort() {
    if (!canPlayCard(this, this.activeShip, evadeTurnLeftCard)) {
      return;
    }

    this.applyCard(this.activeShip, evadeTurnLeftCard);
  }

  applyCard(activeShip: Ship, card: Card, targetShipOrCard?: Card | Ship) {
    let ship = activeShip;
    let target = targetShipOrCard;

    switch (card.config.type) {
      case 'attack': {
        if (!target || target instanceof Card) {
          throw new Error('Invalid target!');
        }

        let energyCost = getCardEnergyCost(this, ship, card);
        let evadeCost = getCardEvadeCost(this, ship, card);

        ship.energy -= energyCost;
        ship.evade -= evadeCost;

        this.attacks.push({
          card,
          ship,
          target,
          // ammo: ship.ammo,
        });

        break;
      }

      case 'board': {
        if (!target || target instanceof Card) {
          throw new Error('Invalid target!');
        }

        let energyCost = getCardEnergyCost(this, ship, card);
        let evadeCost = getCardEvadeCost(this, ship, card);

        ship.energy -= energyCost;
        ship.evade -= evadeCost;

        target.team = ship.team;
        target.crew = Math.round(ship.crew / 2);
        ship.crew = Math.round(ship.crew / 2);

        break;
      }

      case 'effect': {
        let energyCost = getCardEnergyCost(this, ship, card);
        let evadeCost = getCardEvadeCost(this, ship, card);

        ship.energy -= energyCost;
        ship.evade -= evadeCost;

        for (let effect of card.config.effects) {
          this.applyEffect(activeShip, effect, target);
        }

        break;
      }

      case 'evade': {
        let energyCost = getCardEnergyCost(this, ship, card);
        let evadeCost = getCardEvadeCost(this, ship, card);

        ship.energy -= energyCost;
        ship.evade -= evadeCost;
        ship.evade += card.config.evade;

        break;
      }

      case 'move': {
        let energyCost = getCardEnergyCost(this, ship, card);
        let evadeCost = getCardEvadeCost(this, ship, card);

        ship.energy -= energyCost;
        ship.evade -= evadeCost;

        let [q, r] = rotateHex(card.config.rangeVector, ship.direction);

        ship.q += q;
        ship.r += r;

        break;
      }

      case 'turn': {
        let energyCost = getCardEnergyCost(this, ship, card);
        let evadeCost = getCardEvadeCost(this, ship, card);

        ship.energy -= energyCost;
        ship.evade -= evadeCost;
        ship.direction += card.config.angle;

        if (ship.direction >= 360) {
          ship.direction -= 360;
        }

        if (ship.direction < 0) {
          ship.direction += 360;
        }

        break;
      }

      // no default
    }
  }

  applyEffect(activeShip: Ship, effect: Effect, target?: Card | Ship) {
    switch (effect.config.type) {
      case 'accuracy': {
        if (effect.duration.type === 'permanent') {
          throw new Error('Invalid effect!');
        }

        activeShip.applyEffect(effect);

        break;
      }

      case 'ammo': {
        if (effect.duration.type === 'permanent' || effect.duration.type === 'battle') {
          throw new Error('Invalid effect!');
        }

        activeShip.applyEffect(effect);

        break;
      }

      case 'change-card': {
        if (!target || target instanceof Ship) {
          throw new Error('Invalid target!');
        }

        if (target.config.type !== effect.config.cardType) {
          throw new Error('Invalid card type!');
        }

        target.applyEffect(effect);

        break;
      }

      case 'change-ship': {
        if (target instanceof Card) {
          throw new Error('Invalid target!');
        }

        if (target) {
          target.applyEffect(effect);
        } else {
          activeShip.applyEffect(effect);
        }

        break;
      }

      // no default
    }
  }

  getNextShipIndex() {
    console.log('Game.getNextShipIndex()...');

    let result: number | null = null;

    for (const [shipIndex, ship] of this.ships.entries()) {
      if (
        ship.nextRound <= this.round &&
        !ship.isDestroyed &&
        (result === null || ship.initiative < this.ships[result]!.initiative)
      ) {
        result = shipIndex;
      }
    }

    return result;
  }

  getRemainingShips() {
    let ships = [...this.ships];

    ships = ships
      .filter((ship) => ship.nextRound <= this.round)
      .toSorted((shipA, shipB) => shipA.initiative - shipB.initiative);

    return ships;
  }

  // TODO: implement
  endBattle() {
    // TODO: remove battle effects
  }
}
