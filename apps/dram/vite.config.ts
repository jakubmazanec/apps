/**
 * DO NOT EDIT!
 * This file was autogenerated by Carson.
 * Changes may cause incorrect behavior and will be lost when the file is regenerated.
 *
 * Run `npx carson update workspace` to regenerate.
 */

import {vitePlugin as remix} from '@remix-run/dev';
import {installGlobals} from '@remix-run/node';
import _ from 'lodash';
import {defineConfig} from 'vitest/config';

installGlobals();

export default defineConfig(
  _.merge(
    {
      server: {
        port: 5000,
        strictPort: true,
      },
      plugins: [
        !process.env.VITEST &&
          remix(
            _.merge(
              {
                future: {
                  v3_fetcherPersist: true,
                  v3_relativeSplatPath: true,
                  v3_throwAbortReason: true,
                },
              },
              {},
            ),
          ),
      ],
      test: {
        environment: 'happy-dom',
        setupFiles: ['tests/setup.ts'],
        coverage: {
          include: ['app/**'],
        },
      },
    },
    {},
  ),
);
