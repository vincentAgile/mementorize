import type { PrismaService } from '../../prisma/prisma.service.js';
import { SEPARATOR_CHARS } from './csv.js';

/** The CSV separator chosen by the user in the settings (MEM-55), for the export and the import. */
export async function userSeparator(prisma: PrismaService, userId: string): Promise<string> {
  const { csvSeparator } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { csvSeparator: true },
  });
  return SEPARATOR_CHARS[csvSeparator];
}
