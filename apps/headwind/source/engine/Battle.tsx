import {makeAutoObservable} from 'mobx';
import React from 'react';

import {Character} from '../internals';
import {getCharacterTemplateById} from '../templates/characterTemplates';
import {
  Action,
  ActionType,
  BattleEffect,
  BattleEffectType,
  CharacterBattleInfo,
  CharacterEffectType,
} from '../types';

export class Battle {
  characters: Character[] = [
    new Character(getCharacterTemplateById('jakub')),
    new Character(getCharacterTemplateById('cat-1')),
    new Character(getCharacterTemplateById('bear-1')),
    new Character(getCharacterTemplateById('bird-1')),
    new Character(getCharacterTemplateById('enemy')),
    new Character(getCharacterTemplateById('cat-2')),
    new Character(getCharacterTemplateById('bear-2')),
    new Character(getCharacterTemplateById('bird-2')),
  ];

  actions: Action[] = [];
  effects: BattleEffect[] = [];

  round = 0;
  battleInfos: CharacterBattleInfo[] = [];
  activeCharacterIndex = 0;

  constructor() {
    this.init();

    makeAutoObservable(this);
  }

  init() {
    console.log('Battle.init...');
    this.battleInfos = this.characters.map((character, characterIndex) => ({
      team: characterIndex > 3 ? 1 : 0,
      nextRound: 0,
    }));

    let result: number | null = null;

    for (const [characterIndex, character] of this.characters.entries()) {
      if (result === null || character.speed > this.characters[result].speed) {
        result = characterIndex;
      }
    }

    this.activeCharacterIndex = result ?? 0;

    this.startRound();
  }

  getCharacter(characterIndex: number) {
    return this.characters[characterIndex];
  }

  /**
   * Finishes current round and then starts new one via `.startRound()`.
   */
  nextRound() {
    console.log('Battle.nextRound...');
    // check action queue
    for (const action of this.actions) {
      action.duration -= 1;

      if (action.duration === 0) {
        this.applyAction(action);
      }
    }

    // end battle effects
    for (const effect of this.effects) {
      effect.duration -= 1;

      // reverting effects
      if (effect.duration === 0 && effect.type === BattleEffectType.Onetime) {
        if (effect.characterChange) {
          // TODO:
          // this.characters[effect.targetIndex].revertChange(effect.characterChange);
        } else {
          //
        }
      }
    }

    // run character effects
    for (const character of this.characters) {
      character.nextRound();
    }

    // if some character was skipped, we need to set that all characters are in the same turn
    const nextRound = Math.max(...this.battleInfos.map((battleInfo) => battleInfo.nextRound));

    for (const battleInfo of this.battleInfos) {
      battleInfo.nextRound = nextRound;
    }

    // increase round index
    this.round += 1;

    // start round
    this.startRound();
  }

  /**
   * Starts new round.
   */
  startRound() {
    console.log('Battle.startRound...');

    // choose starting character
    const nextCharacterIndex = this.getNextCharacterIndex();

    if (nextCharacterIndex === null) {
      throw new Error('Battle.getNextCharacterIndex returned null.');
    } else {
      this.activeCharacterIndex = nextCharacterIndex;
    }

    // run actions
    for (const action of this.actions) {
      if (action.duration === 0) {
        this.applyAction(action);
      }
    }

    // run battle effects
    for (const effect of this.effects) {
      if (effect.duration > 0 && effect.type === BattleEffectType.Repeat) {
        this.applyBattleEffect(effect);
      }
    }

    // run character effects
    for (const character of this.characters) {
      character.startRound();
    }

    // cleanup expired actions
    this.actions = this.actions.filter((action) => action.duration > 0);

    // cleanup expired battle effects
    this.effects = this.effects.filter((effect) => effect.duration > 0);
  }

  getNextCharacterIndex() {
    console.log('Battle.getNextCharacterIndex...');

    let result: number | null = null;

    // recently un-broken characters have priority
    for (const [characterIndex, character] of this.characters.entries()) {
      const isBroken = character.isBroken();

      if (
        isBroken === 0 &&
        this.battleInfos[characterIndex].nextRound === this.round &&
        character.hp > 0 &&
        (result === null || character.speed > this.characters[result].speed)
      ) {
        result = characterIndex;
      }
      console.log('result', result);
    }

    // then all other characters
    for (const [characterIndex, character] of this.characters.entries()) {
      const isBroken = character.isBroken();

      if (
        isBroken === false &&
        this.battleInfos[characterIndex].nextRound === this.round &&
        character.hp > 0 &&
        (result === null || character.speed > this.characters[result].speed)
      ) {
        result = characterIndex;
      }
    }

    return result;
  }

  /**
   * Finds character who's turn is next and updates `activeCharacterIndex` accordingly.
   */
  nextTurn() {
    console.log('Battle.nextTurn...');

    const nextCharacterIndex = this.getNextCharacterIndex();

    if (nextCharacterIndex === null) {
      this.nextRound();
    } else {
      this.activeCharacterIndex = nextCharacterIndex;
    }
  }

  getOrderedCharacters() {
    console.log('Battle.getOrderedCharacters...');
    let currentRoundCharactersCopy = [...this.characters];
    let nextRoundCharactersCopy = [...this.characters];

    currentRoundCharactersCopy.sort((a, b) => {
      const isABroken = a.isBroken();
      const isBBroken = b.isBroken();

      if (isABroken === 0 && isBBroken === 0) {
        if (a.speed > b.speed) {
          return -1;
        }

        if (a.speed < b.speed) {
          return 1;
        }

        return 0;
      }

      if (isABroken === 0 && isBBroken !== 0) {
        return -1;
      }

      if (isABroken !== 0 && isBBroken === 0) {
        return 1;
      }

      if (a.speed > b.speed) {
        return -1;
      }

      if (a.speed < b.speed) {
        return 1;
      }

      return 0;
    });

    nextRoundCharactersCopy.sort((a, b) => {
      console.log('nextRoundCharactersCopy.sort...', a.name, b.name);
      const isABroken = a.isBroken();
      const isBBroken = b.isBroken();

      if (isABroken === 1 && isBBroken === 1) {
        if (a.speed > b.speed) {
          return -1;
        }

        if (a.speed < b.speed) {
          return 1;
        }

        return 0;
      }

      if (isABroken === 1 && isBBroken !== 1) {
        return -1;
      }

      if (isABroken !== 1 && isBBroken === 1) {
        return 1;
      }

      if (a.speed > b.speed) {
        return -1;
      }

      if (a.speed < b.speed) {
        return 1;
      }

      return 0;
    });

    currentRoundCharactersCopy = currentRoundCharactersCopy.filter((character) => {
      const isBroken = character.isBroken();

      return (
        this.battleInfos[this.characters.indexOf(character)].nextRound === this.round &&
        character.hp > 0 &&
        isBroken === false
      );
    });

    nextRoundCharactersCopy = nextRoundCharactersCopy.filter((character) => {
      const isBroken = character.isBroken();

      return character.hp > 0 && (isBroken === false || isBroken <= 1);
    });

    return [currentRoundCharactersCopy, nextRoundCharactersCopy];
  }

  applyAction(action: Action) {
    if (action.type === ActionType.Attack) {
      const attacker = this.characters[action.ownerIndex];
      const defender = this.characters[action.targetIndex];
      const damage = (attacker.attack / defender.defense) * action.weapon.damage.power;
      const hpChange =
        defender.shields > 0 ?
          damage * -1
        : damage * -1 * defender.damageModifiers[action.weapon.damage.type];
      const shieldsChange = defender.damageModifiers[action.weapon.damage.type] > 0 ? -1 : 0;

      if (defender.shields + shieldsChange <= 0) {
        // break!
        defender.addEffect({
          type: CharacterEffectType.Break,
          duration: defender.isBroken() === 1 ? 2 : 1,
          owner: defender,
        });
      }

      defender.applyChange({
        hp: hpChange,
        shields: shieldsChange,
      });
    } else if (action.type === ActionType.AbilityUse) {
      //
    } else if (action.type === ActionType.ItemUse) {
      //
    }
  }

  performAction(action: Action) {
    console.log('performAction...', action);
    if (action.isImmediate) {
      if (action.type === ActionType.Attack) {
        this.applyAction(action);

        this.battleInfos[this.activeCharacterIndex].nextRound =
          this.round + Math.max(action.duration, 1);

        this.nextTurn();
      } else if (action.type === ActionType.AbilityUse) {
        // TODO:
        this.applyAction(action);
      } else if (action.type === ActionType.ItemUse) {
        // TODO:
        this.applyAction(action);
      }
    } else {
      this.actions.push(action);

      this.battleInfos[this.activeCharacterIndex].nextRound =
        this.round + Math.max(action.duration, 1);

      this.nextTurn();
    }
  }

  applyBattleEffect(effect: BattleEffect) {
    // TODO: rework
    // if (effect.type === BattleEffectType.Onetime) {
    //   if (effect.characterChange) {
    //     this.characters[effect.targetIndex].applyChange(effect.characterChange);
    //   }
    //   if (effect.attackAction) {
    //     this.applyAction(effect.attackAction);
    //   }
    // } else if (effect.type === BattleEffectType.Repeat) {
    //   if (effect.characterChange) {
    //     this.characters[effect.targetIndex].applyChange(effect.characterChange);
    //   }
    //   if (effect.attackAction) {
    //     this.applyAction(effect.attackAction);
    //   }
    // } else if (effect.type === BattleEffectType.Break) {
    //   //
    // }
  }

  revertBattleEffect(effect: BattleEffect) {
    // TODO: rework
    // if (effect.type === BattleEffectType.Onetime) {
    //   if (effect.characterChange) {
    //     this.characters[effect.targetIndex].revertChange(effect.characterChange);
    //   }
    // } else if (effect.type === BattleEffectType.Repeat) {
    //   //
    // }
  }

  performBattleEffect(effect: BattleEffect) {
    // TODO: rework
    // console.log('performBattleEffect...', effect);
    // if (effect.type === BattleEffectType.Onetime) {
    //   this.applyBattleEffect(effect);
    //   this.effects.push(effect);
    // } else if (effect.type === BattleEffectType.Repeat) {
    //   this.applyBattleEffect(effect);
    //   this.effects.push(effect);
    // } else if (effect.type === BattleEffectType.Break) {
    //   this.applyBattleEffect(effect);
    //   this.effects.push(effect);
    // }
  }
}

const battleContext = React.createContext<Battle | null>(null);

interface BattleProviderProps {
  battle: Battle;
}

export const BattleProvider: React.FC<BattleProviderProps> = ({children, battle}) => (
  <battleContext.Provider value={battle}>{children}</battleContext.Provider>
);

export function useBattleContext() {
  const context = React.useContext(battleContext);

  if (!context) {
    throw new Error('useBattleContext must be within BattleProvider');
  }

  return context;
}
