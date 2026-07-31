import { randomUUID } from 'node:crypto';
import { ConflictError, EntityExistsError } from '../facades/TableStorageFacade.js';
import { DEFAULT_COVERAGE_GROUPS, DEFAULT_SETTINGS } from './defaultTemplate.js';

/** Thrown for expected onboarding failures; `reason` lets callers render a specific message. */
export class OnboardingError extends Error {
    constructor(message, reason) {
        super(message);
        this.reason = reason;
    }
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {string} userId
 * @returns {Promise<{linked: false}|{linked: true, role: string, company: object}>}
 */
export async function getLinkStatus(facade, userId) {
    const link = await facade.getUserLink(userId);
    if (!link) {
        return { linked: false };
    }
    const company = await facade.getCompany(link.companyId);
    return { linked: true, role: link.role, company };
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ userId: string, name: string }} params
 */
export async function createCompanyForUser(facade, { userId, name }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
        throw new OnboardingError('Company name is required.', 'invalid-name');
    }

    await assertUnlinked(facade, userId);

    const createdAt = new Date().toISOString();
    const company = await facade.createCompany({
        id: randomUUID(),
        name: trimmedName,
        subscriptionStatus: 'trial',
        defaultCoverageGroups: DEFAULT_COVERAGE_GROUPS,
        defaultSettings: DEFAULT_SETTINGS,
        createdAt
    });

    await linkUser(facade, { userId, companyId: company.id, role: 'Admin', locationIds: [], createdAt });

    return { company, role: 'Admin' };
}

/**
 * @param {import('../facades/TableStorageFacade.js').TableStorageFacade} facade
 * @param {{ userId: string, code: string }} params
 */
export async function redeemInviteForUser(facade, { userId, code }) {
    const trimmedCode = (code || '').trim();
    if (!trimmedCode) {
        throw new OnboardingError('An invite code is required.', 'invalid-code');
    }

    await assertUnlinked(facade, userId);

    const invite = await facade.getInviteCode(trimmedCode);
    if (!invite) {
        throw new OnboardingError('That invite code is not valid.', 'invalid-code');
    }
    if (invite.used) {
        throw new OnboardingError('That invite code has already been used.', 'used-code');
    }
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
        throw new OnboardingError('That invite code has expired.', 'expired-code');
    }

    const usedAt = new Date().toISOString();
    try {
        await facade.markInviteCodeUsed(trimmedCode, { usedBy: userId, usedAt });
    } catch (err) {
        if (err instanceof ConflictError) {
            throw new OnboardingError('That invite code has already been used.', 'used-code');
        }
        throw err;
    }

    await linkUser(facade, {
        userId,
        companyId: invite.companyId,
        role: invite.role,
        locationIds: invite.locationIds,
        createdAt: usedAt
    });

    const company = await facade.getCompany(invite.companyId);
    return { company, role: invite.role };
}

async function assertUnlinked(facade, userId) {
    if (await facade.getUserLink(userId)) {
        throw new OnboardingError('This identity is already linked to a Company.', 'already-linked');
    }
}

async function linkUser(facade, { userId, companyId, role, locationIds, createdAt }) {
    try {
        await facade.createUserLink({ userId, companyId, role, locationIds, createdAt });
    } catch (err) {
        if (err instanceof EntityExistsError) {
            throw new OnboardingError('This identity is already linked to a Company.', 'already-linked');
        }
        throw err;
    }
}
