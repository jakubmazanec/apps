import {redirect} from '@remix-run/node';

import {client, e} from '../db.js';
import {auth} from '../services/auth.server.js';

let handlers = auth.createAuthRouteHandlers({
  async onBuiltinUICallback({error, tokenData, isSignUp}) {
    if (error) {
      console.error(error);

      return redirect('/');
    }

    if (isSignUp && tokenData) {
      await e
        .insert(e.User, {
          name: '',
          identity: e.assert_exists(
            e.select(e.ext.auth.Identity, () => ({
              filter_single: {id: tokenData.identity_id},
            })),
          ),
        })
        .run(client);

      return redirect('/');
    }

    return redirect('/');
  },
  async onSignout() {
    return redirect('/');
  },
});

// eslint-disable-next-line @typescript-eslint/prefer-destructuring -- cannot use destructuring, otherwise Remixe Vite plugin cannot separate server and client code correctly and complains
export const loader = handlers.loader;
