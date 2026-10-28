import {type Message} from '../../core/phone.js';
import {bet} from './bet.js';
import {betSettled} from './betSettled.js';
import {broke} from './broke.js';
import {five} from './five.js';
import {four} from './four.js';
import {hello} from './hello.js';
import {hours} from './hours.js';
import {lastCall} from './lastCall.js';
import {realOne} from './realOne.js';
import {sang} from './sang.js';
import {shop} from './shop.js';
import {wrongNumber} from './wrongNumber.js';

/** The phone's messages, in the order the night tries them. */
export const messages: readonly Message[] = [
  hello,
  hours,
  four,
  five,
  shop,
  sang,
  broke,
  bet,
  betSettled,
  wrongNumber,
  realOne,
  lastCall,
];
