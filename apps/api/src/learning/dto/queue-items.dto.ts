import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** Vocabulary items to put in the learning queue or take out of it (MEM-63, MEM-64), in this order. */
export class QueueItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  ids!: string[];
}
