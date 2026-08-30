import { PartialType } from '@nestjs/mapped-types';
import { CreateCitationDto } from './create-citation.dto.js';

export class UpdateCitationDto extends PartialType(CreateCitationDto) {}
