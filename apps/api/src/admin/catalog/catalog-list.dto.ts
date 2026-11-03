import { PartialType } from '@nestjs/mapped-types';
import { LanguageLevel } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** MEM-116: a predefined list, as the console sends it. The texts are trimmed by the service. */
export class CreateCatalogListDto {
  /** Not made of spaces only; unique whatever its case (409 otherwise). */
  @IsString()
  @Matches(/\S/, { message: 'title must not be empty' })
  @MaxLength(200)
  title!: string;

  /** Optional; an empty one removes it. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsEnum(LanguageLevel)
  level!: LanguageLevel;

  /** False by default; a list without any word can't be published (409). */
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

/** Any of them; the same rules. */
export class UpdateCatalogListDto extends PartialType(CreateCatalogListDto) {}
