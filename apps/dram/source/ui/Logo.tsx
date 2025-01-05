import {Spinner} from '@jakubmazanec/ui';
import {Link, useNavigation} from 'react-router';

export function Logo() {
  let {state} = useNavigation();

  return (
    <div className="flex gap-x-2">
      <Link to="/">
        <h1 className="text-sm uppercase tracking-wide">Dram (preview)</h1>
      </Link>
      {state === 'idle' ? null : <Spinner className="fill-white text-orange-200" />}
    </div>
  );
}
