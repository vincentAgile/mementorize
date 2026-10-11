import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: the connection URL no longer lives in schema.prisma, it's
// centralized here and read by the CLI (generate, migrate, studio).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
    // Optional: only `prisma migrate diff --from-migrations` (drift check in
    // the CI) needs it. process.env rather than env(), which would make every
    // command fail when it's missing.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
