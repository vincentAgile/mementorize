import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Enveloppe le PrismaClient généré pour brancher son cycle de vie sur celui
 * de l'application Nest : connexion à l'initialisation du module, fermeture
 * propre à l'arrêt (évite de laisser des connexions Postgres ouvertes).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connexion à la base de données établie');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
