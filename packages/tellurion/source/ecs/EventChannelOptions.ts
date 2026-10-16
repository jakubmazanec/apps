import {type Constructor} from '../utilities/Constructor.js';
import {type Event} from './Event.js';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};
