import type { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

/**
 * System roles required for the platform to function (OAuth first-login,
 * default authoring/reading permissions). Seeded idempotently on every
 * init run via prisma.role.upsert - safe to run repeatedly.
 */
const SYSTEM_ROLES = ['admin', 'author', 'reader'] as const;

/**
 * Seed the system roles (admin, author, reader) idempotently.
 */
export async function seedRoles(prisma: PrismaClient): Promise<void> {
    logger.info({ roles: SYSTEM_ROLES }, 'Seeding system roles');

    for (const name of SYSTEM_ROLES) {
        // prisma.role.upsert does not report created-vs-existing without an
        // extra read, so we log a single idempotent-outcome line per role.
        await prisma.role.upsert({
            where: { name },
            update: {},
            create: {
                name,
                slug: name,
                description: `${name} role`,
                isSystem: true,
            },
        });
        logger.info(`ensured role: ${name}`);
    }

    logger.info(`Role seed complete: ${SYSTEM_ROLES.length} roles ensured`);
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { prisma, prismaHelpers } = require('../utils/prismaClient');

    seedRoles(prisma)
        .then(async () => {
            await prismaHelpers.disconnect();
            // the shared logger's rotating streams keep the event loop alive; exit explicitly (2026-07-15 hang)
            process.exit(0);
        })
        .catch(async (error: unknown) => {
            // eslint-disable-next-line no-console
            console.error('Failed to seed system roles:', error);
            await prismaHelpers.disconnect();
            process.exit(1);
        });
}
