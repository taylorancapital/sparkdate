// vitest.config.js
//
// Minimal vitest config for the lib/* unit suite. Server endpoints under
// api/* aren't unit-tested yet — they need Firestore + Stripe mocks; the
// natural next step is Firestore Emulator integration tests.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Lib modules are tiny CommonJS files — no setup files, no globals.
    globals: false,
    // Generous timeout for the few async tests; most are pure.
    testTimeout: 5000,
  },
});
