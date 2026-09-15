import {type Constructor} from '../utilities/Constructor';
import {type Event} from './Event';

export type EventChannelOptions<T extends Constructor<Event>> = {
  event: T;
  displayName?: string | undefined;
};
