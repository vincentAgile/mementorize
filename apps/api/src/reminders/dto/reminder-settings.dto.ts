import { IsBoolean, IsInt, IsString, Max, Min, Validate } from 'class-validator';
import { TimeZoneConstraint } from './time-zone.constraint.js';

export class ReminderSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;

  @IsString()
  @Validate(TimeZoneConstraint)
  timeZone: string;
}

export class UnsubscribeDto {
  @IsString()
  user: string;

  @IsString()
  token: string;
}
