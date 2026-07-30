/**
 * Decodes and validates the `x-ms-client-principal` header Azure Static Web Apps
 * attaches to authenticated requests. Returns null for anything malformed so callers
 * can't accidentally treat an invalid header as a valid identity.
 */
export function parseClientPrincipal(headerValue) {
    if (!headerValue) {
        return null;
    }

    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf-8'));
    } catch {
        return null;
    }

    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
        return null;
    }

    const { identityProvider, userId, userDetails, userRoles } = decoded;
    if (!identityProvider || !userId) {
        return null;
    }

    return {
        identityProvider,
        userId,
        userDetails,
        userRoles: Array.isArray(userRoles) ? userRoles : []
    };
}
