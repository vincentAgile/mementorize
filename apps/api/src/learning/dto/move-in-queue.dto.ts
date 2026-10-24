import { IsInt, IsString, Min } from 'class-validator';
import { QueueTypeDto } from './queue-type.js';

/**
 * An item of the learning queue to move to a position (MEM-64): 1 is the
 * head; beyond the end, last. `type`: as in QueueItemsDto (MEM-67).
 */
export class MoveInQueueDto extends QueueTypeDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(1)
  position!: number;
}
