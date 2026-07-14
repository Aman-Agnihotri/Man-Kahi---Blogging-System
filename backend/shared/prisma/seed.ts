import type { PrismaClient } from '@prisma/client';

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
    for (const name of SYSTEM_ROLES) {
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
    }
}

if (require.main === module) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { prisma, prismaHelpers } = require('../utils/prismaClient');

    seedRoles(prisma)
        .then(async () => {
            await prismaHelpers.disconnect();
        })
        .catch(async (error: unknown) => {
            // eslint-disable-next-line no-console
            console.error('Failed to seed system roles:', error);
            await prismaHelpers.disconnect();
            process.exit(1);
        });
}
