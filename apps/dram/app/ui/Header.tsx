import {Link} from '@remix-run/react';
import {type PropsWithChildren} from 'react';

import {auth as clientAuth} from '../services/auth.js';
import {useAuth} from '../services/useAuth.js';

export function Header({children}: PropsWithChildren) {
  let {isSignedIn} = useAuth();

  return (
    <div className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between bg-orange-300 px-4 py-2 text-white">
      <h1 className="text-sm uppercase tracking-wide">Dram (preview)</h1>
      {isSignedIn ?
        <Link className="text-white " to={clientAuth.getSignoutUrl()}>
          Sign out
        </Link>
      : <Link className="text-white " to={clientAuth.getBuiltinUIUrl()}>
          Sign in
        </Link>
      }
    </div>
  );
}
