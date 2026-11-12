import { Module } from '@nestjs/common';
import { AiListsModule } from '../ai-lists/ai-lists.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { AdminAiListsController } from './ai-lists/admin-ai-lists.controller.js';
import { AdminChatController } from './chat/admin-chat.controller.js';
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
  imports: [AiListsModule, ConversationsModule], // MEM-143, MEM-135
  controllers: [
    AdminController,
    AdminCatalogController,
    AdminCatalogEntriesController,
    AdminAiListsController,
    AdminChatController,
  ],
  providers: [AdminAuthService, AdminJwtGuard, AdminUsersService, AdminCatalogService, AdminCatalogEntriesService],
  exports: [AdminAuthService, AdminJwtGuard],
})
export class AdminModule {}
