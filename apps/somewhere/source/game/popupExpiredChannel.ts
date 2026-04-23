import {EventChannel} from '../engine/ecs/EventChannel.js';
import {PopupExpired} from './PopupExpired.js';

export const popupExpiredChannel = new EventChannel({
  event: PopupExpired,
  displayName: 'Popup expired',
});
