import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminController } from './admin.controller.js';
import { AdminJwtGuard } from './admin-jwt.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminCatalogEntriesController } from './catalog/admin-catalog-entries.controller.js';
import { AdminCatalogEntriesService } from './catalog/admin-catalog-entries.service.js';
import { AdminCatalogController } from './catalog/admin-catalog.controller.js';
import { AdminCatalogService } from './catalog/admin-catalog.service.js';

/** MEM-82: the administration console, apart from the users' app. */
@Module({
  controllers: [AdminController, AdminCatalogController, AdminCatalogEntriesController],
  providers: [AdminAuthService, AdminJwtGuard, AdminUsersService, AdminCatalogService, AdminCatalogEntriesService],
  exports: [AdminAuthService, AdminJwtGuard],
})
export class AdminModule {}
