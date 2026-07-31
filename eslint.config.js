import js from '@eslint/js';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
    js.configs.recommended,
    security.configs.recommended,
    // Everything here runs in Node — all of api/ (an Azure Functions app) plus its tests.
    {
        files: ['api/src/**/*.js', 'api/tests/**/*.js'],
        languageOptions: {
            globals: globals.node
        }
    },
    {
        rules: {
            'no-console': 'warn',
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            // Allow == null / != null (idiomatic undefined+null check); require === elsewhere.
            'eqeqeq': ['error', 'always', { null: 'ignore' }],
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'security/detect-non-literal-fs-filename': 'off'
        }
    }
];
