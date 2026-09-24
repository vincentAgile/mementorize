import { Injectable, NotFoundException } from '@nestjs/common';
import { Quote } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { UpdateQuoteDto } from './dto/update-quote.dto.js';

/**
 * Every method takes the owner's id: a user can only ever read or modify
 * their own quotes. Someone else's quote gets the same 404 as a missing
 * one, so the API doesn't reveal that it exists.
 */
@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateQuoteDto): Promise<Quote> {
    return this.prisma.quote.create({ data: { ...dto, userId } });
  }

  findAll(userId: string): Promise<Quote[]> {
    return this.prisma.quote.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(userId: string, id: string): Promise<Quote> {
    const quote = await this.prisma.quote.findFirst({ where: { id, userId } });
    if (!quote) {
      throw new NotFoundException(`Quote ${id} not found`);
    }
    return quote;
  }

  async update(userId: string, id: string, dto: UpdateQuoteDto): Promise<Quote> {
    await this.findOne(userId, id); // 404 if missing or not owned
    return this.prisma.quote.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.prisma.quote.delete({ where: { id } });
  }
}
