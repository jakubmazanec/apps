import {EventChannel} from 'tellurion';

import {PopupExpired} from './PopupExpired.js';

export const popupExpiredChannel = new EventChannel({
  event: PopupExpired,
  displayName: 'Popup expired',
});
