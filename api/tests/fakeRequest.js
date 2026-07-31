/** Minimal @azure/functions HttpRequest stand-in for handler tests — same style as clientPrincipal.test.js's `encode`. */
export function encodePrincipal(principal) {
    return Buffer.from(JSON.stringify(principal), 'utf-8').toString('base64');
}

export function fakeRequest({ method = 'GET', principal, body = '' } = {}) {
    const headerMap = new Map();
    if (principal) {
        headerMap.set('x-ms-client-principal', encodePrincipal(principal));
    }
    return {
        method,
        headers: { get: (name) => headerMap.get(name) ?? null },
        text: async () => body
    };
}
