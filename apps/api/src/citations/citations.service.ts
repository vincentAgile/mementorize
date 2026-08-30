import { Injectable, NotFoundException } from '@nestjs/common';
import { Citation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCitationDto } from './dto/create-citation.dto.js';
import { UpdateCitationDto } from './dto/update-citation.dto.js';

@Injectable()
export class CitationsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCitationDto): Promise<Citation> {
    return this.prisma.citation.create({ data: dto });
  }

  findAll(): Promise<Citation[]> {
    return this.prisma.citation.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Citation> {
    const citation = await this.prisma.citation.findUnique({ where: { id } });
    if (!citation) {
      throw new NotFoundException(`Citation ${id} introuvable`);
    }
    return citation;
  }

  async update(id: string, dto: UpdateCitationDto): Promise<Citation> {
    await this.findOne(id); // 404 propre si l'id n'existe pas
    return this.prisma.citation.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.citation.delete({ where: { id } });
  }
}
