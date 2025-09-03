import {Links, Meta, Outlet, Scripts, ScrollRestoration} from 'react-router';

import {App} from './ui.js';

import './tailwind.css';

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width,initial-scale=1" name="viewport" />
        <Meta />
        <Links />
      </head>
      <body className="m-0 min-h-screen">
        <App>
          <Outlet />
        </App>

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
