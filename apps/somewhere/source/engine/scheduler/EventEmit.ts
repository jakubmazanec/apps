import {type Event} from '../ecs/Event.js';
import {type EventChannel} from '../ecs/EventChannel.js';

export type EventEmit = {channel: EventChannel; event: Event};
