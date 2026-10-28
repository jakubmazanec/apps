import {readTitle} from '../../core/night.js';
import {type Message} from '../../core/phone.js';
import {standIn} from '../../core/prose.js';
import {type Choice, defineScript} from '../../core/script.js';
import {CROWNS_STORY} from '../locations/hlavniNadrazi/forecourt.js';
import {FIGHT_STORY} from '../locations/malinovskehoNamesti/stop.js';
import {THROWN_OUT_STORY} from '../locations/rotorBar/location.js';
import {GUITARIST_STORY} from '../locations/rotorBar/room.js';
import {BIRTHDAY_STORY} from '../quest.js';
import {SENDER} from './sender.js';

// The text of this message is stand-in text: the author replaces standIn by prose when writing
// the real text. Its limits: no word is longer than 16 characters (every word must fit a line on
// the narrowest screen), every node sets `speaker` to the sender, every node with choices offers a
// reply that costs nothing, and the `*` marks of italic come in pairs. A story's title is stand-in
// text too, written with standIn.
const STORIES: ReadonlyArray<{
  id: 'birthday' | 'crowns' | 'fight' | 'guitarist' | 'thrownOut';
  title: string[] | string;
}> = [
  {id: 'crowns', title: CROWNS_STORY},
  {id: 'fight', title: FIGHT_STORY},
  {id: 'guitarist', title: GUITARIST_STORY},
  {id: 'thrownOut', title: THROWN_OUT_STORY},
  {id: 'birthday', title: BIRTHDAY_STORY},
];
const REPLIES: Array<Choice<'really'>> = [{text: 'Really?', next: 'really'}, {text: 'OK'}];

// The id of one of the five stories, which names its node, by the title; undefined for any other.
function getStoryId(title: string): (typeof STORIES)[number]['id'] | undefined {
  return STORIES.find((story) => readTitle(story.title) === title)?.id;
}

export const realOne: Message = {
  key: 'realOne',
  from: SENDER,
  arrives: (night) => night.stories.some(({title}) => getStoryId(title) !== undefined),
  script: defineScript({
    // The night's stories are in the order found. A night with none of the five, as the check
    // nights are, reads the crowns.
    start: (night) =>
      night.stories.map(({title}) => getStoryId(title)).find((id) => id !== undefined) ?? 'crowns',
    nodes: {
      crowns: {
        speaker: SENDER,
        text: standIn`
          The man who wants twenty crowns is real. He asked me too, years ago, and I still don't
          know whether he got home.
        `,
        choices: REPLIES,
      },
      fight: {
        speaker: SENDER,
        text: standIn`
          The fight at the stop happened to a friend of mine. He did not step in, and he still
          thinks about it.
        `,
        choices: REPLIES,
      },
      guitarist: {
        speaker: SENDER,
        text: standIn`
          The guitarist was real. He played in the corner every Friday, and never once looked up.
        `,
        choices: REPLIES,
      },
      thrownOut: {
        speaker: SENDER,
        text: standIn`
          Thrown out at three: that one is mine. The bartender really did hold the door.
        `,
        choices: REPLIES,
      },
      birthday: {
        speaker: SENDER,
        text: standIn`
          The birthday was real, and so was the bottle. We opened it before the toast.
        `,
        choices: REPLIES,
      },
      really: {
        speaker: SENDER,
        text: standIn`Really. Most of tonight happened to somebody.`,
      },
    },
  }),
};
