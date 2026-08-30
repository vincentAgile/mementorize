import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Enveloppe le PrismaClient généré pour brancher son cycle de vie sur celui
 * de l'application Nest : connexion à l'initialisation du module, fermeture
 * propre à l'arrêt (évite de laisser des connexions Postgres ouvertes).
 *
 * Depuis Prisma 7, la connexion passe par un "driver adapter" (ici
 * @prisma/adapter-pg) plutôt que par une URL déclarée dans schema.prisma.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion à la base de données établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
