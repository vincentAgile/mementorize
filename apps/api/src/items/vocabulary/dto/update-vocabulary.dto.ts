import { PartialType } from '@nestjs/mapped-types';
import { CreateVocabularyDto } from './create-vocabulary.dto.js';

export class UpdateVocabularyDto extends PartialType(CreateVocabularyDto) {}
