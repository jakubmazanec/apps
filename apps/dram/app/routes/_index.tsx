import {type MetaFunction} from '@remix-run/node';

export const meta: MetaFunction = () => [{title: 'Dram'}];

export default function Index() {
  return (
    <div className="p-4">
      <h1>Dram.</h1>
      <p className="text-sm">In development.</p>
    </div>
  );
}
