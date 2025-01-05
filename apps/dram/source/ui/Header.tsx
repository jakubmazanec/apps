import {Logo} from './Logo.js';
import {Menu} from './Menu.js';

export function Header() {
  return (
    <header className="fixed left-0 right-0 top-0 z-20 flex items-center justify-between gap-x-6 bg-orange-300 px-4 py-2 text-white">
      <Logo />
      <Menu />
    </header>
  );
}
