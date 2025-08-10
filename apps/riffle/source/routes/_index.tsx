import {type MetaFunction} from 'react-router';

export const meta: MetaFunction = () => [{title: 'riffle'}];

export default function Index() {
  return (
    <div className="p-4">
      <h1>Riffle</h1>
      <p className="text-sm">(In development.)</p>
    </div>
  );
}
