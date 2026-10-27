import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AzurePronunciationAssessor } from './azure-pronunciation-assessor.js';
import { PRONUNCIATION_ASSESSOR } from './pronunciation-assessor.js';

/**
 * The voice layer (MEM-90): the speech services, behind provider-free
 * interfaces. Azure when AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are set;
 * otherwise null: the assessment is off, and the web app doesn't offer it.
 */
@Module({
  providers: [
    {
      provide: PRONUNCIATION_ASSESSOR,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = String(config.get('AZURE_SPEECH_KEY') ?? '').trim();
        const region = String(config.get('AZURE_SPEECH_REGION') ?? '').trim();
        if (!key || !region) {
          new Logger('VoiceModule').log('Pronunciation assessment off (no AZURE_SPEECH_KEY / AZURE_SPEECH_REGION)');
          return null;
        }
        return new AzurePronunciationAssessor(key, region, config.get<string>('AZURE_SPEECH_ENDPOINT') || undefined);
      },
    },
  ],
  exports: [PRONUNCIATION_ASSESSOR],
})
export class VoiceModule {}
