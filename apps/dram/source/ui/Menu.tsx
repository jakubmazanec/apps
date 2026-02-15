import {Link} from 'react-router';

export function Menu() {
  return (
    <menu className="flex justify-between gap-x-6 text-sm">
      <Link to="/notes">Notes</Link>
    </menu>
  );
}
