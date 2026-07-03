#!/usr/bin/env node
/**
 * Copies the shared Prisma schema into the calling service's ./prisma
 * directory and generates that service's own @prisma/client (used for that
 * service's own TypeScript type-checking against `@prisma/client`'s types).
 *
 * It ALSO regenerates the client inside `backend/shared/node_modules`
 * itself. This second step is the one that actually matters at runtime:
 * `backend/shared/utils/prismaClient.ts` does `import { PrismaClient } from
 * '@prisma/client'`, and Node resolves that bare specifier by walking up
 * from THAT FILE's own directory (backend/shared/utils/) - it lands on
 * backend/shared/node_modules/@prisma/client and stops there, regardless of
 * which service's entry point is actually running. Every service imports
 * the same singleton from `@shared/utils/prismaClient`, so if
 * backend/shared's own copy is stale, every service silently runs against
 * an outdated client no matter how recently each service regenerated its
 * own copy - confirmed live: `prisma.comment` (a newly-added model) was
 * `undefined` at runtime in blog-service despite blog-service's own
 * generated client being fully up to date, because the actually-resolved
 * client came from backend/shared/node_modules instead.
 *
 * Run this from a service directory (e.g.
 * `node ../shared/scripts/generate-client.js`).
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const serviceDir = process.cwd();
const sharedDir = path.join(serviceDir, '..', 'shared');
const sharedSchema = path.join(sharedDir, 'prisma', 'schema.prisma');
const targetDir = path.join(serviceDir, 'prisma');
const targetSchema = path.join(targetDir, 'schema.prisma');

if (!fs.existsSync(sharedSchema)) {
  console.error(`Shared Prisma schema not found at ${sharedSchema}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(sharedSchema, targetSchema);

// `prisma generate` only needs DATABASE_URL to be *defined* to resolve the
// schema's env("DATABASE_URL") — it never connects to it.
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/mankahi_db?schema=public',
};

function runGenerate(cwd, schemaPath, label) {
  // Resolve the prisma CLI relative to `cwd` (not `serviceDir`) so this
  // works whether generating into the service's own node_modules or into
  // backend/shared's - each has prisma installed independently.
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [cwd] });
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'generate', '--schema', schemaPath],
    { cwd, stdio: 'inherit', env }
  );
  if (result.error) {
    console.error(`Failed to run prisma generate (${label}):`, result.error);
  }
  return result.status ?? 1;
}

const serviceStatus = runGenerate(serviceDir, 'prisma/schema.prisma', 'service');
const sharedStatus = runGenerate(sharedDir, 'prisma/schema.prisma', 'shared');

process.exit(serviceStatus !== 0 ? serviceStatus : sharedStatus);
