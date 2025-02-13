import {type MetaFunction} from 'react-router';

export const meta: MetaFunction = () => [{title: 'Headwind'}];

export default function Index() {
  return (
    <div className="p-4">
      <h1>Headwind</h1>
      <p className="text-sm">(In development.)</p>
    </div>
  );
}
