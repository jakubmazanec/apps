import createClientAuth, {type RemixAuthOptions} from '@gel/auth-remix/client';

import {appUrl} from '../constants.js';

export const options = {
  baseUrl:
    import.meta.env.DEV ? 'http://localhost:5000' : String(import.meta.env.VITE_APP_URL ?? appUrl),
} satisfies RemixAuthOptions;

export const auth = createClientAuth(options);
