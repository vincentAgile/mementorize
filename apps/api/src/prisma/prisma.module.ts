import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Module global : PrismaService est injectable dans n'importe quel autre
 * module sans avoir à réimporter PrismaModule partout.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
