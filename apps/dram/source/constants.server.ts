import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const appRootPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
