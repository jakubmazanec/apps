import {type MetaFunction} from 'react-router';

import {GameRenderer} from '../ui.js';

export const meta: MetaFunction = () => [{title: 'Headwind'}];

export default function Index() {
  return (
    <div className="p-4">
      <GameRenderer />
    </div>
  );
}
