import { IsInt, IsString, Min } from 'class-validator';

/** An item of the learning queue to move to a position (MEM-64): 1 is the head; beyond the end, last. */
export class MoveInQueueDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(1)
  position!: number;
}
