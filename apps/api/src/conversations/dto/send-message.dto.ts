import { IsString } from 'class-validator';

/** MEM-130: a message of the user. Its length and emptiness are checked by the service (limits of the app). */
export class SendMessageDto {
  @IsString()
  text!: string;
}
