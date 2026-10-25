import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { AdminJwtGuard } from './admin-jwt.guard.js';
import { AdminUsersService } from './admin-users.service.js';

/** MEM-82: the administration console, apart from the users' app. */
@Module({
  controllers: [AdminController],
  providers: [AdminAuthService, AdminJwtGuard, AdminUsersService],
  exports: [AdminAuthService, AdminJwtGuard],
})
export class AdminModule {}
