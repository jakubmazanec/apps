import {redirect} from '@remix-run/node';

import {client, e} from '../db.js';
import {auth} from '../services/auth.server.js';

let handlers = auth.createAuthRouteHandlers({
  async onBuiltinUICallback({error, tokenData, isSignUp}) {
    if (error) {
      console.error(error);

      return redirect('/');
    }

    let clientWithGlobal = client.withGlobals({isAdmin: true});
    let identityId = tokenData?.identity_id;

    if (identityId) {
      let existingUser = await e
        .assert_single(
          e.select(e.User, (user) => ({
            filter: e.op(user.identities.id, '?=', e.uuid(identityId)),
          })),
        )
        .run(clientWithGlobal);

      if (!existingUser) {
        await e
          .insert(e.User, {
            name: '',
            identities: e.assert_exists(
              e.select(e.ext.auth.Identity, () => ({
                filter_single: {id: identityId},
              })),
            ),
          })
          .run(clientWithGlobal);
      }

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
