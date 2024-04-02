import {Links, Meta, Outlet, Scripts, ScrollRestoration} from '@remix-run/react';

import './tailwind.css';

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="m-0 min-h-screen">
        <Outlet />

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
