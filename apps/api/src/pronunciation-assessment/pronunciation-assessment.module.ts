import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VoiceModule } from '../voice/voice.module.js';
import { PronunciationAssessmentController } from './pronunciation-assessment.controller.js';
import { PronunciationAssessmentService } from './pronunciation-assessment.service.js';

/** MEM-90: the pronunciation of the user, assessed through the voice layer. */
@Module({
  imports: [AuthModule, VoiceModule],
  controllers: [PronunciationAssessmentController],
  providers: [PronunciationAssessmentService],
})
export class PronunciationAssessmentModule {}
