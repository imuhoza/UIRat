/**
 * @file vitest.config.ts — Test Configuration
 *
 * Configuration for Vitest test runner.
 * Tests are located in the test/ directory.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
  },
});
