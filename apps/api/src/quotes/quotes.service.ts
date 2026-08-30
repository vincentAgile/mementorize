import { Injectable, NotFoundException } from '@nestjs/common';
import { Quote } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { UpdateQuoteDto } from './dto/update-quote.dto.js';

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateQuoteDto): Promise<Quote> {
    return this.prisma.quote.create({ data: dto });
  }

  findAll(): Promise<Quote[]> {
    return this.prisma.quote.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Quote> {
    const quote = await this.prisma.quote.findUnique({ where: { id } });
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    return quote;
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<Quote> {
    await this.findOne(id); // clean 404 if the id doesn't exist
    return this.prisma.quote.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.quote.delete({ where: { id } });
  }
}
