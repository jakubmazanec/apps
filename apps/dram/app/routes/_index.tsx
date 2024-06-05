import {json, type LoaderFunctionArgs} from '@remix-run/node';
import {Link, useLoaderData} from '@remix-run/react';

import {e} from '../db.js';
import {auth as clientAuth} from '../services/auth.js';
import {auth} from '../services/auth.server.js';

export const loader = async ({request}: LoaderFunctionArgs) => {
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();
  let notesCount;

  if (isSignedIn) {
    notesCount = await e.count(e.Note).run(session.client);
  }

  return json({
    isSignedIn,
    notesCount,
  });
};

export default function Index() {
  let {isSignedIn, notesCount} = useLoaderData<typeof loader>();

  return (
    <div className="p-4">
      <h1>Dram.</h1>
      <p className="text-sm">(In development.)</p>
      {isSignedIn ?
        <>
          <p className="text-sm">{notesCount} notes.</p>
          <ul className="text-sm">
            <li>
              <Link to={clientAuth.getSignoutUrl()}>Sign out</Link>
            </li>
          </ul>
        </>
      : <ul className="text-sm">
          <li>
            <Link to={clientAuth.getBuiltinUIUrl()}>Sign in</Link>
          </li>
        </ul>
      }
    </div>
  );
}
