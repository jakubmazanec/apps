import createServerAuth from '@edgedb/auth-remix/server';

import {client} from '../db.js';
import {options} from './auth.js';

export const auth = createServerAuth(client, options);
