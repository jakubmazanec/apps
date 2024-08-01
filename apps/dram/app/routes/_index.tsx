import {json, type LoaderFunctionArgs} from '@remix-run/node';
import {useLoaderData} from '@remix-run/react';

import {e} from '../db.js';
import {auth} from '../services/auth.server.js';
import {Notes} from '../ui.js';

export const loader = async ({request}: LoaderFunctionArgs) => {
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();

  if (!isSignedIn) {
    return json({isSignedIn});
  }

  let notesCount = await e.count(e.Note).run(session.client);
  let notes = await e
    .select(e.Note, (note) => ({
      ...e.Note['*'],
      offset: 0,
      limit: 10,
      order_by: {
        expression: note.order,
        direction: e.DESC,
      },
    }))
    .run(session.client);

  return json({
    isSignedIn,
    notesCount,
    notes,
  });
};

export default function Index() {
  let data = useLoaderData<typeof loader>();

  return (
    <div className="p-4">
      {data.isSignedIn ?
        <Notes notes={data.notes} />
      : null}
    </div>
  );
}
