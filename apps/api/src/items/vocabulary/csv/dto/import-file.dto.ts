import { IsString, MaxLength } from 'class-validator';

/** A CSV file to import (MEM-53), as text: the web app has checked its size and decoded it (UTF-8). */
export class ImportFileDto {
  @IsString()
  @MaxLength(1_100_000) // 1 Mo of UTF-8, at most as many characters
  content!: string;
}
