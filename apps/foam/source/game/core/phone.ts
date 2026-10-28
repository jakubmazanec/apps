import {type RunnableDialogueScript} from 'tellurion';

import {type Night} from './night.js';

export type Message = {
  /** Names the message: the path of its texts and its place in the night's lists. */
  key: string;

  /** The sender, as the toast names it. Every node of the script sets it as the speaker. */
  from: string;

  /**
   * Whether the message arrives now. The night screen reads it whenever it looks at the night, for
   * a message that has not arrived; the first time it holds, the message is unread. It has no side
   * effects: the checker runs it on thousands of nights.
   */
  arrives: (night: Night) => boolean;

  script: RunnableDialogueScript<Night>;
};

/**
 * Moves every message whose condition holds, and that has neither arrived nor been read, to the end
 * of the unread list, in the list's order, and returns them.
 */
export function receiveMessages(night: Night, messages: readonly Message[]): Message[] {
  let {unread, read} = night.phone;
  let received: Message[] = [];

  for (let message of messages) {
    if (!unread.includes(message.key) && !read.includes(message.key) && message.arrives(night)) {
      unread.push(message.key);
      received.push(message);
    }
  }

  return received;
}

/** The oldest unread message, or undefined with none. */
export function getUnreadMessage(night: Night, messages: readonly Message[]): Message | undefined {
  return messages.find(({key}) => key === night.phone.unread[0]);
}

/** Moves the key from the unread list to the read list; a key not unread does nothing. */
export function readMessage(night: Night, key: string): void {
  let index = night.phone.unread.indexOf(key);

  if (index !== -1) {
    night.phone.unread.splice(index, 1);
    night.phone.read.push(key);
  }
}

/** Takes every key the content lacks out of both lists, with a console warning for each. */
export function dropUnknownMessages(night: Night, messages: readonly Message[]): void {
  let keys = new Set(messages.map(({key}) => key));

  // In place, so a night that shares the lists sees the change.
  for (let list of [night.phone.unread, night.phone.read]) {
    let kept: string[] = [];

    for (let key of list) {
      if (keys.has(key)) {
        kept.push(key);
      } else {
        // eslint-disable-next-line no-console -- the running game reports a message the content lacks
        console.warn(`The phone drops the message "${key}", which the content lacks.`);
      }
    }

    list.splice(0, Infinity, ...kept);
  }
}
