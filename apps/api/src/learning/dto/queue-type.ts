import { IsIn, IsOptional } from 'class-validator';
import { QUEUE_TYPES, type QueueType } from '../learning-queue.js';

/** The learning queue concerned (MEM-67): the vocabulary's, unless said otherwise. */
export class QueueTypeDto {
  @IsOptional()
  @IsIn(QUEUE_TYPES)
  type?: QueueType;
}
