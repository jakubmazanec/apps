import {json, type LoaderFunctionArgs} from '@remix-run/node';
import {useLoaderData} from '@remix-run/react';

import {NOTES_PER_PAGE} from '../constants.js';
import {e} from '../db.js';
import {auth} from '../services/auth.server.js';
import {Notes} from '../ui.js';
import {Pagination} from '../ui/Pagination.js';

export const loader = async ({request, params: parameters}: LoaderFunctionArgs) => {
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();

  if (!isSignedIn) {
    return json({isSignedIn});
  }

  let page = Number.parseInt(parameters.page ?? '1', 10);
  let notesCount = await e.count(e.Note).run(session.client);
  let notes = await e
    .select(e.Note, (note) => ({
      ...e.Note['*'],
      offset: (page - 1) * NOTES_PER_PAGE,
      limit: NOTES_PER_PAGE,
      order_by: {
        expression: note.order,
        direction: e.DESC,
      },
    }))
    .run(session.client);

  return json({
    isSignedIn,
    notes,
    currentPage: page,
    pagesCount: Math.trunc(notesCount / NOTES_PER_PAGE) + (notesCount % NOTES_PER_PAGE > 0 ? 1 : 0),
  });
};

export default function NotesRoute() {
  let data = useLoaderData<typeof loader>();

  return data.isSignedIn ?
      <div className="flex flex-col gap-y-6 p-4">
        <Notes notes={data.notes} />
        <Pagination
          currentPage={data.currentPage}
          pageLink="/notes/"
          pagesCount={data.pagesCount}
        />
      </div>
    : null;
}
