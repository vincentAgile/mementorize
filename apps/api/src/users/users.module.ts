import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersService, ActivityService],
  exports: [UsersService, ActivityService],
})
export class UsersModule {}
