import {defaultTheme, ThemeProvider} from '@jakubmazanec/ui';
import {type LoaderFunctionArgs} from 'react-router';
import {Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData} from 'react-router';

import {auth} from './services/auth.server.js';
import {authContext} from './services/authContext.js';
import {App} from './ui.js';

import './tailwind.css';

export const loader = async ({request}: LoaderFunctionArgs) => {
  let session = auth.getSession(request);
  let isSignedIn = await session.isSignedIn();

  return {
    isSignedIn: Boolean(isSignedIn),
  };
};

export default function Root() {
  let authData = useLoaderData<typeof loader>();

  return (
    <authContext.Provider value={authData}>
      <ThemeProvider theme={defaultTheme}>
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta content="width=device-width,initial-scale=1" name="viewport" />
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
