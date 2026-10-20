import { Injectable } from '@nestjs/common';
import type { ItemType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PreferencesDto } from './dto/preferences.dto.js';

export interface Preferences {
  homeSpace: ItemType;
}

/** The user's preferences of the web app (MEM-6), stored on their account. */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<Preferences> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { homeSpace: true } });
  }

  update(userId: string, dto: PreferencesDto): Promise<Preferences> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { homeSpace: dto.homeSpace },
      select: { homeSpace: true },
    });
  }
}
