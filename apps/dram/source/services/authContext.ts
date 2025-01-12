import {createContext} from 'react';

export type Auth = {
  isSignedIn: boolean;
};

export const authContext = createContext<Auth>({isSignedIn: false});
