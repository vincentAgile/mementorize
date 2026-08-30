import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCitationDto {
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
}
