import {useContext} from 'react';

import {authContext} from './authContext.js';

export function useAuth() {
  return useContext(authContext);
}
