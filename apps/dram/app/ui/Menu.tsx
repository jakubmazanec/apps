import {type PropsWithChildren} from 'react';

export function Header({children}: PropsWithChildren) {
  return (
    <header className="fixed left-0 right-0 top-0 bg-orange-300 px-4 py-2 text-white">
      <h1 className="text-sm uppercase tracking-wide">Dram</h1>
    </header>
  );
}
