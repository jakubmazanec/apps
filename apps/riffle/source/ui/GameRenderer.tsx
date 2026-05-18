/* eslint-disable react/no-array-index-key -- neded */
import {observer} from 'mobx-react-lite';
import {type FC, useCallback, useState} from 'react';

import {type Card, useGame} from '../engine.js';
import {Keyboard} from './Keyboard.js';

type CardComponentProps = {
  card: Card;
  className?: string;
  onClick: (card: Card) => void;
};

function CardComponent({card, className, onClick}: CardComponentProps) {
  let handleClick = useCallback(() => {
    onClick(card);
  }, [card, onClick]);

  return (
    <div className={className} onClick={handleClick}>
      <h4>{card.name}</h4>
    </div>
  );
}

export const GameRenderer: FC = observer(() => {
  let game = useGame();

  let [inputCards, setInputCards] = useState<Card[]>([]);
  let [selectedCards, setSelectedCards] = useState<Card[]>([]);
  let [highlightedCardIndex, setHighlightedCardIndex] = useState(0);

  let handleCardClick = useCallback(
    (card: Card) => {
      if (selectedCards.includes(card)) {
        let index = selectedCards.indexOf(card);

        if (index > -1) {
          selectedCards.splice(index, 1);
          setSelectedCards([...selectedCards]);
        }
      } else {
        selectedCards.push(card);
        setSelectedCards([...selectedCards]);
      }
    },
    [selectedCards],
  );

  let onKeyPress = (input: string): void => {
    switch (input) {
      case '{arrowleft}': {
        setHighlightedCardIndex(Math.max(0, highlightedCardIndex - 1));

        break;
      }

      case '{arrowright}': {
        setHighlightedCardIndex(Math.min(highlightedCardIndex + 1, game.cards.length - 1));

        break;
      }

      case '{backspace}': {
        if (inputCards.length) {
          inputCards.pop();
          setInputCards([...inputCards]);
        }

        break;
      }

      case '{delete}': {
        if (!game.canDiscardCards()) {
          break;
        }

        game.discardCards(selectedCards);
        setInputCards([]);
        setSelectedCards([]);

        break;
      }

      case '{enter}': {
        // if (!game.canPlayCards()) {
        //   break;
        // }

        game.playCards(inputCards);
        setInputCards([]);
        setSelectedCards([]);

        break;
      }

      case '{space}': {
        let card = game.cards[highlightedCardIndex];

        if (!card) {
          break;
        }

        if (selectedCards.includes(card)) {
          let index = selectedCards.indexOf(card);

          if (index > -1) {
            selectedCards.splice(index, 1);
            setSelectedCards([...selectedCards]);
          }
        } else {
          selectedCards.push(card);
          setSelectedCards([...selectedCards]);
        }

        break;
      }

      default: {
        for (let card of game.cards) {
          if (card.config.symbol === input && !inputCards.includes(card)) {
            inputCards.push(card);
            setInputCards([...inputCards]);

            break;
          }
        }
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex gap-4">
        {game.status === 'in-progress' ?
          <div>{`Round: ${game.round}`}</div>
        : null}
        {game.status === 'in-progress' ?
          <div>{`Score: ${game.score} (${game.pointsNeeded})`}</div>
        : null}
        {game.status === 'finished' && game.result ?
          <div>{game.result === 'won' ? 'You won!' : 'You lost...'}</div>
        : null}
        {game.status === 'in-progress' ? null : (
          <button type="button" onClick={() => game.start()}>
            Start game!
          </button>
        )}
      </section>

      {game.status === 'in-progress' ?
        <section className="flex gap-4">
          <div>{`Hands: ${game.handsRemaining}`}</div>
          <div>{`Discards: ${game.discardsRemaining}`}</div>
        </section>
      : null}

      {game.status === 'in-progress' ?
        <section className="flex flex-col gap-y-4">
          <h2>Input</h2>

          <div className="flex gap-6">{inputCards.map((card, index) => card.name).join('')}</div>
        </section>
      : null}

      {game.status === 'in-progress' ?
        <section className="flex flex-col gap-y-4">
          <h2>Cards</h2>

          <div className="flex gap-6">
            {game.cards.map((card, index) => {
              let className = '';

              if (selectedCards.includes(card)) {
                className += ' font-bold';
              }

              if (highlightedCardIndex === index) {
                className += ' border border-blue-500';
              }

              return (
                <CardComponent
                  key={`${index}.${card.name}`}
                  card={card}
                  className={className}
                  onClick={handleCardClick}
                />
              );
            })}
          </div>
        </section>
      : null}

      {game.status === 'in-progress' ?
        <Keyboard
          disableButtonHold
          physicalKeyboardHighlight
          physicalKeyboardHighlightPress
          layout={{
            default: [
              'q w e r t y u i o p {backspace}',
              'a s d f g h j k l {enter} {delete}',
              'z x c v b n m . ! ?',
              '{arrowleft} {space} {arrowright}',
            ],
          }}
          debug={false}
          // onChange={onChange}
          // onChangeAll={onChangeAll}
          onKeyPress={onKeyPress}
        />
      : null}
    </div>
  );
});
