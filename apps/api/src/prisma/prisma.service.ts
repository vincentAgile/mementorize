import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Wraps the generated PrismaClient to hook its lifecycle onto the Nest
 * application's: connect on module init, disconnect cleanly on shutdown
 * (avoids leaving open Postgres connections behind).
 *
 * Since Prisma 7, the connection goes through a "driver adapter" (here
 * @prisma/adapter-pg) instead of a URL declared in schema.prisma.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        // By default `pg` waits forever: for a free connection, and for the
        // answer to a query. If the database stops responding (typically a
        // half-open TCP connection to Docker after the computer went to
        // sleep), every request then hangs instead of failing. These limits
        // turn a hang into an error, which the API reports as a 500.
        connectionTimeoutMillis: 5_000,
        query_timeout: 10_000,
        keepAlive: true, // lets the OS detect dead connections
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
