import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

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

  /**
   * MEM-71, at creation only: true (by default), the quote goes last in the
   * learning queue ("À apprendre"); false, it is "En attente".
   */
  @IsOptional()
  @IsBoolean()
  queue?: boolean;
}
