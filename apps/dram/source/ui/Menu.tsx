import {Link} from 'react-router';

import {auth as clientAuth} from '../services/auth.js';
import {useAuth} from '../services/useAuth.js';

export function Menu() {
  let {isSignedIn} = useAuth();

  return (
    <menu className="flex justify-between gap-x-6 text-sm">
      {isSignedIn ?
        <Link to="/notes">Notes</Link>
      : null}
      {isSignedIn ?
        <Link className="text-white " to={clientAuth.getSignoutUrl()}>
          Sign out
        </Link>
      : <Link className="text-white " to={clientAuth.getBuiltinUIUrl()}>
          Sign in
        </Link>
      }
    </menu>
  );
}
