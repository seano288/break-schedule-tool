import { describe, expect, it } from 'vitest';
import { parseClientPrincipal } from './clientPrincipal.js';
// (co-located with clientPrincipal.js, outside src/functions/ so the Functions host's
// "main" glob never tries to load this test file as a function entry point)

function encode(obj) {
    return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64');
}

describe('parseClientPrincipal', () => {
    it('returns null when the header is missing', () => {
        expect(parseClientPrincipal(null)).toBeNull();
        expect(parseClientPrincipal(undefined)).toBeNull();
        expect(parseClientPrincipal('')).toBeNull();
    });

    it('returns null when the header is not valid base64/JSON', () => {
        expect(parseClientPrincipal('not-valid-base64-json!!!')).toBeNull();
    });

    it('returns null when the decoded JSON is missing required fields', () => {
        expect(parseClientPrincipal(encode({ userDetails: 'someone' }))).toBeNull();
        expect(parseClientPrincipal(encode({ userId: 'abc123' }))).toBeNull();
        expect(parseClientPrincipal(encode({}))).toBeNull();
    });

    it('returns null when the decoded JSON is not an object', () => {
        expect(parseClientPrincipal(encode(null))).toBeNull();
        expect(parseClientPrincipal(encode('a string'))).toBeNull();
        expect(parseClientPrincipal(encode([1, 2, 3]))).toBeNull();
    });

    it('returns the identity fields for a valid header', () => {
        const header = encode({
            identityProvider: 'aad',
            userId: 'abc123',
            userDetails: 'someone@example.com',
            userRoles: ['anonymous', 'authenticated']
        });

        expect(parseClientPrincipal(header)).toEqual({
            identityProvider: 'aad',
            userId: 'abc123',
            userDetails: 'someone@example.com',
            userRoles: ['anonymous', 'authenticated']
        });
    });

    it('defaults userRoles to an empty array when absent', () => {
        const header = encode({
            identityProvider: 'aad',
            userId: 'abc123',
            userDetails: 'someone@example.com'
        });

        expect(parseClientPrincipal(header).userRoles).toEqual([]);
    });
});
