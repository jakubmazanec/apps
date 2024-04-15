import {json, type LoaderFunctionArgs, type MetaFunction} from '@remix-run/node';
import {useLoaderData} from '@remix-run/react';

import {client, e} from '../db.js';

export async function loader({request}: LoaderFunctionArgs) {
  const notesCount = await e.count(e.Note).run(client);

  return json({
    notesCount,
  });
}

export const meta: MetaFunction = () => [{title: 'Dram'}];

export default function Index() {
  const {notesCount} = useLoaderData<typeof loader>();

  return (
    <div className="p-4">
      <h1>Dram.</h1>
      <p className="text-sm">(In development.)</p>
      <p className="text-sm">{notesCount} notes.</p>
    </div>
  );
}
