import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateQuoteDto } from './create-quote.dto.js';

/** The text, the author or the source; the queue is not changed by an edit (it has its own actions). */
export class UpdateQuoteDto extends PartialType(OmitType(CreateQuoteDto, ['queue'] as const)) {}
