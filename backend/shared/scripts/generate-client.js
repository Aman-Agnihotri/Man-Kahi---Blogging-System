#!/usr/bin/env node
/**
 * Copies the shared Prisma schema into the calling service's ./prisma
 * directory and generates that service's own @prisma/client, mirroring what
 * each service's Dockerfile does at image build time. Run this from a
 * service directory (e.g. `node ../shared/scripts/generate-client.js`) so
 * the generated client lands in that service's own node_modules, since each
 * service resolves @prisma/client independently.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const serviceDir = process.cwd();
const sharedSchema = path.join(serviceDir, '..', 'shared', 'prisma', 'schema.prisma');
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

// Run the service's own locally-installed prisma CLI entry point directly
// with `node`, rather than through npx or a .cmd shim — this sidesteps
// shell-quoting issues with spaces in the path on Windows.
const prismaCli = require.resolve('prisma/build/index.js', { paths: [serviceDir] });

const result = spawnSync(
  process.execPath,
  [prismaCli, 'generate', '--schema', 'prisma/schema.prisma'],
  { cwd: serviceDir, stdio: 'inherit', env }
);

if (result.error) {
  console.error('Failed to run prisma generate:', result.error);
}

process.exit(result.status ?? 1);
