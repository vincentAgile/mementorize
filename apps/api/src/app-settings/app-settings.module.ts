import { Global, Module } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service.js';

/** MEM-143: the parameters set in the console, readable from any module. */
@Global()
@Module({
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
