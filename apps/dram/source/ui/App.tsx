import {type PropsWithChildren} from 'react';

import {Footer} from './Footer.js';
import {Header} from './Header.js';

export function App({children}: PropsWithChildren) {
  return (
    <div className="flex min-h-screen flex-col justify-between">
      <Header />
      <main className="pb-6 pt-10">{children}</main>
      <Footer />
    </div>
  );
}
