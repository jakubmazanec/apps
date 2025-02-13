/**
 * DO NOT EDIT!
 * This file was autogenerated by Carson.
 * Changes may cause incorrect behavior and will be lost when the file is regenerated.
 *
 * Run `npx carson update workspace` to regenerate.
 */

import {reactRouter} from '@react-router/dev/vite';
import _ from 'lodash';
import {defineConfig} from 'vitest/config';

export default defineConfig(
  _.merge(
    {
      server: {
        port: 5000,
        strictPort: true,
      },
      plugins: [!process.env.VITEST && reactRouter()],
      test: {
        environment: 'happy-dom',
        setupFiles: ['tests/setup.ts'],
        coverage: {
          include: ['source/**'],
        },
      },
    },
    {},
  ),
);
