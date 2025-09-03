// TODO: repeatable karty - řešilo by to, že hýbat se je třeba častěji než v Cobalt Core, to, že sail a turn karty jsou repeatable?
// TODO: recyclable karty - po jejich odehrání nejdou do discard pile, ale zpátky na začátek draw pile, tzn. při dalším tažení karty jsou hned k dispozici

import {type Effect} from './Effect.js';

export type CardConfig =
  | {
      type: 'letter';
      symbol: string;
      value: number;
    }
  | {
      type: 'joker';
    };

export type CardOptions = {
  config: CardConfig;
};

export class Card {
  name: string;
  readonly #config: CardConfig;

  effects: Effect[] = [];

  constructor({config}: CardOptions) {
    this.name = config.symbol.toUpperCase();
    this.#config = config;
  }

  get config(): CardConfig {
    let resolvedConfig: Record<string, unknown> = {...this.#config};

    // TODO: re-implement when it'S clear what the card effects will be
    // for (let effect of this.effects) {
    //   if (
    //     effect.config.type === 'change-card' &&
    //     effect.config.propertyName in resolvedConfig &&
    //     typeof resolvedConfig[effect.config.propertyName] === 'number'
    //   ) {
    //     if (effect.config.value !== null) {
    //       resolvedConfig[effect.config.propertyName] = effect.config.value;

    //       continue;
    //     }

    //     resolvedConfig[effect.config.propertyName] =
    //       ((resolvedConfig[effect.config.propertyName] as number) + effect.config.bonus) *
    //       effect.config.multiplier;
    //   }
    // }

    return resolvedConfig as unknown as CardConfig;
  }

  static getTemplate(templateId: string): CardOptions {
    let templates: Array<CardOptions & {id: string}> = [
      {
        id: 'e',
        config: {
          symbol: 'e',
          value: 1,
        },
      },
      {
        id: 't',
        config: {
          symbol: 't',
          value: 1,
        },
      },
      {
        id: 'a',
        config: {
          symbol: 'a',
          value: 2,
        },
      },
      {
        id: 'o',
        config: {
          symbol: 'o',
          value: 2,
        },
      },
      {
        id: 'i',
        config: {
          symbol: 'i',
          value: 3,
        },
      },
      {
        id: 'n',
        config: {
          symbol: 'n',
          value: 3,
        },
      },
      {
        id: 's',
        config: {
          symbol: 's',
          value: 4,
        },
      },
      {
        id: 'r',
        config: {
          symbol: 'r',
          value: 4,
        },
      },
      {
        id: 'h',
        config: {
          symbol: 'h',
          value: 5,
        },
      },
      {
        id: 'd',
        config: {
          symbol: 'd',
          value: 5,
        },
      },
      {
        id: 'l',
        config: {
          symbol: 'l',
          value: 6,
        },
      },
      {
        id: 'u',
        config: {
          symbol: 'u',
          value: 6,
        },
      },
      {
        id: 'c',
        config: {
          symbol: 'c',
          value: 7,
        },
      },
      {
        id: 'm',
        config: {
          symbol: 'm',
          value: 7,
        },
      },
      {
        id: 'f',
        config: {
          symbol: 'f',
          value: 8,
        },
      },
      {
        id: 'y',
        config: {
          symbol: 'y',
          value: 8,
        },
      },
      {
        id: 'w',
        config: {
          symbol: 'w',
          value: 9,
        },
      },
      {
        id: 'g',
        config: {
          symbol: 'g',
          value: 9,
        },
      },
      {
        id: 'p',
        config: {
          symbol: 'p',
          value: 10,
        },
      },
      {
        id: 'b',
        config: {
          symbol: 'b',
          value: 10,
        },
      },
      {
        id: 'v',
        config: {
          symbol: 'v',
          value: 11,
        },
      },
      {
        id: 'k',
        config: {
          symbol: 'k',
          value: 11,
        },
      },
      {
        id: 'x',
        config: {
          symbol: 'x',
          value: 12,
        },
      },
      {
        id: 'q',
        config: {
          symbol: 'q',
          value: 12,
        },
      },
      {
        id: 'j',
        config: {
          symbol: 'j',
          value: 13,
        },
      },
      {
        id: 'z',
        config: {
          symbol: 'z',
          value: 13,
        },
      },
    ];

    let template = templates.find((template) => template.id === templateId);

    if (!template) {
      throw new Error(`Card template "${templateId}" not found!`);
    }

    let {id, ...card} = template;

    return {...card};
  }

  static fromTemplate(templateId: string): Card {
    return new this(Card.getTemplate(templateId));
  }

  static fromString(templateIds: string): Card[] {
    return [...templateIds.replaceAll(' ', '').replaceAll(',', '')].map((templateId) =>
      Card.fromTemplate(templateId),
    );
  }

  // applyEffect(effect: Effect) {
  //   this.effects.push(Effect.from(effect));
  // }

  // removeInactiveEffects() {
  //   let remainingEffects = [];

  //   for (let effect of this.effects) {
  //     if (effect.isActive) {
  //       remainingEffects.push(effect);
  //     }
  //   }

  //   this.effects = remainingEffects;
  // }

  // decreaseEffectsDuration(durationType: Omit<EffectDurationType, 'battle' | 'permanent' | 'uses'>) {
  //   for (let effect of this.effects) {
  //     if (effect.duration.type === durationType) {
  //       effect.decreaseDuration();
  //     }
  //   }

  //   this.removeInactiveEffects();
  // }

  // decreaseEffectDuration(effect: Effect) {
  //   if (!this.effects.includes(effect)) {
  //     throw new Error('Effect must belong to the ship!');
  //   }

  //   effect.decreaseDuration();

  //   this.removeInactiveEffects();
  // }
}
