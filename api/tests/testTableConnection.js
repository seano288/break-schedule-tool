// Connection string for the Azurite Table service spawned by tests/globalSetup.js
// (port 11002, distinct from Azurite's default 10002 used by `npm run tracer:azurite`).
// Uses Azurite's well-known emulator account/key.
export const TEST_TABLE_CONNECTION_STRING =
    'DefaultEndpointsProtocol=http;' +
    'AccountName=devstoreaccount1;' +
    'AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;' +
    'TableEndpoint=http://127.0.0.1:11002/devstoreaccount1;';
