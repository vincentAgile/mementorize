import { PartialType } from '@nestjs/mapped-types';
import { CreateQuoteDto } from './create-quote.dto.js';

export class UpdateQuoteDto extends PartialType(CreateQuoteDto) {}
