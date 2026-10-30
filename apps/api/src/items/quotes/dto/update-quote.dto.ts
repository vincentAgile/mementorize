import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateQuoteDto } from './create-quote.dto.js';

/**
 * The text, the author, the source or the recall hint (MEM-106: not empty when
 * sent); the queue is not changed by an edit (it has its own actions).
 */
export class UpdateQuoteDto extends PartialType(OmitType(CreateQuoteDto, ['queue'] as const)) {}
