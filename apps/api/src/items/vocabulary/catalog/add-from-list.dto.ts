import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/** MEM-118: the words of a predefined list to add to the vocabulary. */
export class AddFromListDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500) // a list has 500 words at most (MEM-117)
  @IsString({ each: true })
  entryIds!: string[];

  /** In the learning queue (default) or « En attente » (MEM-62), as the « Ajouter » tab. */
  @IsOptional()
  @IsBoolean()
  queue?: boolean;
}
