import {Menu} from './Menu.js';

export function Header() {
  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between gap-x-6 bg-orange-300 px-4 py-2 text-white">
      <h1 className="text-sm uppercase tracking-wide">Dram (preview)</h1>
      <Menu />
    </header>
  );
}
