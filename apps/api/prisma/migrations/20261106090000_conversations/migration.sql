-- MEM-130: the written conversations with the AI, their messages, and the
-- number of messages per user and per local day (the daily cap). Additive
-- only: a new type and three new tables, nothing changed in the others; the
-- previous version of the API keeps working on this schema during the
-- deployment (deploy/README.md).

CREATE TYPE "ConversationRole" AS ENUM ('Assistant', 'User');

CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "ConversationRole" NOT NULL,
    "text" VARCHAR(4000) NOT NULL,
    "evaluation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_usage" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "conversation_usage_pkey" PRIMARY KEY ("userId","day")
);

CREATE INDEX "conversations_userId_updatedAt_idx" ON "conversations"("userId", "updatedAt");

CREATE INDEX "conversations_createdAt_idx" ON "conversations"("createdAt");

CREATE UNIQUE INDEX "conversation_messages_conversationId_position_key" ON "conversation_messages"("conversationId", "position");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_usage" ADD CONSTRAINT "conversation_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
