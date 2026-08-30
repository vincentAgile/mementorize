import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 : l'URL de connexion ne vit plus dans schema.prisma, elle est
// centralisée ici et lue par la CLI (generate, migrate, studio).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
