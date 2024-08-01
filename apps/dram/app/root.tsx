import {defaultTheme, ThemeProvider} from '@jakubmazanec/ui';
import {json, type LoaderFunctionArgs} from '@remix-run/node';
import {Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData} from '@remix-run/react';

import {auth} from './services/auth.server.js';
import {authContext} from './services/authContext.js';
import {App} from './ui.js';

import './tailwind.css';

export const loader = async ({request}: LoaderFunctionArgs) => {
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();

  return json({
    isSignedIn: Boolean(isSignedIn),
  });
};

export default function Root() {
  let authData = useLoaderData<typeof loader>();

  return (
    <authContext.Provider value={authData}>
      <ThemeProvider theme={defaultTheme}>
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <Meta />
            <Links />
          </head>
          <body>
            <App>
              <Outlet />
            </App>

            <ScrollRestoration />
            <Scripts />
          </body>
        </html>
      </ThemeProvider>
    </authContext.Provider>
  );
}
