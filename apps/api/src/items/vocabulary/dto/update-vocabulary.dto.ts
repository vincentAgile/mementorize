import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateVocabularyDto } from './create-vocabulary.dto.js';

/** The queue is not changed by an edit (MEM-63 has its own actions). */
export class UpdateVocabularyDto extends PartialType(OmitType(CreateVocabularyDto, ['queue'] as const)) {}
