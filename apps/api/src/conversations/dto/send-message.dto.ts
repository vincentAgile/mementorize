import { IsObject, IsOptional, IsString } from 'class-validator';

/** MEM-130: a message of the user. Its length and emptiness are checked by the service (limits of the app). */
export class SendMessageDto {
  @IsString()
  text!: string;

  /**
   * MEM-133: the pronunciation measured while the user said the message
   * (sent only when the text is exactly the one recognized). Checked by
   * sanitizePronunciation.
   */
  @IsOptional()
  @IsObject()
  pronunciation?: Record<string, unknown>;
}
