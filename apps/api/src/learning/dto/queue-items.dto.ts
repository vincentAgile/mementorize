import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { QueueTypeDto } from './queue-type.js';

/**
 * Items to put in the learning queue or take out of it (MEM-63, MEM-64), in
 * this order; `type`: the queue of the vocabulary (by default) or of the
 * quotes (MEM-67).
 */
export class QueueItemsDto extends QueueTypeDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  ids!: string[];
}
