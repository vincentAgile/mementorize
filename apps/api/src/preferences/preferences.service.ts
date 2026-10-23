import { Injectable } from '@nestjs/common';
import type { ItemType, Translator } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PreferencesDto } from './dto/preferences.dto.js';

export interface Preferences {
  homeSpace: ItemType;
  translator: Translator;
}

const SELECT = { homeSpace: true, translator: true } as const;

/** The user's preferences of the web app (MEM-6, MEM-44), stored on their account. */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<Preferences> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: SELECT });
  }

  /** Changes the preferences sent; the others stay as they are. */
  update(userId: string, dto: PreferencesDto): Promise<Preferences> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { homeSpace: dto.homeSpace, translator: dto.translator },
      select: SELECT,
    });
  }
}
