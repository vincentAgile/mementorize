import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isValidTimeZone } from '../local-time.js';

@ValidatorConstraint({ name: 'timeZone' })
export class TimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && value.length <= 64 && isValidTimeZone(value);
  }

  defaultMessage(): string {
    return 'timeZone must be an IANA time zone, e.g. Europe/Paris';
  }
}
