import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProfileDto } from './dto/profile.dto.js';

export interface Profile {
  email: string;
  name: string | null;
}

/** The profile of the user (MEM-11): their e-mail, read only, and their name. */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<Profile> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true } });
  }

  update(userId: string, dto: ProfileDto): Promise<Profile> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: dto.name || null }, // the DTO already trimmed it: '' clears the name
      select: { email: true, name: true },
    });
  }
}
