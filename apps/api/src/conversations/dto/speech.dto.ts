import { IsString } from 'class-validator';

/** MEM-132: a sentence to read. Emptiness and length are checked by ConversationSpeech. */
export class SpeechDto {
  @IsString()
  text!: string;
}
