import { seedRoles } from '@shared/prisma/seed';
import { prismaMock } from './setup';

describe('seedRoles', () => {
  it('upserts admin, author, reader exactly once each, idempotently on repeat runs', async () => {
    (prismaMock.role.upsert as jest.Mock).mockResolvedValue({});

    await seedRoles(prismaMock as any);

    expect(prismaMock.role.upsert).toHaveBeenCalledTimes(3);
    for (const name of ['admin', 'author', 'reader']) {
      expect(prismaMock.role.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name },
          update: {},
        })
      );
    }

    // Second run: identical calls, no throw (upsert is a no-op on conflict).
    await expect(seedRoles(prismaMock as any)).resolves.toBeUndefined();
    expect(prismaMock.role.upsert).toHaveBeenCalledTimes(6);
  });
});
