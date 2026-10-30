import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateQuoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  source?: string;

  /** MEM-106: the recall hint, required; not made of spaces only. */
  @IsString()
  @Matches(/\S/, { message: 'hint must not be empty' })
  @MaxLength(300)
  hint!: string;

  /**
   * MEM-71, at creation only: true (by default), the quote goes last in the
   * learning queue ("À apprendre"); false, it is "En attente".
   */
  @IsOptional()
  @IsBoolean()
  queue?: boolean;
}
