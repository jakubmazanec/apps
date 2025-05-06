import {type CardType} from './Card.js';
import {type ShipAmmo} from './Ship.js';

export type AmmoEffectConfig = {
  type: 'ammo';
  ammo: ShipAmmo;
};

export type AccuracyEffectConfig = {
  type: 'accuracy';
  accuracyBonus: number;
  accuracyMultiplier: number;
};

export type ChangeCardEffectConfig = {
  type: 'change-card';
  cardType: CardType;
  propertyName: string;
  value: number | null;
  bonus: number;
  multiplier: number;
};

export type ChangeShipEffectConfig = {
  type: 'change-ship';
  propertyName: 'energyPerTurn' | 'initiative' | 'moveCardCostBonus' | 'turnCardCostBonus';
  value: number | null;
  bonus: number;
  multiplier: number;
};

export type PermanentEffectDuration = {
  type: 'permanent';
};

export type BattleEffectDuration = {
  type: 'battle';
};

export type RoundsEffectDuration = {
  type: 'rounds';
  roundsUntilEnd: number;
};

export type UsesEffectDuration = {
  type: 'uses';
  usesUntilEnd: number;
};

export type CardsEffectDuration = {
  type: 'cards';
  cardsUntilEnd: number;
};

export type EffectDuration =
  | BattleEffectDuration
  | CardsEffectDuration
  | PermanentEffectDuration
  | RoundsEffectDuration
  | UsesEffectDuration;

export type EffectDurationType = EffectDuration['type'];

export type EffectConfig = {
  duration: EffectDuration;
} & (AccuracyEffectConfig | AmmoEffectConfig | ChangeCardEffectConfig | ChangeShipEffectConfig);

export type EffectType = EffectConfig['type'];

export type EffectOptions = {
  config: EffectConfig;
};

export class Effect {
  config: EffectConfig;
  duration: EffectDuration;

  constructor({config}: EffectOptions) {
    this.config = config;
    this.duration = {...config.duration};
  }

  static from({config}: Effect) {
    return new this({config});
  }

  // static getTemplate(templateId: string): EffectOptions {
  //   let templates: Array<EffectOptions & {id: string}> = [
  //     {
  //       name: 'Chain shot for 1 round',
  //       id: 'ammo-chain',
  //       config: {
  //         roundsUntilEnd: 1,
  //         type: 'ammo',
  //         ammo: 'chain',
  //       },
  //     },
  //   ];

  //   let template = templates.find((template) => template.id === templateId);

  //   if (!template) {
  //     throw new Error(`Effect template "${templateId}" not found!`);
  //   }

  //   let {id, ...effect} = template;

  //   return {...effect};
  // }

  getDescription(): [string, string] {
    let effectDescription = '';
    let durationDescription = '';

    switch (this.config.type) {
      case 'accuracy': {
        effectDescription = `Accuracy: +${Math.round(this.config.accuracyBonus * 100)}%, *${this.config.accuracyMultiplier}`;

        break;
      }

      case 'ammo': {
        effectDescription = `Change ammo to ${this.config.ammo}`;

        break;
      }

      case 'change-card': {
        effectDescription = `${this.config.propertyName.charAt(0).toUpperCase() + this.config.propertyName.slice(1)} (${this.config.cardType} cards): =${this.config.value}, +${this.config.bonus}, *${this.config.multiplier}`;

        break;
      }

      case 'change-ship': {
        effectDescription = `${this.config.propertyName.charAt(0).toUpperCase() + this.config.propertyName.slice(1)} (ship): =${this.config.value}, +${this.config.bonus}, *${this.config.multiplier}`;

        break;
      }

      // no default
    }

    switch (this.duration.type) {
      case 'battle': {
        durationDescription = `During the battle`;

        break;
      }

      case 'cards': {
        durationDescription = `${this.duration.cardsUntilEnd} cards`;

        break;
      }

      case 'permanent': {
        durationDescription = `Permanent`;

        break;
      }

      case 'rounds': {
        durationDescription = `${this.duration.roundsUntilEnd} rounds`;

        break;
      }

      case 'uses': {
        durationDescription = `${this.duration.usesUntilEnd} uses`;

        break;
      }

      // no default
    }

    return [effectDescription, durationDescription];
  }

  decreaseDuration() {
    switch (this.duration.type) {
      case 'battle': {
        throw new Error("Effect's duration can't be decreased!");
        // break;
      }

      case 'cards': {
        this.duration.cardsUntilEnd -= 1;

        break;
      }

      case 'permanent': {
        throw new Error("Effect's duration can't be decreased!");
        // break;
      }

      case 'rounds': {
        this.duration.roundsUntilEnd -= 1;

        break;
      }

      case 'uses': {
        this.duration.usesUntilEnd -= 1;

        break;
      }

      // no default
    }
  }

  get isActive() {
    switch (this.duration.type) {
      case 'battle': {
        return true;
      }

      case 'cards': {
        return this.duration.cardsUntilEnd > 0;
      }

      case 'permanent': {
        return true;
      }

      case 'rounds': {
        return this.duration.roundsUntilEnd > 0;
      }

      case 'uses': {
        return this.duration.usesUntilEnd > 0;
      }

      // no default
    }

    return false;
  }
}
