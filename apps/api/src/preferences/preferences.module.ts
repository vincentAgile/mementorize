import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';

@Module({
  imports: [AuthModule, ConversationsModule], // MEM-144: chatAiAvailable
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
