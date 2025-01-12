import {type LoaderFunctionArgs} from 'react-router';

// import {useLoaderData} from '@remix-run/react';
// import {e} from '../db.js';
import {auth} from '../services/auth.server.js';
// import {Notes} from '../ui.js';

export const loader = async ({request}: LoaderFunctionArgs) => {
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();

  if (!isSignedIn) {
    return {isSignedIn};
  }

  // TODO: when @jakubmazanec/ui DataTable allows for disabling pagination and other additional functionality, enable this again
  // let notesCount = await e.count(e.Note).run(session.client);
  // let notes = await e
  //   .select(e.Note, (note) => ({
  //     ...e.Note['*'],
  //     offset: 0,
  //     limit: 10,
  //     order_by: {
  //       expression: note.order,
  //       direction: e.DESC,
  //     },
  //   }))
  //   .run(session.client);

  return {
    isSignedIn,
    // notesCount,
    // notes,
  };
};

export default function IndexRoute() {
  // let data = useLoaderData<typeof loader>();

  return (
    <div className="p-4">
      {/* data.isSignedIn ?
        <Notes notes={data.notes} />
      : null*/}
    </div>
  );
}
