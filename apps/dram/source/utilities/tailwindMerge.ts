import {createTailwindMerge} from '@jakubmazanec/ui';

import tailwindConfig from '../tailwindConfig.js';

// TODO: fix
// @ts-expect-error -- TODO
export const tailwindMerge = createTailwindMerge(tailwindConfig);
