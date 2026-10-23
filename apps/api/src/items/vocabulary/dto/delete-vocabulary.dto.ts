import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** The vocabulary items to delete at once (MEM-59). */
export class DeleteVocabularyDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  ids!: string[];
}
