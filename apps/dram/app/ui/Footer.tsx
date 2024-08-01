import {type PropsWithChildren} from 'react';

export function Footer({children}: PropsWithChildren) {
  return (
    <footer className="flex justify-end bg-gray-100 px-4 py-2">
      <a className="text-sm text-gray-500" href="https://mazanec.dev">
        mazanec.dev
      </a>
    </footer>
  );
}
