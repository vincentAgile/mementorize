import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProfileDto } from './dto/profile.dto.js';

export interface Profile {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const PROFILE_FIELDS = { email: true, firstName: true, lastName: true } as const;

/** The profile of the user (MEM-11): their e-mail, read only, first name and last name. */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  get(userId: string): Promise<Profile> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: PROFILE_FIELDS });
  }

  update(userId: string, dto: ProfileDto): Promise<Profile> {
    return this.prisma.user.update({
      where: { id: userId },
      // The DTO already trimmed them: an empty string clears the value.
      data: { firstName: dto.firstName || null, lastName: dto.lastName || null },
      select: PROFILE_FIELDS,
    });
  }
}
