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
  // MEM-133: its limits also hold the recordings of the « Chat IA ».
  exports: [PronunciationAssessmentService, VoiceModule],
})
export class PronunciationAssessmentModule {}
