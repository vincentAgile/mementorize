import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** The items to delete at once (MEM-59): vocabulary or quotes (MEM-69). */
export class DeleteItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10_000)
  @IsString({ each: true })
  ids!: string[];
}
