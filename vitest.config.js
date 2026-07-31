import { defineConfig } from 'vite';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        // api/ is its own npm project with its own vitest config/runner (`npm --prefix api test`).
        exclude: ['**/node_modules/**', 'api/**']
    }
});
