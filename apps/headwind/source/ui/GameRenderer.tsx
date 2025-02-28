import {observer} from 'mobx-react-lite';
import {type FC} from 'react';

import {useGame} from '../engine.js';
// import {GridGenerator, Hexagon, HexGrid, HexUtils, Layout, Text} from '../hexgrid/index.js';
// import {ActionType, BattleEffectType, DamageType} from '../types';
// import {AttackButton} from './AttackButton';
// import './styles.css';
import {defineHex, Grid, Orientation, rectangle} from '../honeycomb/index.js';

// let config = {
//   width: 1000,
//   height: 800,
//   layout: {width: 6, height: 6, flat: true, spacing: 1.02},
//   origin: {x: -40, y: -40},
//   mapProps: [10, 10],
// };
// const hexagons = GridGenerator.rectangle(...config.mapProps);

// ←  ↑   →   ↓   ↔   ↕   ↖   ↗   ↘   ↙

const Hex = defineHex({
  orientation: Orientation.FLAT,
  dimensions: {xRadius: 20, yRadius: 20},
});
const grid = new Grid(Hex, rectangle({width: 10, height: 5}));

export const GameRenderer: FC = observer(() => {
  const game = useGame();

  console.log('GameRenderer...', game, grid);

  // const layout = config.layout;
  // const size = {x: layout.width, y: layout.height};

  return (
    <div>
      <section>
        <svg
          className="grid"
          width="500"
          height="500"
          viewBox="0 0 500 500"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          {grid.toArray().map((hex, i) => (
            <g key={i}>
              <polygon
                points={hex.corners.map(({x, y}) => `${x},${y}`).join(' ')}
                className="fill-gray-100 stroke-gray-300 stroke-1"
              />
            </g>
          ))}
          <g>
            <text x={grid.getHex([1, 1])?.x} y={grid.getHex([1, 1])?.y} className="text-gray-900">
              ↗
            </text>
          </g>
        </svg>
        {/*<HexGrid
          className=""
          // css={css`
          //   g {
          //     fill: #3f51b5;
          //     fill-opacity: 0.6;
          //     &:hover {
          //       fill-opacity: 1;
          //     }
          //     text {
          //       font-size: 0.2em;
          //       fill: #000;
          //       fill-opacity: 0.9;
          //       transition: fill-opacity 0.2s;
          //     }
          //     polygon {
          //       stroke: #3f51b5;
          //       stroke-width: 0.2;
          //       transition: fill-opacity 0.2s;
          //     }
          //   }
          // `}
          height={config.height}
          width={config.width}
        >
          <Layout flat={layout.flat} origin={config.origin} size={size} spacing={layout.spacing}>
            {
              // note: key must be unique between re-renders.
              // using config.mapProps+i makes a new key when the goal template chnages.
              hexagons.map((hex, i) => (
                <Hexagon key={config.mapProps + i} q={hex.q} r={hex.r} s={hex.s}>
                  <Text>{HexUtils.getID(hex)}</Text>
                </Hexagon>
              ))
            }
          </Layout>
        </HexGrid>*/}
      </section>

      <pre>{`Round: ${game.round}`}</pre>

      <button onClick={() => game.nextRound()}>Next round!</button>
    </div>
  );
  // return (
  //   <div className={classes.root}>
  //     <div>
  //       <h2>Battle info</h2>
  //       <ul>
  //         {battle.characters.map((character, characterIndex) => (
  //           <li key={`characterIndex-${characterIndex}`}>
  //             {character.name}{' '}
  //             <span>
  //               {`${character.attack}/${character.defense}/${character.hp} `}
  //               <b>{character.shields}</b>
  //               <b>{character.isBroken() ? ' BROKEN' : null}</b>
  //             </span>
  //             <br />
  //           </li>
  //         ))}
  //       </ul>
  //       <p>Round: {battle.round}</p>
  //       <p>activeCharacterIndex: {battle.activeCharacterIndex}</p>
  //       <div>
  //         Order:{' '}
  //         <ol>
  //           {battle.getOrderedCharacters().map((orderedCharacters, characterIndex) => (
  //             <li key={`characterIndex-${characterIndex}`}>
  //               {orderedCharacters.map((character) => character.name).join(', ')}
  //             </li>
  //           ))}
  //         </ol>
  //       </div>
  //     </div>
  //     <div>
  //       <h2>Battle info</h2>
  //       <pre>{JSON.stringify(battle.battleInfos, null, 2)}</pre>

  //       <h3>Action queue</h3>
  //       <pre>{JSON.stringify(battle.actions, null, 2)}</pre>

  //       <h3>Character effects</h3>
  //       <ul>
  //         {battle.characters.map((character, characterIndex) => (
  //           <li key={`characterIndex-${characterIndex}`}>
  //             <pre>{JSON.stringify(character.effects, null, 2)}</pre>
  //           </li>
  //         ))}
  //       </ul>

  //       <h3>Battle effects</h3>
  //       <pre>{JSON.stringify(battle.effects, null, 2)}</pre>
  //     </div>

  //     <div>
  //       <h2>{battle.characters[battle.activeCharacterIndex].name}</h2>
  //       <pre>
  //         {(() => {
  //           const character = battle.characters[battle.activeCharacterIndex];

  //           return JSON.stringify(
  //             {
  //               name: character.name,
  //               //family: character.family.name,
  //               strength: character.strength,
  //               dexterity: character.dexterity,
  //               constitution: character.constitution,
  //               intelligence: character.intelligence,
  //               willpower: character.willpower,
  //               attack: character.attack,
  //               defense: character.defense,
  //               specialAttack: character.specialAttack,
  //               specialDefense: character.specialDefense,
  //               speed: character.speed,
  //               health: character.health,
  //               energyCapacity: character.energyCapacity,
  //               energyRegeneration: character.energyRegeneration,
  //               damageModifiers: character.damageModifiers,
  //             },
  //             null,
  //             2,
  //           );
  //         })()}
  //       </pre>
  //     </div>

  //     <div>
  //       <h2>{battle.characters[battle.activeCharacterIndex].name}: Actions</h2>
  //       {battle.characters[battle.activeCharacterIndex].weapons.map((weapon) => {
  //         return (
  //           <div key={weapon.name}>
  //             <h4>{weapon.name}</h4>
  //             {battle.battleInfos.map((battleInfo, characterIndex) => {
  //               return characterIndex !== battle.activeCharacterIndex &&
  //                 battleInfo.team !== battle.battleInfos[battle.activeCharacterIndex].team ? (
  //                 <AttackButton
  //                   key={`attack-button-${characterIndex}`}
  //                   attack={{
  //                     type: ActionType.Attack,
  //                     ownerIndex: battle.activeCharacterIndex,
  //                     targetIndex: characterIndex,
  //                     duration: weapon.action?.duration ?? 1,
  //                     isImmediate: weapon.action?.isImmediate ?? true,
  //                     weapon,
  //                   }}
  //                 />
  //               ) : null;
  //             })}
  //           </div>
  //         );
  //       })}
  //     </div>
  //   </div>
  // );
});
