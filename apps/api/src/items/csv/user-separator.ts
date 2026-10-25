import type { PrismaService } from '../../prisma/prisma.service.js';

/** The CSV separator chosen by the user in the settings (MEM-55; any single character since MEM-80). */
export async function userSeparator(prisma: PrismaService, userId: string): Promise<string> {
  const { csvDelimiter } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { csvDelimiter: true },
  });
  return csvDelimiter;
}
