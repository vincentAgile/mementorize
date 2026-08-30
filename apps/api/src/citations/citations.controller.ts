import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CitationsService } from './citations.service.js';
import { CreateCitationDto } from './dto/create-citation.dto.js';
import { UpdateCitationDto } from './dto/update-citation.dto.js';

@Controller('citations')
export class CitationsController {
  constructor(private readonly citationsService: CitationsService) {}

  @Post()
  create(@Body() dto: CreateCitationDto) {
    return this.citationsService.create(dto);
  }

  @Get()
  findAll() {
    return this.citationsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.citationsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCitationDto) {
    return this.citationsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.citationsService.remove(id);
  }
}
