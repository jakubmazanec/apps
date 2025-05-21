import {type PropsWithChildren} from 'react';

import {Footer} from './Footer.js';
import {Header} from './Header.js';

export function App({children}: PropsWithChildren) {
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <Header />
      <main className="pt-10 pb-6">{children}</main>
      <Footer />
    </div>
  );
}
