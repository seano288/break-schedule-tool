import { defineConfig } from 'vitest/config';
import { TEST_TABLE_CONNECTION_STRING } from './tests/testTableConnection.js';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        globalSetup: ['./tests/globalSetup.js'],
        env: {
            TABLE_STORAGE_CONNECTION_STRING: TEST_TABLE_CONNECTION_STRING
        }
    }
});
