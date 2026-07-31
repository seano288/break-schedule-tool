import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TABLE_PORT = 11002;
const STARTUP_TIMEOUT_MS = 15000;

// Runs once before the whole api/ test run (see vitest.config.js `globalSetup`).
// A dedicated port keeps this from colliding with a developer's already-running
// `npm run tracer:azurite` (which uses Azurite's default port 10002).
export default async function setup() {
    const dataDir = await mkdtemp(join(tmpdir(), 'break-schedule-azurite-test-'));

    const azurite = spawn(
        process.execPath,
        [join(import.meta.dirname, '..', 'node_modules', '.bin', 'azurite-table'),
            '--tablePort', String(TABLE_PORT),
            '--location', dataDir,
            '--silent'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timed out waiting for azurite-table to start'));
        }, STARTUP_TIMEOUT_MS);

        const onData = (chunk) => {
            if (chunk.toString().includes('successfully started')) {
                clearTimeout(timer);
                resolve();
            }
        };

        azurite.stdout.on('data', onData);
        azurite.stderr.on('data', onData);
        azurite.once('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        azurite.once('exit', (code) => {
            if (code !== null && code !== 0) {
                clearTimeout(timer);
                reject(new Error(`azurite-table exited early with code ${code}`));
            }
        });
    });

    return async function teardown() {
        azurite.kill();
        await rm(dataDir, { recursive: true, force: true });
    };
}
